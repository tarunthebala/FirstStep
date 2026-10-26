/**
 * FirstStep financial calculation engine.
 *
 * Rules this module follows:
 *  - Money is accumulated in integer cents so monthly projections do not drift.
 *  - A missing input yields `null` plus a reason, never a guessed number.
 *  - Each loan is amortized on its own; results are aggregated afterward.
 *    One average rate or term is never applied across different loans.
 *  - Every estimate carries the assumptions used, so the UI can explain "How is this calculated?".
 */
import type { BudgetSettings, ExpenseCategory, IncomeSource, Loan, SavingsAccount } from './types';

export const DEFAULT_TERM_MONTHS = 120;
export const MAX_TERM_MONTHS = 600;

export const toCents = (n: number) => Math.round(n * 100);
export const fromCents = (c: number) => c / 100;
export const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Sum money values in cents. Returns null when no value is present. */
export function sumMoney(values: (number | null | undefined)[]): number | null {
  const present = values.filter(isNum);
  if (present.length === 0) return null;
  return fromCents(present.reduce((acc, v) => acc + toCents(v), 0));
}

// ───────────────────────────── Loans ─────────────────────────────

export type PaymentResult = { ok: true; payment: number } | { ok: false; reason: string };

/**
 * Standard fixed-rate amortization: P·r / (1 − (1+r)^−n), r = annual rate / 12.
 * Zero-interest loans are handled separately as P / n.
 */
export function amortizedPayment(principal: number, annualRatePct: number, termMonths: number): PaymentResult {
  if (!isNum(principal) || principal < 0) return { ok: false, reason: 'Balance must be zero or more.' };
  if (!isNum(annualRatePct) || annualRatePct < 0 || annualRatePct >= 100)
    return { ok: false, reason: 'Interest rate must be between 0% and 100%.' };
  if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > MAX_TERM_MONTHS)
    return { ok: false, reason: `Term must be a whole number of months between 1 and ${MAX_TERM_MONTHS}.` };
  if (principal === 0) return { ok: true, payment: 0 };
  const r = annualRatePct / 100 / 12;
  const raw = r === 0 ? principal / termMonths : (principal * r) / (1 - Math.pow(1 + r, -termMonths));
  return { ok: true, payment: Math.round(raw * 100) / 100 };
}

export interface ScheduleTotals {
  payment: number;
  months: number;
  totalPaid: number;
  totalInterest: number;
}

/**
 * Walks the amortization schedule month by month in cents (interest rounded to the cent each month,
 * final payment trimmed to the remaining balance). Optional extra payment shortens the schedule.
 */
export function amortizationTotals(
  principal: number,
  annualRatePct: number,
  termMonths: number,
  extraMonthly = 0,
): ScheduleTotals | null {
  const base = amortizedPayment(principal, annualRatePct, termMonths);
  if (!base.ok) return null;
  const r = annualRatePct / 100 / 12;
  let balance = toCents(principal);
  const pay = toCents(base.payment) + Math.max(0, toCents(extraMonthly));
  let paid = 0;
  let interest = 0;
  let months = 0;
  while (balance > 0 && months < MAX_TERM_MONTHS + 1) {
    const i = Math.round(balance * r);
    const due = balance + i;
    const p = Math.min(pay, due);
    if (p <= i && r > 0) break; // payment never reduces principal; not a valid schedule
    interest += i;
    paid += p;
    balance = due - p;
    months += 1;
  }
  return { payment: base.payment + Math.max(0, extraMonthly), months, totalPaid: fromCents(paid), totalInterest: fromCents(interest) };
}

export interface LoanEstimate {
  loanId: string;
  name: string;
  ok: boolean;
  payment: number | null;
  balanceUsed: number | null;
  rate: number | null;
  termMonths: number;
  termAssumed: boolean;
  totalPaid: number | null;
  totalInterest: number | null;
  missing: string[];
  assumptions: string[];
}

type LoanLike = Pick<Loan, 'id' | 'name' | 'principal' | 'interestBalance' | 'interestRate' | 'termMonths'>;

/** Balance used for a repayment estimate: principal plus any recorded unpaid interest. */
export function repaymentBalance(loan: LoanLike): { value: number | null; assumption: string | null } {
  if (!isNum(loan.principal)) return { value: null, assumption: null };
  if (isNum(loan.interestBalance) && loan.interestBalance > 0) {
    return {
      value: fromCents(toCents(loan.principal) + toCents(loan.interestBalance)),
      assumption: 'Assumes the recorded unpaid interest is added to principal when repayment starts. Your servicer may treat it differently.',
    };
  }
  return { value: loan.principal, assumption: isNum(loan.interestBalance) ? null : 'Unpaid interest is unknown, so it is not included.' };
}

export function estimateLoan(loan: LoanLike, defaultTermMonths = DEFAULT_TERM_MONTHS): LoanEstimate {
  const missing: string[] = [];
  const assumptions: string[] = [];
  const bal = repaymentBalance(loan);
  if (!isNum(loan.principal)) missing.push('outstanding principal');
  if (!isNum(loan.interestRate)) missing.push('interest rate');
  const termAssumed = !isNum(loan.termMonths);
  const termMonths = termAssumed ? defaultTermMonths : (loan.termMonths as number);
  if (termAssumed)
    assumptions.push(`Assumes a fixed ${termMonths / 12}-year (${termMonths}-month) schedule because no repayment term was entered. This is not a statement about which plan you have.`);
  if (bal.assumption) assumptions.push(bal.assumption);
  assumptions.push('Uses a fixed rate and equal monthly payments (standard amortization).');
  if (missing.length || !isNum(bal.value)) {
    return { loanId: loan.id, name: loan.name, ok: false, payment: null, balanceUsed: bal.value, rate: loan.interestRate, termMonths, termAssumed, totalPaid: null, totalInterest: null, missing, assumptions };
  }
  const totals = amortizationTotals(bal.value, loan.interestRate as number, termMonths);
  if (!totals) {
    return { loanId: loan.id, name: loan.name, ok: false, payment: null, balanceUsed: bal.value, rate: loan.interestRate, termMonths, termAssumed, totalPaid: null, totalInterest: null, missing: ['valid balance, rate and term'], assumptions };
  }
  return {
    loanId: loan.id,
    name: loan.name,
    ok: true,
    payment: totals.payment,
    balanceUsed: bal.value,
    rate: loan.interestRate,
    termMonths,
    termAssumed,
    totalPaid: totals.totalPaid,
    totalInterest: totals.totalInterest,
    missing,
    assumptions,
  };
}

export interface PortfolioEstimate {
  estimates: LoanEstimate[];
  /** Sum over loans that could be estimated; null if none could. */
  totalPayment: number | null;
  /** True when some loans were left out for missing data. */
  partial: boolean;
  missing: string[];
}

export function estimatePortfolio(loans: LoanLike[], defaultTermMonths = DEFAULT_TERM_MONTHS): PortfolioEstimate {
  if (loans.length === 0) return { estimates: [], totalPayment: null, partial: false, missing: ['Add at least one loan to estimate a payment.'] };
  const estimates = loans.map((l) => estimateLoan(l, defaultTermMonths));
  const ok = estimates.filter((e) => e.ok);
  const missing = estimates.filter((e) => !e.ok).map((e) => `${e.name}: missing ${e.missing.join(' and ')}`);
  return {
    estimates,
    totalPayment: ok.length ? sumMoney(ok.map((e) => e.payment)) : null,
    partial: ok.length > 0 && ok.length < estimates.length,
    missing,
  };
}

export function loanTotals(loans: Pick<Loan, 'principal' | 'interestBalance'>[]) {
  const principal = sumMoney(loans.map((l) => l.principal));
  const interest = sumMoney(loans.map((l) => l.interestBalance));
  const missingBalance = loans.filter((l) => !isNum(l.principal)).length;
  const total = principal === null ? null : fromCents(toCents(principal) + toCents(interest ?? 0));
  return { principal, interest, total, counted: loans.length - missingBalance, missingBalance };
}

/** Principal-weighted average rate, for information only. Never used to estimate payments. */
export function weightedAverageRate(loans: Pick<Loan, 'principal' | 'interestRate'>[]): number | null {
  const usable = loans.filter((l) => isNum(l.principal) && isNum(l.interestRate) && (l.principal as number) > 0);
  if (!usable.length) return null;
  const w = usable.reduce((a, l) => a + (l.principal as number), 0);
  const s = usable.reduce((a, l) => a + (l.principal as number) * (l.interestRate as number), 0);
  return Math.round((s / w) * 1000) / 1000;
}

/** Simple daily interest (the method federal Direct Loans describe): principal × rate ÷ 365 per day. */
export function dailyInterest(principal: number | null, annualRatePct: number | null): number | null {
  if (!isNum(principal) || !isNum(annualRatePct) || principal < 0 || annualRatePct < 0) return null;
  return (principal * annualRatePct) / 100 / 365;
}

export function interestAccrual(principal: number | null, annualRatePct: number | null, days: number): number | null {
  const d = dailyInterest(principal, annualRatePct);
  if (d === null || !isNum(days) || days < 0) return null;
  return Math.round(d * days * 100) / 100;
}

// ───────────────────────────── Budget ─────────────────────────────

export function incomeTotal(sources: Pick<IncomeSource, 'kind' | 'monthlyAmount' | 'status'>[], kind: 'current' | 'expected'): number | null {
  return sumMoney(sources.filter((s) => s.kind === kind && s.status !== 'not_available').map((s) => s.monthlyAmount));
}

export function expenseTotal(cats: Pick<ExpenseCategory, 'scope' | 'monthlyAmount'>[], scope: 'current' | 'post_grad'): number | null {
  return sumMoney(cats.filter((c) => c.scope === scope).map((c) => c.monthlyAmount));
}

/**
 * Post-graduation expenses fall back to current expenses category-by-category when the user has
 * not set a separate post-grad amount. The fallback is reported so the UI can label it.
 */
export function postGradExpenses(cats: Pick<ExpenseCategory, 'key' | 'scope' | 'monthlyAmount'>[]): { total: number | null; fellBack: string[] } {
  const post = new Map(cats.filter((c) => c.scope === 'post_grad' && isNum(c.monthlyAmount)).map((c) => [c.key, c.monthlyAmount as number]));
  const cur = new Map(cats.filter((c) => c.scope === 'current' && isNum(c.monthlyAmount)).map((c) => [c.key, c.monthlyAmount as number]));
  const keys = new Set([...post.keys(), ...cur.keys()]);
  const fellBack: string[] = [];
  const vals: number[] = [];
  for (const k of keys) {
    if (post.has(k)) vals.push(post.get(k)!);
    else {
      vals.push(cur.get(k)!);
      fellBack.push(k);
    }
  }
  return { total: vals.length ? sumMoney(vals) : null, fellBack };
}

export function accessibleSavings(accounts: Pick<SavingsAccount, 'balance' | 'accessibleForEmergencies' | 'excluded'>[]): number | null {
  return sumMoney(accounts.filter((a) => a.accessibleForEmergencies && !a.excluded).map((a) => a.balance));
}

export interface CashFlowResult {
  value: number | null;
  missing: string[];
  loanPaymentApplied: number;
  explanation: string;
}

/**
 * Cash flow = income − expenses − loan payment (only when the loan payment is not already inside expenses).
 */
export function cashFlow(input: {
  income: number | null;
  expenses: number | null;
  loanPayment: number | null;
  loanPaymentInExpenses: boolean;
  savingsContribution?: number | null;
}): CashFlowResult {
  const missing: string[] = [];
  if (!isNum(input.income)) missing.push('income');
  if (!isNum(input.expenses)) missing.push('expenses');
  const loanApplied = input.loanPaymentInExpenses || !isNum(input.loanPayment) ? 0 : (input.loanPayment as number);
  const save = isNum(input.savingsContribution) ? input.savingsContribution : 0;
  if (missing.length) {
    return { value: null, missing, loanPaymentApplied: loanApplied, explanation: `Cash flow needs ${missing.join(' and ')}.` };
  }
  const v = fromCents(toCents(input.income as number) - toCents(input.expenses as number) - toCents(loanApplied) - toCents(save));
  const parts = ['income', 'minus expenses'];
  if (loanApplied) parts.push('minus the estimated loan payment');
  else if (input.loanPaymentInExpenses) parts.push('(loan payments are already inside your expenses, so they are not subtracted twice)');
  if (save) parts.push('minus planned savings');
  return { value: v, missing, loanPaymentApplied: loanApplied, explanation: `Monthly ${parts.join(' ')}.` };
}

// ───────────────────────────── Projections ─────────────────────────────

export interface MonthRow {
  month: number; // 1-based
  income: number;
  expenses: number;
  oneTime: number;
  net: number;
  /** Projected savings, never shown below zero. */
  balance: number;
  /** How far short the scenario is at the end of this month (0 when covered). */
  shortfall: number;
}
export interface Projection {
  rows: MonthRow[];
  startingSavings: number;
  endingBalance: number;
  totalShortfall: number;
  firstShortfallMonth: number | null;
  /** Deepest gap during the projection (can be > 0 even if income later catches up). */
  peakShortfall: number;
  peakShortfallMonth: number | null;
}

export function projectMonths(opts: {
  startingSavings: number;
  horizonMonths: number;
  incomeFor: (m: number) => number;
  expensesFor: (m: number) => number;
  oneTimeFor: (m: number) => number;
}): Projection {
  const horizon = Math.max(1, Math.min(120, Math.floor(opts.horizonMonths)));
  let bal = toCents(Math.max(0, opts.startingSavings || 0));
  const rows: MonthRow[] = [];
  let first: number | null = null;
  let peak = 0;
  let peakMonth: number | null = null;
  for (let m = 1; m <= horizon; m++) {
    const inc = toCents(Math.max(0, opts.incomeFor(m)));
    const exp = toCents(Math.max(0, opts.expensesFor(m)));
    const one = toCents(Math.max(0, opts.oneTimeFor(m)));
    const net = inc - exp - one;
    bal += net;
    if (bal < 0 && first === null) first = m;
    if (-bal > peak) {
      peak = -bal;
      peakMonth = m;
    }
    rows.push({ month: m, income: fromCents(inc), expenses: fromCents(exp), oneTime: fromCents(one), net: fromCents(net), balance: fromCents(Math.max(0, bal)), shortfall: fromCents(Math.max(0, -bal)) });
  }
  return {
    rows,
    startingSavings: fromCents(toCents(Math.max(0, opts.startingSavings || 0))),
    endingBalance: fromCents(Math.max(0, bal)),
    totalShortfall: fromCents(Math.max(0, -bal)),
    firstShortfallMonth: first,
    peakShortfall: fromCents(peak),
    peakShortfallMonth: peakMonth,
  };
}

export function savingsProjection(start: number, monthly: number, months: number): number[] {
  const out: number[] = [];
  let c = toCents(Math.max(0, start));
  for (let i = 0; i < months; i++) {
    c += toCents(monthly);
    out.push(fromCents(c));
  }
  return out;
}

/** Fraction of month m (1-based, 30-day months) during which the person is employed. */
export function employedFraction(month: number, delayDays: number): number {
  const startDay = (month - 1) * 30;
  const endDay = month * 30;
  if (delayDays <= startDay) return 1;
  if (delayDays >= endDay) return 0;
  return (endDay - delayDays) / 30;
}

export interface DelayedEmploymentInput {
  startingSavings: number;
  monthlyExpenses: number;
  monthlyIncome: number;
  delayDays: number;
  movingCosts: number;
  otherOneTime: number;
  horizonMonths: number;
  monthlyLoanPayment?: number;
  loanPaymentStartMonth?: number | null;
}
export function delayedEmployment(i: DelayedEmploymentInput): Projection & { assumptions: string[] } {
  const delay = Math.max(0, Math.floor(i.delayDays || 0));
  const proj = projectMonths({
    startingSavings: i.startingSavings,
    horizonMonths: i.horizonMonths,
    incomeFor: (m) => i.monthlyIncome * employedFraction(m, delay),
    expensesFor: (m) => i.monthlyExpenses + (i.monthlyLoanPayment && i.loanPaymentStartMonth && m >= i.loanPaymentStartMonth ? i.monthlyLoanPayment : 0),
    oneTimeFor: (m) => (m === 1 ? (i.movingCosts || 0) + (i.otherOneTime || 0) : 0),
  });
  const assumptions = [
    'Months are treated as 30 days. Income starts the day after the delay ends and is prorated for that month.',
    'Income is $0 during the delay. No unemployment benefits, family support or credit are assumed.',
    'Moving and other one-time costs are paid in month 1.',
    'Expenses stay the same every month.',
    'A delayed start date does not change your grace period or repayment obligations.',
  ];
  if (i.monthlyLoanPayment && i.loanPaymentStartMonth) assumptions.push(`A loan payment of ${i.monthlyLoanPayment.toFixed(2)} is included from month ${i.loanPaymentStartMonth}, as you set it.`);
  return { ...proj, assumptions };
}

export interface UnexpectedEvent {
  label: string;
  amount: number;
  month: number;
}
export function unexpectedExpenses(i: {
  startingSavings: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  events: UnexpectedEvent[];
  incomeReductionPct: number;
  incomeReductionStart: number;
  incomeReductionMonths: number;
  horizonMonths: number;
}): Projection {
  const pct = Math.min(100, Math.max(0, i.incomeReductionPct || 0)) / 100;
  return projectMonths({
    startingSavings: i.startingSavings,
    horizonMonths: i.horizonMonths,
    incomeFor: (m) => {
      const inCut = pct > 0 && m >= i.incomeReductionStart && m < i.incomeReductionStart + i.incomeReductionMonths;
      return i.monthlyIncome * (inCut ? 1 - pct : 1);
    },
    expensesFor: () => i.monthlyExpenses,
    oneTimeFor: (m) => i.events.filter((e) => e.month === m).reduce((a, e) => a + Math.max(0, e.amount || 0), 0),
  });
}

export function practicePayment(i: { monthlyIncome: number | null; monthlyExpenses: number | null; payment: number; months: number; monthlySavingsGoal?: number }) {
  const before = cashFlow({ income: i.monthlyIncome, expenses: i.monthlyExpenses, loanPayment: null, loanPaymentInExpenses: false });
  if (before.value === null) return { ok: false as const, missing: before.missing };
  const after = fromCents(toCents(before.value) - toCents(Math.max(0, i.payment)));
  const months = Math.max(1, Math.min(120, Math.floor(i.months)));
  const saveBefore = savingsProjection(0, Math.max(0, before.value), months);
  const saveAfter = savingsProjection(0, Math.max(0, after), months);
  return {
    ok: true as const,
    before: before.value,
    after,
    paymentShareOfIncome: i.monthlyIncome && i.monthlyIncome > 0 ? i.payment / i.monthlyIncome : null,
    savedBefore: saveBefore[saveBefore.length - 1],
    savedAfter: saveAfter[saveAfter.length - 1],
    months,
  };
}

export function lifestyle(i: { baseline: Record<string, number>; adjusted: Record<string, number>; monthlyIncome: number | null; otherExpenses: number; loanPayment: number | null; months: number }) {
  const keys = Object.keys(i.baseline);
  const base = sumMoney(keys.map((k) => i.baseline[k])) ?? 0;
  const adj = sumMoney(keys.map((k) => i.adjusted[k] ?? i.baseline[k])) ?? 0;
  const freedMonthly = fromCents(toCents(base) - toCents(adj));
  const months = Math.max(1, Math.min(120, Math.floor(i.months)));
  const changes = keys
    .map((k) => ({ key: k, before: i.baseline[k], after: i.adjusted[k] ?? i.baseline[k] }))
    .filter((c) => toCents(c.before) !== toCents(c.after));
  const cfBefore = isNum(i.monthlyIncome) ? fromCents(toCents(i.monthlyIncome) - toCents(base) - toCents(i.otherExpenses)) : null;
  const cfAfter = isNum(i.monthlyIncome) ? fromCents(toCents(i.monthlyIncome) - toCents(adj) - toCents(i.otherExpenses)) : null;
  const pay = isNum(i.loanPayment) ? i.loanPayment : null;
  return {
    baselineTotal: base,
    adjustedTotal: adj,
    freedMonthly,
    freedOverPeriod: fromCents(toCents(freedMonthly) * months),
    months,
    changes,
    cashFlowBefore: cfBefore,
    cashFlowAfter: cfAfter,
    coversPaymentBefore: cfBefore !== null && pay !== null ? cfBefore >= pay : null,
    coversPaymentAfter: cfAfter !== null && pay !== null ? cfAfter >= pay : null,
  };
}

export interface RepaymentOption {
  label: string;
  termMonths: number;
  extraMonthly?: number;
}
export function compareRepayment(loans: LoanLike[], options: RepaymentOption[]) {
  const usable = loans.filter((l) => isNum(l.principal) && isNum(l.interestRate));
  const excluded = loans.filter((l) => !usable.includes(l)).map((l) => l.name);
  const results = options.map((opt) => {
    let monthly = 0;
    let paid = 0;
    let interest = 0;
    let longest = 0;
    let ok = usable.length > 0;
    for (const l of usable) {
      const bal = repaymentBalance(l).value as number;
      const t = amortizationTotals(bal, l.interestRate as number, opt.termMonths, (opt.extraMonthly ?? 0) / Math.max(1, usable.length));
      if (!t) {
        ok = false;
        continue;
      }
      monthly += toCents(t.payment);
      paid += toCents(t.totalPaid);
      interest += toCents(t.totalInterest);
      longest = Math.max(longest, t.months);
    }
    return { label: opt.label, termMonths: opt.termMonths, extraMonthly: opt.extraMonthly ?? 0, ok, monthlyPayment: ok ? fromCents(monthly) : null, totalPaid: ok ? fromCents(paid) : null, totalInterest: ok ? fromCents(interest) : null, monthsToPayoff: ok ? longest : null };
  });
  return { results, excluded, loansUsed: usable.length };
}

export function _settingsDefaults(userId: string, now: string): BudgetSettings {
  return { id: userId, userId, monthlySavingsContribution: null, studentLoanPaymentInExpenses: false, defaultTermMonths: DEFAULT_TERM_MONTHS, updatedAt: now };
}
