-- FirstStep schema for Supabase (Postgres).
-- Column names are the snake_case form of the TypeScript types in src/shared/types.ts;
-- the Supabase driver converts between the two automatically.
--
-- Ownership: every user-owned table has user_id referencing auth.users and Row Level Security
-- that limits select/insert/update/delete to auth.uid() = user_id.
-- Singleton tables (profiles, onboarding, budget_settings, notification_prefs) use id = user_id.

create extension if not exists pgcrypto;

-- ───────── helper: updated_at
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ───────── profiles & onboarding
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  graduation_date date,
  graduation_status text check (graduation_status in ('planning','soon','graduated')),
  school text,
  employment_status text check (employment_status in ('student','unemployed','part_time','full_time','offer_accepted','other')),
  expected_employment_start date,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_id_is_user check (id = user_id)
);

create table public.onboarding (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- {"graduation": "...", "loans": "...", "connections": "...", "summary": "...", "plan": "..."}
  -- values: not_started | in_progress | completed | skipped | needs_attention
  steps jsonb not null,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint onboarding_id_is_user check (id = user_id)
);

-- ───────── raw imports (never edited after parsing)
create table public.loan_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  origin text not null default 'studentaid_file' check (origin in ('studentaid_file','plaid_liabilities')),
  file_name text not null,
  imported_at timestamptz not null default now(),
  status text not null check (status in ('parsed','failed','confirmed','discarded')),
  file_request_date text,
  loan_count int not null default 0,
  warnings jsonb not null default '[]',
  errors jsonb not null default '[]',
  raw jsonb not null default '[]'
);

-- ───────── user-edited / user-confirmed financial data
create table public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  loan_type text,
  category text not null default 'unknown' check (category in ('federal','private','unknown')),
  principal numeric(12,2) check (principal is null or principal >= 0),
  interest_balance numeric(12,2) check (interest_balance is null or interest_balance >= 0),
  balance_as_of date,
  interest_rate numeric(6,3) check (interest_rate is null or (interest_rate >= 0 and interest_rate < 100)),
  rate_type text,
  status text,
  repayment_plan text,
  servicer text,
  disbursement_date date,
  repayment_begin_date date,
  next_payment_due_date date,
  grace_period_end date,
  grace_period_end_status text not null default 'unknown' check (grace_period_end_status in ('confirmed','user_entered','estimated','unknown')),
  first_payment_date date,
  first_payment_date_status text not null default 'unknown' check (first_payment_date_status in ('confirmed','user_entered','estimated','unknown')),
  term_months int check (term_months is null or term_months between 1 and 600),
  source text not null check (source in ('imported','manual','estimated','verified','connected','demo')),
  import_id uuid references public.loan_imports(id) on delete set null,
  import_index int,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  kind text not null check (kind in ('current','expected')),
  monthly_amount numeric(12,2) check (monthly_amount is null or monthly_amount >= 0),
  status text not null check (status in ('confirmed','estimated','variable','not_available')),
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null check (key in ('housing','utilities','groceries','dining','transportation','insurance_health','phone_internet','subscriptions','shopping','debt_payments','other')),
  scope text not null check (scope in ('current','post_grad')),
  monthly_amount numeric(12,2) check (monthly_amount is null or monthly_amount >= 0),
  status text not null check (status in ('confirmed','estimated','needs_review')),
  source text not null,
  observed_total numeric(12,2),
  observed_months numeric(5,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, key, scope)
);

create table public.savings_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  balance numeric(12,2),
  accessible_for_emergencies boolean not null default true,
  excluded boolean not null default false,
  source text not null,
  connection_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  target_amount numeric(12,2) not null check (target_amount > 0),
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.budget_settings (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  monthly_savings_contribution numeric(12,2),
  student_loan_payment_in_expenses boolean not null default false,
  default_term_months int not null default 120 check (default_term_months between 1 and 600),
  updated_at timestamptz not null default now(),
  constraint budget_settings_id_is_user check (id = user_id)
);

-- ───────── connections & imported transactions
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('plaid')),
  kind text not null check (kind in ('bank','loan_servicer')),
  status text not null check (status in ('not_connected','connecting','connected','needs_attention','disconnected')),
  institution_name text,
  item_id text,
  accounts jsonb not null default '[]',
  last_synced_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Provider access tokens, encrypted by the app server (AES-256-GCM).
-- RLS is enabled with NO policies, so only the service role (the app server) can read or write it.
create table public.connection_secrets (
  connection_id uuid primary key references public.connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ciphertext text not null,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.connections(id) on delete set null,
  account_id text,
  date date not null,
  description text not null,
  amount numeric(12,2) not null,
  suggested_category text,
  category text not null,
  excluded boolean not null default false,
  one_time boolean not null default false,
  reviewed boolean not null default false,
  source text not null,
  created_at timestamptz not null default now()
);

-- ───────── confirmed summaries, calculated plans, generated tasks
create table public.financial_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  snapshot jsonb not null
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  summary_id uuid not null references public.financial_summaries(id) on delete cascade,
  generated_at timestamptz not null default now(),
  status text not null check (status in ('ready','failed')),
  stage text not null,
  metrics jsonb not null,
  missing jsonb not null default '[]',
  uncertainties jsonb not null default '[]',
  recommendations jsonb not null default '[]',
  error text
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  key text not null,
  stage text not null check (stage in ('understand','practice','prepare')),
  title text not null,
  reason text not null,
  priority text not null check (priority in ('high','medium','low')),
  status text not null check (status in ('open','done')),
  due_date date,
  link text not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

-- ───────── hypothetical scenarios (kept apart from baseline data)
create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  type text not null check (type in ('lifestyle','delayed_employment','unexpected','practice_payment','repayment_compare')),
  inputs jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────── learning, notifications, activity
-- Learning module content ships with the app (shared, read-only); only progress is stored.
create table public.learning_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id text not null,
  completed boolean not null default false,
  quiz_correct boolean,
  attempts int not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, module_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('task','date','onboarding','savings','review')),
  title text not null,
  body text not null,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (user_id, dedupe_key)
);

create table public.notification_prefs (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tasks boolean not null default true,
  dates boolean not null default true,
  onboarding boolean not null default true,
  savings boolean not null default true,
  review boolean not null default true,
  email_opt_in boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint notification_prefs_id_is_user check (id = user_id)
);

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  message text not null
);

-- ───────── indexes
create index on public.loans (user_id);
create index on public.loan_imports (user_id);
create index on public.income_sources (user_id);
create index on public.savings_accounts (user_id);
create index on public.savings_goals (user_id);
create index on public.connections (user_id);
create index on public.transactions (user_id, date);
create index on public.financial_summaries (user_id, confirmed_at desc);
create index on public.plans (user_id, generated_at desc);
create index on public.scenarios (user_id);
create index on public.notifications (user_id, created_at desc);
create index on public.activity (user_id, at desc);

-- ───────── updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['profiles','onboarding','loans','income_sources','expense_categories','savings_accounts','savings_goals','budget_settings','connections','scenarios','learning_progress','notification_prefs']
  loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- ───────── Row Level Security
do $$
declare t text;
begin
  foreach t in array array['profiles','onboarding','loan_imports','loans','income_sources','expense_categories','savings_accounts','savings_goals','budget_settings','connections','transactions','financial_summaries','plans','tasks','scenarios','learning_progress','notifications','notification_prefs','activity']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
  end loop;
end $$;

-- Secrets: RLS on, no policies → inaccessible to anon/authenticated roles; the service role bypasses RLS.
alter table public.connection_secrets enable row level security;
revoke all on public.connection_secrets from anon, authenticated;

-- Anonymous visitors get nothing.
revoke all on all tables in schema public from anon;
