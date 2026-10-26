-- Financial Readiness meter: weekly habits and celebration state.

-- One row per habit per week. The unique constraint is what stops repeated check-offs from adding points.
create table public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  habit_key text not null check (habit_key in ('review_spending','check_budget','review_loans','check_repayment','update_savings')),
  week_start date not null,  -- Monday of the user's local week
  completed_at timestamptz not null default now(),
  unique (user_id, habit_key, week_start)
);
create index on public.habit_logs (user_id, week_start);

-- One row per user (id = user_id).
create table public.engagement (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  celebrated_milestone int not null default 0 check (celebrated_milestone in (0, 25, 50, 75, 100)),
  last_seen_at timestamptz,
  previous_seen_at timestamptz,
  dismissed jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  constraint engagement_id_is_user check (id = user_id)
);
create trigger engagement_touch before update on public.engagement for each row execute function public.touch_updated_at();

-- celebrated_milestone only ever increases.
create or replace function public.engagement_milestone_monotonic() returns trigger language plpgsql as $$
begin
  if new.celebrated_milestone < old.celebrated_milestone then new.celebrated_milestone = old.celebrated_milestone; end if;
  return new;
end $$;
create trigger engagement_milestone_guard before update on public.engagement for each row execute function public.engagement_milestone_monotonic();

do $$
declare t text;
begin
  foreach t in array array['habit_logs','engagement']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
  end loop;
end $$;
revoke all on public.habit_logs, public.engagement from anon;
