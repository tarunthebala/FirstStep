/**
 * Demo mode: a throwaway account filled with FICTIONAL data so visitors can explore without sharing anything.
 * Every record uses source "demo" and the UI shows a persistent "Demo — fictional data" banner.
 */
import { addDays, todayISO } from '../shared/format';
import { weekStartOf, type HabitLog } from '../shared/readiness';
import type { ExpenseCategory, IncomeSource, Loan, Onboarding, Profile, SavingsAccount, SavingsGoal, Transaction, FinancialSummary } from '../shared/types';
import { buildSnapshot, ensureUser, generateAndSavePlan, loadState, logActivity, newId, now, recomputeFromTransactions } from './services';
import type { Ctx, Store } from './store/types';

export async function seedDemo(store: Store, ctx: Ctx, email: string) {
  await ensureUser(store, ctx, email, { isDemo: true, displayName: 'Jordan (demo)' });
  const t = now();
  const today = todayISO();
  await store.update<Profile>(ctx, 'profiles', ctx.userId, {
    displayName: 'Jordan (demo)', graduationDate: addDays(today, 52), graduationStatus: 'soon', school: 'Example State University (fictional)',
    employmentStatus: 'offer_accepted', expectedEmploymentStart: addDays(today, 100), isDemo: true, updatedAt: t,
  });
  const loan = (o: Partial<Loan>): Loan => ({
    id: newId(), userId: ctx.userId, name: 'Loan', loanType: null, category: 'federal', principal: null, interestBalance: 0, balanceAsOf: today, interestRate: null,
    rateType: 'FIXED', status: 'In school or grace period', repaymentPlan: null, servicer: 'Example Servicer (fictional)', disbursementDate: null, repaymentBeginDate: null,
    nextPaymentDueDate: null, gracePeriodEnd: null, gracePeriodEndStatus: 'unknown', firstPaymentDate: null, firstPaymentDateStatus: 'unknown', termMonths: null,
    source: 'demo', importId: null, importIndex: null, notes: 'Fictional demo loan.', createdAt: t, updatedAt: t, ...o,
  });
  for (const l of [
    loan({ name: 'Direct Subsidized (2023)', loanType: 'Direct Subsidized', principal: 3500, interestRate: 5.5, disbursementDate: '2023-08-20' }),
    loan({ name: 'Direct Subsidized (2024)', loanType: 'Direct Subsidized', principal: 4500, interestRate: 6.53, disbursementDate: '2024-08-21' }),
    loan({ name: 'Direct Unsubsidized (2025)', loanType: 'Direct Unsubsidized', principal: 7000, interestBalance: 418.2, interestRate: 6.39, disbursementDate: '2025-08-20' }),
    loan({ name: 'Private loan (fictional lender)', loanType: 'Private', category: 'private', principal: 6000, interestRate: 8.25, termMonths: 120, servicer: 'Fictional Bank' }),
  ])
    await store.insert(ctx, 'loans', l);

  const inc = (o: Partial<IncomeSource>): IncomeSource => ({ id: newId(), userId: ctx.userId, label: 'Income', kind: 'current', monthlyAmount: null, status: 'estimated', source: 'demo', createdAt: t, updatedAt: t, ...o });
  await store.insert(ctx, 'income_sources', inc({ label: 'Campus job (part-time)', kind: 'current', monthlyAmount: 920, status: 'variable' }));
  await store.insert(ctx, 'income_sources', inc({ label: 'Expected take-home pay after graduation', kind: 'expected', monthlyAmount: 3250, status: 'estimated' }));

  const cats = await store.list<ExpenseCategory>(ctx, 'expense_categories');
  const current: Record<string, number> = { housing: 550, utilities: 60, groceries: 260, dining: 140, transportation: 90, insurance_health: 40, phone_internet: 45, subscriptions: 32, shopping: 95, debt_payments: 0, other: 40 };
  for (const c of cats.filter((c) => c.scope === 'current'))
    await store.update<ExpenseCategory>(ctx, 'expense_categories', c.id, { monthlyAmount: current[c.key] ?? null, status: c.key === 'dining' || c.key === 'shopping' ? 'estimated' : 'confirmed', source: 'demo' });
  const post: Record<string, number> = { housing: 1150, utilities: 120, groceries: 320, dining: 160, transportation: 260, insurance_health: 180, phone_internet: 75, subscriptions: 32, shopping: 120, other: 60 };
  for (const [key, amt] of Object.entries(post))
    await store.insert<ExpenseCategory>(ctx, 'expense_categories', { id: newId(), userId: ctx.userId, key: key as ExpenseCategory['key'], scope: 'post_grad', monthlyAmount: amt, status: 'estimated', source: 'demo', observedTotal: null, observedMonths: null, createdAt: t, updatedAt: t });

  await store.insert<SavingsAccount>(ctx, 'savings_accounts', { id: newId(), userId: ctx.userId, label: 'Savings (fictional)', balance: 2400, accessibleForEmergencies: true, excluded: false, source: 'demo', connectionAccountId: null, createdAt: t, updatedAt: t });
  await store.insert<SavingsAccount>(ctx, 'savings_accounts', { id: newId(), userId: ctx.userId, label: 'Checking buffer (fictional)', balance: 650, accessibleForEmergencies: false, excluded: false, source: 'demo', connectionAccountId: null, createdAt: t, updatedAt: t });
  await store.insert<SavingsGoal>(ctx, 'savings_goals', { id: newId(), userId: ctx.userId, label: 'Emergency fund', targetAmount: 6000, targetDate: addDays(today, 240), createdAt: t, updatedAt: t });

  const txs: [number, string, number, Transaction['category']][] = [
    [-2, 'CAMPUS PAYROLL (DEMO)', -460, 'income'], [-16, 'CAMPUS PAYROLL (DEMO)', -460, 'income'], [-32, 'CAMPUS PAYROLL (DEMO)', -460, 'income'], [-46, 'CAMPUS PAYROLL (DEMO)', -460, 'income'],
    [-3, 'MAPLE APARTMENTS RENT (DEMO)', 550, 'housing'], [-33, 'MAPLE APARTMENTS RENT (DEMO)', 550, 'housing'],
    [-5, 'CITY UTILITIES (DEMO)', 58, 'utilities'], [-6, 'HEB GROCERY (DEMO)', 72.4, 'groceries'], [-12, 'ALDI (DEMO)', 54.1, 'groceries'], [-20, 'HEB GROCERY (DEMO)', 81.25, 'groceries'],
    [-8, 'CAMPUS COFFEE (DEMO)', 6.75, 'dining'], [-14, 'TACO SPOT (DEMO)', 18.4, 'dining'], [-22, 'DOORDASH (DEMO)', 31.9, 'dining'],
    [-9, 'SHELL FUEL (DEMO)', 38, 'transportation'], [-10, 'SPOTIFY (DEMO)', 11.99, 'subscriptions'], [-11, 'NETFLIX (DEMO)', 15.49, 'subscriptions'],
    [-15, 'TRANSFER TO SAVINGS (DEMO)', 100, 'transfer'], [-18, 'BEST BUY LAPTOP CHARGER (DEMO)', 64.99, 'shopping'], [-25, 'VENMO FROM ROOMMATE (DEMO)', -35, 'uncategorized'],
  ];
  for (const [d, desc, amt, cat] of txs)
    await store.insert<Transaction>(ctx, 'transactions', {
      id: newId(), userId: ctx.userId, connectionId: null, accountId: null, date: addDays(today, d), description: desc, amount: amt, suggestedCategory: cat === 'uncategorized' ? null : cat,
      category: cat, excluded: cat === 'transfer', oneTime: desc.includes('LAPTOP'), reviewed: cat !== 'uncategorized', source: 'demo', createdAt: t,
    });
  await recomputeFromTransactions(store, ctx);

  // A little fictional habit history so the tracker has something to show.
  for (const [daysBack, key] of [[14, 'check_budget'], [14, 'review_spending'], [7, 'check_budget']] as const) {
    const weekStart = weekStartOf(addDays(today, -daysBack));
    await store.insert<HabitLog>(ctx, 'habit_logs', { id: newId(), userId: ctx.userId, habitKey: key, weekStart, completedAt: new Date(Date.now() - daysBack * 86400000).toISOString() });
  }

  const o = await store.get<Onboarding>(ctx, 'onboarding', ctx.userId);
  await store.update<Onboarding>(ctx, 'onboarding', ctx.userId, { steps: { ...o!.steps, graduation: 'completed', loans: 'completed', connections: 'skipped', summary: 'completed', plan: 'completed' }, completedAt: t, updatedAt: t });
  const s = await loadState(store, ctx);
  const summary: FinancialSummary = { id: newId(), userId: ctx.userId, confirmedAt: t, snapshot: buildSnapshot(s) };
  await store.insert(ctx, 'financial_summaries', summary);
  await generateAndSavePlan(store, ctx, summary.id);
  await logActivity(store, ctx, 'Demo account created with fictional data.');
}
