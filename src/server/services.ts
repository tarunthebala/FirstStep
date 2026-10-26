import { randomUUID } from 'node:crypto';
import { accessibleSavings, expenseTotal, incomeTotal, isNum, loanTotals, fromCents, toCents, _settingsDefaults } from '../shared/finance';
import { daysBetween, todayISO } from '../shared/format';
import { generatePlan } from '../shared/plan';
import {
  EXPENSE_KEYS,
  ONBOARDING_STEPS,
  type Activity,
  type Engagement,
  type BudgetSettings,
  type Connection,
  type ExpenseCategory,
  type ExpenseKey,
  type FinancialSummary,
  type IncomeSource,
  type LearningProgress,
  type Loan,
  type LoanImport,
  type Notification,
  type NotificationPrefs,
  type Onboarding,
  type OnboardingStepKey,
  type Plan,
  type Profile,
  type SavingsAccount,
  type SavingsGoal,
  type Scenario,
  type StepStatus,
  type Task,
  type Transaction,
} from '../shared/types';
import { HttpError } from './http';
import type { HabitLog } from '../shared/readiness';
import type { Ctx, Store } from './store/types';

export const now = () => new Date().toISOString();
export const newId = () => randomUUID();

export const STEP_PATH: Record<OnboardingStepKey, string> = {
  graduation: '/onboarding/graduation',
  loans: '/onboarding/loans',
  connections: '/onboarding/connect',
  summary: '/onboarding/review',
  plan: '/onboarding/plan',
};

export function nextOnboardingPath(o: Onboarding | null): string {
  if (!o) return STEP_PATH.graduation;
  for (const k of ONBOARDING_STEPS) {
    const s = o.steps[k];
    if (s !== 'completed' && s !== 'skipped') return STEP_PATH[k];
  }
  return '/app';
}

/** Creates the per-user singleton rows the first time a user is seen. Idempotent. */
export async function ensureUser(store: Store, ctx: Ctx, email: string, opts: { isDemo?: boolean; displayName?: string | null } = {}) {
  const t = now();
  if (!(await store.get<Profile>(ctx, 'profiles', ctx.userId))) {
    await store.insert<Profile>(ctx, 'profiles', {
      id: ctx.userId, userId: ctx.userId, email, displayName: opts.displayName ?? null, graduationDate: null, graduationStatus: null, school: null,
      employmentStatus: null, expectedEmploymentStart: null, isDemo: !!opts.isDemo, createdAt: t, updatedAt: t,
    });
  }
  if (!(await store.get<Onboarding>(ctx, 'onboarding', ctx.userId))) {
    await store.insert<Onboarding>(ctx, 'onboarding', {
      id: ctx.userId, userId: ctx.userId, completedAt: null, updatedAt: t,
      steps: { graduation: 'in_progress', loans: 'not_started', connections: 'not_started', summary: 'not_started', plan: 'not_started' },
    });
  }
  if (!(await store.get<BudgetSettings>(ctx, 'budget_settings', ctx.userId))) {
    await store.insert<BudgetSettings>(ctx, 'budget_settings', _settingsDefaults(ctx.userId, t));
  }
  if (!(await store.get<NotificationPrefs>(ctx, 'notification_prefs', ctx.userId))) {
    await store.insert<NotificationPrefs>(ctx, 'notification_prefs', { id: ctx.userId, userId: ctx.userId, tasks: true, dates: true, onboarding: true, savings: true, review: true, emailOptIn: false, updatedAt: t });
  }
  if (!(await store.get<Engagement>(ctx, 'engagement', ctx.userId))) {
    await store.insert<Engagement>(ctx, 'engagement', { id: ctx.userId, userId: ctx.userId, celebratedMilestone: 0, lastSeenAt: null, previousSeenAt: null, dismissed: [], updatedAt: t });
  }
  const cats = await store.list<ExpenseCategory>(ctx, 'expense_categories');
  for (const key of EXPENSE_KEYS) {
    if (!cats.some((c) => c.key === key && c.scope === 'current')) {
      await store.insert<ExpenseCategory>(ctx, 'expense_categories', {
        id: newId(), userId: ctx.userId, key, scope: 'current', monthlyAmount: null, status: 'estimated', source: 'manual', observedTotal: null, observedMonths: null, createdAt: t, updatedAt: t,
      });
    }
  }
}

export async function setStep(store: Store, ctx: Ctx, step: OnboardingStepKey, status: StepStatus) {
  const o = await store.get<Onboarding>(ctx, 'onboarding', ctx.userId);
  if (!o) throw new HttpError(404, 'Onboarding not found.');
  const steps = { ...o.steps, [step]: status };
  // Open the next step so the progress indicator shows where the user is.
  const idx = ONBOARDING_STEPS.indexOf(step);
  const next = ONBOARDING_STEPS[idx + 1];
  if ((status === 'completed' || status === 'skipped') && next && steps[next] === 'not_started') steps[next] = 'in_progress';
  const done = ONBOARDING_STEPS.every((k) => steps[k] === 'completed' || steps[k] === 'skipped');
  return store.update<Onboarding>(ctx, 'onboarding', ctx.userId, { steps, completedAt: done ? o.completedAt ?? now() : null, updatedAt: now() });
}

export async function logActivity(store: Store, ctx: Ctx, message: string) {
  await store.insert<Activity>(ctx, 'activity', { id: newId(), userId: ctx.userId, at: now(), message });
}

export async function loadState(store: Store, ctx: Ctx) {
  const [profile, onboarding, loans, imports, income, expenses, savings, goals, settings, transactions, connections, summaries, plans, tasks, scenarios, learning, notifications, prefs, activity, habits, engagement] = await Promise.all([
    store.get<Profile>(ctx, 'profiles', ctx.userId),
    store.get<Onboarding>(ctx, 'onboarding', ctx.userId),
    store.list<Loan>(ctx, 'loans'),
    store.list<LoanImport>(ctx, 'loan_imports'),
    store.list<IncomeSource>(ctx, 'income_sources'),
    store.list<ExpenseCategory>(ctx, 'expense_categories'),
    store.list<SavingsAccount>(ctx, 'savings_accounts'),
    store.list<SavingsGoal>(ctx, 'savings_goals'),
    store.get<BudgetSettings>(ctx, 'budget_settings', ctx.userId),
    store.list<Transaction>(ctx, 'transactions'),
    store.list<Connection>(ctx, 'connections'),
    store.list<FinancialSummary>(ctx, 'financial_summaries'),
    store.list<Plan>(ctx, 'plans'),
    store.list<Task>(ctx, 'tasks'),
    store.list<Scenario>(ctx, 'scenarios'),
    store.list<LearningProgress>(ctx, 'learning_progress'),
    store.list<Notification>(ctx, 'notifications'),
    store.get<NotificationPrefs>(ctx, 'notification_prefs', ctx.userId),
    store.list<Activity>(ctx, 'activity'),
    store.list<HabitLog>(ctx, 'habit_logs'),
    store.get<Engagement>(ctx, 'engagement', ctx.userId),
  ]);
  const byDate = <T>(key: keyof T) => (a: T, b: T) => String(b[key]).localeCompare(String(a[key]));
  return {
    profile,
    onboarding,
    loans: loans.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    imports: imports.sort(byDate<LoanImport>('importedAt')),
    income,
    expenses,
    savings,
    goals,
    settings,
    transactions: transactions.sort(byDate<Transaction>('date')),
    connections,
    summary: summaries.sort(byDate<FinancialSummary>('confirmedAt'))[0] ?? null,
    summaryHistory: summaries.map((s) => ({ id: s.id, confirmedAt: s.confirmedAt })),
    plan: plans.sort(byDate<Plan>('generatedAt'))[0] ?? null,
    planHistory: plans.map((p) => ({ id: p.id, generatedAt: p.generatedAt, status: p.status })),
    tasks,
    scenarios: scenarios.sort(byDate<Scenario>('updatedAt')),
    learning,
    notifications: notifications.sort(byDate<Notification>('createdAt')),
    prefs,
    activity: activity.sort(byDate<Activity>('at')).slice(0, 30),
    habits: habits.sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
    engagement,
  };
}
export type AppState = Awaited<ReturnType<typeof loadState>>;

// ───────────── transactions → suggested categories

const RULES: [RegExp, ExpenseKey | 'income' | 'transfer'][] = [
  [/payroll|direct dep|salary|paycheck|\bpay\b.*\bco\b|adp|gusto/i, 'income'],
  [/transfer|xfer|zelle to self|to savings|from savings|venmo cashout|online banking transfer/i, 'transfer'],
  [/rent|apartment|property mgmt|leasing|housing/i, 'housing'],
  [/electric|energy|water|gas co|utility|utilities|sewer|power/i, 'utilities'],
  [/grocery|market|heb|kroger|aldi|safeway|trader joe|whole foods|walmart supercenter|costco/i, 'groceries'],
  [/restaurant|cafe|coffee|starbucks|chipotle|doordash|uber eats|grubhub|pizza|taco|burger|mcdonald/i, 'dining'],
  [/uber|lyft|shell|exxon|chevron|fuel|parking|transit|metro|gas station|auto/i, 'transportation'],
  [/insurance|geico|state farm|progressive|pharmacy|cvs|walgreens|clinic|medical|dental|health/i, 'insurance_health'],
  [/verizon|at&t|t-mobile|comcast|xfinity|spectrum|internet|wireless|mobile/i, 'phone_internet'],
  [/netflix|spotify|hulu|disney\+|apple\.com\/bill|youtube premium|subscription|prime video|max\.com/i, 'subscriptions'],
  [/amazon|target|shop|store|mall|clothing|nike|best buy|etsy/i, 'shopping'],
  [/student loan|nelnet|mohela|aidvantage|edfinancial|navient|sallie mae|credit card payment|card payment|loan payment/i, 'debt_payments'],
];

export function suggestCategory(description: string, amount: number, plaidCategory?: string | null): Transaction['suggestedCategory'] {
  const pc = (plaidCategory ?? '').toUpperCase();
  if (pc.startsWith('TRANSFER_IN') || pc.startsWith('TRANSFER_OUT')) return 'transfer';
  if (pc === 'INCOME' || pc.startsWith('INCOME')) return 'income';
  if (pc.startsWith('LOAN_PAYMENTS')) return 'debt_payments';
  if (pc.startsWith('RENT_AND_UTILITIES_RENT')) return 'housing';
  if (pc.startsWith('RENT_AND_UTILITIES')) return 'utilities';
  if (pc.startsWith('FOOD_AND_DRINK_GROCERIES')) return 'groceries';
  if (pc.startsWith('FOOD_AND_DRINK')) return 'dining';
  if (pc.startsWith('TRANSPORTATION')) return 'transportation';
  if (pc.startsWith('MEDICAL')) return 'insurance_health';
  if (pc.startsWith('GENERAL_MERCHANDISE')) return 'shopping';
  for (const [re, cat] of RULES) {
    if (re.test(description)) {
      if (cat === 'income' && amount > 0) continue; // money out can't be income
      return cat;
    }
  }
  return amount < 0 ? null : null;
}

/**
 * Recomputes observed totals from reviewed/included transactions. Suggested monthly amounts only replace
 * values the user has not confirmed or typed in themselves; user-confirmed values are never overwritten.
 */
export async function recomputeFromTransactions(store: Store, ctx: Ctx) {
  const txs = (await store.list<Transaction>(ctx, 'transactions')).filter((t) => !t.excluded);
  if (!txs.length) return;
  const dates = txs.map((t) => t.date).sort();
  const months = Math.max(1, Math.round((daysBetween(dates[0], dates[dates.length - 1]) / 30) * 10) / 10);
  const cats = await store.list<ExpenseCategory>(ctx, 'expense_categories');
  for (const key of EXPENSE_KEYS) {
    const rel = txs.filter((t) => t.category === key && t.amount > 0);
    const observed = fromCents(rel.reduce((a, t) => a + toCents(t.amount), 0));
    const recurring = fromCents(rel.filter((t) => !t.oneTime).reduce((a, t) => a + toCents(t.amount), 0));
    const cat = cats.find((c) => c.key === key && c.scope === 'current');
    if (!cat) continue;
    // Only amounts that came from a connection (or are still empty) may be refreshed from transactions.
    const userOwned = cat.status === 'confirmed' || (cat.source !== 'connected' && isNum(cat.monthlyAmount));
    const patch: Partial<ExpenseCategory> = { observedTotal: rel.length ? observed : null, observedMonths: rel.length ? months : null, updatedAt: now() };
    if (!userOwned && rel.length) {
      patch.monthlyAmount = Math.round((recurring / months) * 100) / 100;
      patch.source = 'connected';
      patch.status = 'needs_review';
    }
    await store.update<ExpenseCategory>(ctx, 'expense_categories', cat.id, patch);
  }
  // Income: deposits the user (or the suggestion) classified as income. Transfers are never income.
  const deposits = txs.filter((t) => t.category === 'income' && t.amount < 0 && t.source === 'connected');
  const incomes = await store.list<IncomeSource>(ctx, 'income_sources');
  const auto = incomes.find((i) => i.source === 'connected' && i.kind === 'current');
  if (deposits.length) {
    const monthly = Math.round((fromCents(deposits.reduce((a, t) => a + toCents(-t.amount), 0)) / months) * 100) / 100;
    if (auto) {
      if (auto.status !== 'confirmed') await store.update<IncomeSource>(ctx, 'income_sources', auto.id, { monthlyAmount: monthly, updatedAt: now() });
    } else {
      await store.insert<IncomeSource>(ctx, 'income_sources', { id: newId(), userId: ctx.userId, label: 'Deposits identified as income (connected account)', kind: 'current', monthlyAmount: monthly, status: 'estimated', source: 'connected', createdAt: now(), updatedAt: now() });
    }
  }
}

// ───────────── summary snapshot

export function buildSnapshot(s: AppState): FinancialSummary['snapshot'] {
  const totals = loanTotals(s.loans);
  const missing: string[] = [];
  if (!s.loans.length) missing.push('No student loans recorded.');
  if (!s.income.some((i) => isNum(i.monthlyAmount) && i.status !== 'not_available')) missing.push('No income recorded.');
  if (!s.expenses.some((e) => e.scope === 'current' && isNum(e.monthlyAmount))) missing.push('No expenses recorded.');
  if (!s.savings.some((a) => isNum(a.balance))) missing.push('No savings balance recorded.');
  return {
    currentIncome: incomeTotal(s.income, 'current'),
    expectedIncome: incomeTotal(s.income, 'expected'),
    currentExpenses: expenseTotal(s.expenses, 'current'),
    postGradExpenses: expenseTotal(s.expenses, 'post_grad'),
    accessibleSavings: accessibleSavings(s.savings),
    totalLoanBalance: totals.total,
    categoryStatuses: Object.fromEntries(s.expenses.filter((e) => e.scope === 'current').map((e) => [e.key, e.status])),
    missing,
    discrepancies: findDiscrepancies(s),
  };
}

/** Compares sources without overwriting any of them. */
export function findDiscrepancies(s: AppState): string[] {
  const out: string[] = [];
  const latestImport = s.imports.find((i) => i.status === 'confirmed');
  const importedLoans = s.loans.filter((l) => l.source === 'imported');
  for (const l of importedLoans) {
    const imp = s.imports.find((i) => i.id === l.importId);
    const idx = imp && l.importIndex !== null ? l.importIndex : -1;
    const raw = imp && idx >= 0 ? imp.raw[idx] : null;
    if (raw && isNum(raw.principal) && isNum(l.principal) && Math.abs(raw.principal - l.principal) >= 0.01)
      out.push(`${l.name}: principal is ${l.principal.toFixed(2)} in FirstStep but ${raw.principal.toFixed(2)} in the StudentAid.gov file.`);
    if (raw && isNum(raw.interestRate) && isNum(l.interestRate) && Math.abs(raw.interestRate - l.interestRate) >= 0.001)
      out.push(`${l.name}: rate is ${l.interestRate}% in FirstStep but ${raw.interestRate}% in the StudentAid.gov file.`);
  }
  const connectedPayments = s.transactions.filter((t) => t.category === 'debt_payments' && !t.excluded && /student loan|nelnet|mohela|aidvantage|edfinancial|navient|sallie/i.test(t.description));
  if (connectedPayments.length && s.loans.length && s.loans.every((l) => (l.status ?? '').toLowerCase().includes('school') || (l.status ?? '').toLowerCase().includes('grace')))
    out.push('Your bank transactions show student loan payments, but your loan records say they are in school or grace. Check which loans you are paying.');
  if (latestImport?.fileRequestDate) {
    const d = latestImport.fileRequestDate.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && daysBetween(d, todayISO()) > 90) out.push(`Your StudentAid.gov file is from ${d}. Balances may have changed since then.`);
  }
  return out;
}

// ───────────── plan generation & tasks

export async function generateAndSavePlan(store: Store, ctx: Ctx, summaryId: string) {
  const s = await loadState(store, ctx);
  if (!s.profile || !s.settings) throw new HttpError(400, 'Profile is incomplete.');
  const gen = generatePlan({ profile: s.profile, loans: s.loans, income: s.income, expenses: s.expenses, savings: s.savings, goals: s.goals, settings: s.settings });
  const plan: Plan = {
    id: newId(), userId: ctx.userId, summaryId, generatedAt: now(), status: 'ready', stage: gen.stage, metrics: gen.metrics,
    missing: gen.missing, uncertainties: gen.uncertainties, recommendations: gen.recommendations, error: null,
  };
  await store.insert<Plan>(ctx, 'plans', plan);
  // Upsert tasks by key. Keep the user's completed tasks; drop open tasks that no longer apply.
  const existing = await store.list<Task>(ctx, 'tasks');
  const keys = new Set(gen.tasks.map((t) => t.key));
  for (const t of existing) if (!keys.has(t.key) && t.status === 'open' && !t.key.startsWith('checklist_')) await store.remove(ctx, 'tasks', t.id);
  for (const g of gen.tasks) {
    const ex = existing.find((t) => t.key === g.key);
    const status: Task['status'] = ex?.status === 'done' || g.alreadyDone ? 'done' : 'open';
    const fields = { planId: plan.id, stage: g.stage, title: g.title, reason: g.reason, priority: g.priority, link: g.link, status, dueDate: ex?.dueDate && ex.status === 'open' ? ex.dueDate : g.dueDate, completedAt: status === 'done' ? ex?.completedAt ?? now() : null };
    if (ex) await store.update<Task>(ctx, 'tasks', ex.id, fields);
    else await store.insert<Task>(ctx, 'tasks', { id: newId(), userId: ctx.userId, key: g.key, createdAt: now(), ...fields });
  }
  await refreshNotifications(store, ctx);
  return plan;
}

export async function refreshNotifications(store: Store, ctx: Ctx) {
  const s = await loadState(store, ctx);
  const p = s.prefs;
  if (!p) return;
  const today = todayISO();
  const want: Omit<Notification, 'id' | 'userId' | 'createdAt' | 'readAt'>[] = [];
  if (p.onboarding && s.onboarding && !s.onboarding.completedAt)
    want.push({ kind: 'onboarding', dedupeKey: 'onboarding-incomplete', title: 'Finish setting up your plan', body: 'A few setup steps are still open. Pick up where you left off.' });
  if (p.tasks)
    for (const t of s.tasks.filter((t) => t.status === 'open' && t.dueDate)) {
      const d = daysBetween(today, t.dueDate!);
      if (d >= 0 && d <= 30) want.push({ kind: 'task', dedupeKey: `task-${t.key}-${t.dueDate}`, title: `Coming up: ${t.title}`, body: `You set this for ${t.dueDate}. This is a FirstStep reminder, not a notice from your servicer.` });
    }
  if (p.dates)
    for (const l of s.loans) {
      if (l.firstPaymentDate && (l.firstPaymentDateStatus === 'confirmed' || l.firstPaymentDateStatus === 'user_entered')) {
        const d = daysBetween(today, l.firstPaymentDate);
        if (d >= 0 && d <= 60)
          want.push({ kind: 'date', dedupeKey: `first-payment-${l.id}-${l.firstPaymentDate}`, title: `First payment date in ${d} days`, body: `${l.name}: ${l.firstPaymentDate} (${l.firstPaymentDateStatus === 'confirmed' ? 'confirmed by you from your servicer' : 'entered by you'}). FirstStep can’t make or guarantee payments; check your servicer account.` });
      }
      if (l.gracePeriodEnd && l.gracePeriodEndStatus !== 'unknown') {
        const d = daysBetween(today, l.gracePeriodEnd);
        if (d >= 0 && d <= 60)
          want.push({ kind: 'date', dedupeKey: `grace-${l.id}-${l.gracePeriodEnd}`, title: `Grace period may end in ${d} days`, body: `${l.name}: ${l.gracePeriodEnd} (${l.gracePeriodEndStatus.replace('_', ' ')}). Confirm the official date with your servicer.` });
      }
    }
  if (p.savings) {
    const saved = accessibleSavings(s.savings);
    for (const g of s.goals) {
      if (!isNum(saved)) continue;
      const pctReached = saved / g.targetAmount;
      for (const m of [0.5, 1]) if (pctReached >= m) want.push({ kind: 'savings', dedupeKey: `goal-${g.id}-${m}`, title: m === 1 ? `You reached “${g.label}”` : `Halfway to “${g.label}”`, body: `Recorded accessible savings: ${saved.toFixed(2)} of ${g.targetAmount.toFixed(2)}.` });
    }
  }
  if (p.review) {
    if (s.summary && daysBetween(s.summary.confirmedAt.slice(0, 10), today) > 90)
      want.push({ kind: 'review', dedupeKey: `review-${s.summary.id}`, title: 'Time to review your numbers', body: 'Your financial summary is more than 90 days old. A quick review keeps your plan accurate.' });
    const unreviewed = s.transactions.filter((t) => !t.reviewed && !t.excluded).length;
    if (unreviewed) want.push({ kind: 'review', dedupeKey: `tx-review-${unreviewed}`, title: `${unreviewed} transactions need a category check`, body: 'Suggested categories are not always right. Review them before relying on your budget.' });
  }
  const have = new Set(s.notifications.map((n) => n.dedupeKey));
  for (const w of want) if (!have.has(w.dedupeKey)) await store.insert<Notification>(ctx, 'notifications', { id: newId(), userId: ctx.userId, createdAt: now(), readAt: null, ...w });
  // Clear the onboarding reminder once setup is done.
  if (s.onboarding?.completedAt) for (const n of s.notifications.filter((n) => n.dedupeKey === 'onboarding-incomplete')) await store.remove(ctx, 'notifications', n.id);
}
