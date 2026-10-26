/**
 * Deterministic plan generation. Given the user's confirmed data, it calculates metrics,
 * lists what is missing, works out the preparation stage, and decides which tasks apply and how urgent they are.
 * No LLM is involved. Every task carries a plain-English reason tied to the user's own data.
 */
import {
  accessibleSavings,
  cashFlow,
  estimatePortfolio,
  expenseTotal,
  incomeTotal,
  isNum,
  loanTotals,
  postGradExpenses,
} from './finance';
import { addDays, money, todayISO } from './format';
import type {
  BudgetSettings,
  ExpenseCategory,
  IncomeSource,
  Loan,
  PlanMetrics,
  PrepStage,
  Profile,
  SavingsAccount,
  SavingsGoal,
  TaskPriority,
  TaskStage,
} from './types';

export interface PlanInput {
  profile: Pick<Profile, 'graduationDate' | 'graduationStatus' | 'employmentStatus' | 'expectedEmploymentStart'>;
  loans: Loan[];
  income: IncomeSource[];
  expenses: ExpenseCategory[];
  savings: SavingsAccount[];
  goals: SavingsGoal[];
  settings: Pick<BudgetSettings, 'studentLoanPaymentInExpenses' | 'defaultTermMonths' | 'monthlySavingsContribution'>;
  today?: string;
}

export interface GeneratedTask {
  key: string;
  stage: TaskStage;
  title: string;
  reason: string;
  priority: TaskPriority;
  dueDate: string | null;
  link: string;
  alreadyDone: boolean;
}

export interface GeneratedPlan {
  stage: PrepStage;
  metrics: PlanMetrics;
  missing: string[];
  uncertainties: string[];
  recommendations: { title: string; detail: string; link: string }[];
  tasks: GeneratedTask[];
}

export function computeMetrics(i: PlanInput): PlanMetrics & { paymentPartial: boolean; postGradFellBack: string[] } {
  const totals = loanTotals(i.loans);
  const portfolio = estimatePortfolio(i.loans, i.settings.defaultTermMonths);
  const currentIncome = incomeTotal(i.income, 'current');
  const expectedIncome = incomeTotal(i.income, 'expected');
  const currentExpenses = expenseTotal(i.expenses, 'current');
  const post = postGradExpenses(i.expenses);
  const cur = cashFlow({ income: currentIncome, expenses: currentExpenses, loanPayment: null, loanPaymentInExpenses: false });
  const proj = cashFlow({
    income: expectedIncome ?? currentIncome,
    expenses: post.total,
    loanPayment: portfolio.totalPayment,
    loanPaymentInExpenses: i.settings.studentLoanPaymentInExpenses,
  });
  const savings = accessibleSavings(i.savings);

  let completeness = 0;
  if (i.loans.length) completeness += 20;
  if (i.loans.length && i.loans.every((l) => isNum(l.principal) && isNum(l.interestRate))) completeness += 20;
  if (isNum(currentIncome) || isNum(expectedIncome)) completeness += 20;
  const filled = i.expenses.filter((e) => e.scope === 'current' && isNum(e.monthlyAmount)).length;
  completeness += Math.min(20, Math.round((Math.min(filled, 5) / 5) * 20));
  if (i.savings.some((s) => isNum(s.balance))) completeness += 10;
  if (i.loans.some((l) => l.firstPaymentDateStatus === 'confirmed' || l.firstPaymentDateStatus === 'user_entered')) completeness += 10;

  return {
    totalPrincipal: totals.principal,
    totalInterestBalance: totals.interest,
    totalBalance: totals.total,
    loansCounted: totals.counted,
    loansMissingBalance: totals.missingBalance,
    estimatedMonthlyPayment: portfolio.totalPayment,
    paymentMissing: portfolio.missing,
    paymentPartial: portfolio.partial,
    currentIncome,
    expectedIncome,
    currentExpenses,
    postGradExpenses: post.total,
    postGradFellBack: post.fellBack,
    currentCashFlow: cur.value,
    projectedCashFlow: proj.value,
    accessibleSavings: savings,
    dataCompleteness: completeness,
  };
}

export function determineStage(i: PlanInput, today: string): PrepStage {
  const statuses = i.loans.map((l) => (l.status ?? '').toLowerCase());
  if (statuses.some((s) => s.includes('repayment'))) return 'repayment';
  if (i.loans.some((l) => l.firstPaymentDate && l.firstPaymentDate <= today && l.firstPaymentDateStatus !== 'unknown')) return 'repayment';
  // StudentAid.gov's "IN SCHOOL OR GRACE PERIOD" status doesn't say which one, so only a grace-only status counts here;
  // otherwise the graduation date below decides.
  if (statuses.some((s) => s.includes('grace') && !s.includes('school'))) return 'grace_period';
  const g = i.profile.graduationDate;
  if (i.profile.graduationStatus === 'graduated' || (g && g <= today)) return 'grace_period';
  if (g && g > today) return 'in_school';
  if (statuses.some((s) => s.includes('school'))) return 'in_school';
  return 'unknown';
}

export const STAGE_LABEL: Record<PrepStage, string> = {
  in_school: 'Still in school',
  grace_period: 'After graduation, before repayment',
  repayment: 'In repayment',
  unknown: 'Stage not yet known',
};

export function generatePlan(i: PlanInput): GeneratedPlan {
  const today = i.today ?? todayISO();
  const m = computeMetrics(i);
  const stage = determineStage(i, today);
  const missing: string[] = [];
  const uncertainties: string[] = [];

  const knownFirstPayment = i.loans
    .filter((l) => l.firstPaymentDate && (l.firstPaymentDateStatus === 'confirmed' || l.firstPaymentDateStatus === 'user_entered'))
    .map((l) => l.firstPaymentDate as string)
    .sort()[0] ?? null;
  const loansMissingRate = i.loans.filter((l) => !isNum(l.interestRate));
  const loansMissingPrincipal = i.loans.filter((l) => !isNum(l.principal));
  const hasIncome = isNum(m.currentIncome) || isNum(m.expectedIncome);
  const currentFilled = i.expenses.filter((e) => e.scope === 'current' && isNum(e.monthlyAmount));
  const needsReview = i.expenses.filter((e) => e.status === 'needs_review');
  const postGradSet = i.expenses.some((e) => e.scope === 'post_grad' && isNum(e.monthlyAmount));

  if (!i.loans.length) missing.push('No student loans are recorded yet.');
  if (loansMissingPrincipal.length) missing.push(`${loansMissingPrincipal.length} loan(s) have no outstanding principal.`);
  if (loansMissingRate.length) missing.push(`${loansMissingRate.length} loan(s) have no interest rate.`);
  if (i.loans.length && !knownFirstPayment) missing.push('No first payment date has been confirmed or entered.');
  if (!hasIncome) missing.push('No current or expected income is recorded.');
  if (currentFilled.length < 3) missing.push('Fewer than three expense categories have amounts.');
  if (!i.savings.some((s) => isNum(s.balance))) missing.push('No savings balance is recorded.');

  if (i.loans.some((l) => !isNum(l.termMonths)) && isNum(m.estimatedMonthlyPayment))
    uncertainties.push(`The monthly payment estimate assumes a ${i.settings.defaultTermMonths / 12}-year fixed schedule for loans without a term. Your actual plan and payment come from your servicer.`);
  if (m.paymentPartial) uncertainties.push('The payment estimate leaves out loans that are missing a balance or rate.');
  if (i.loans.some((l) => l.source === 'imported')) uncertainties.push('Imported StudentAid.gov data may not include your servicer’s most recent updates.');
  if (i.loans.some((l) => l.gracePeriodEndStatus === 'estimated' || l.firstPaymentDateStatus === 'estimated')) uncertainties.push('Some dates are estimates, not official due dates.');
  if (needsReview.length) uncertainties.push(`${needsReview.length} expense categor${needsReview.length === 1 ? 'y is' : 'ies are'} marked as needing review.`);
  if (m.postGradFellBack.length && hasIncome) uncertainties.push('Post-graduation expenses reuse your current amounts where you have not set a separate figure.');
  if (!isNum(m.expectedIncome) && isNum(m.currentIncome) && stage === 'in_school') uncertainties.push('Projected cash flow uses your current income because no post-graduation income is entered.');

  const tasks: GeneratedTask[] = [];
  const add = (t: GeneratedTask) => tasks.push(t);
  const notFullTime = i.profile.employmentStatus !== 'full_time';
  const monthlyNeed = isNum(m.postGradExpenses) ? m.postGradExpenses : m.currentExpenses;
  const thinCushion = isNum(monthlyNeed) && (!isNum(m.accessibleSavings) || m.accessibleSavings < monthlyNeed * 3);
  const shortfall = isNum(m.projectedCashFlow) && m.projectedCashFlow < 0;
  const allLoansComplete = i.loans.length > 0 && !loansMissingPrincipal.length && !loansMissingRate.length;

  // Stage 1 — Understand
  add({
    key: 'gather_loans', stage: 'understand', title: 'Gather your loan information',
    reason: !i.loans.length ? 'No loans are recorded yet, and every estimate depends on them.' : allLoansComplete ? `All ${i.loans.length} loans have a balance and a rate.` : 'Some loans are missing a balance or rate, so estimates are incomplete.',
    priority: allLoansComplete ? 'low' : 'high', dueDate: null, link: '/app/finances', alreadyDone: allLoansComplete,
  });
  if (i.loans.length) {
    const unverified = i.loans.filter((l) => l.source !== 'verified').length;
    add({
      key: 'confirm_loans', stage: 'understand', title: 'Confirm loan types and balances with your servicer',
      reason: unverified ? `${unverified} loan(s) came from an import or manual entry and have not been checked against your official servicer account.` : 'Every loan is marked as verified.',
      priority: unverified ? 'high' : 'low', dueDate: null, link: '/app/finances', alreadyDone: unverified === 0,
    });
    add({
      key: 'review_rates', stage: 'understand', title: 'Review your interest rates',
      reason: loansMissingRate.length ? `${loansMissingRate.length} loan(s) have no rate, so interest and payments cannot be estimated for them.` : 'Knowing which loan has the highest rate tells you where interest grows fastest.',
      priority: loansMissingRate.length ? 'high' : 'medium', dueDate: null, link: '/app/loan-planner', alreadyDone: false,
    });
  }
  add({
    key: 'estimate_budget', stage: 'understand', title: 'Estimate your income and expenses',
    reason: !hasIncome ? 'No income is recorded, so FirstStep cannot tell whether a payment fits your budget.' : currentFilled.length < 3 ? 'Only a few expense categories are filled in.' : 'Your income and main expenses are recorded.',
    priority: !hasIncome || currentFilled.length < 3 ? 'high' : 'low', dueDate: null, link: '/app/finances#budget', alreadyDone: hasIncome && currentFilled.length >= 3,
  });

  // Stage 2 — Practice
  add({
    key: 'build_budget', stage: 'practice', title: 'Build a post-graduation budget',
    reason: !isNum(m.expectedIncome) ? 'No expected post-graduation income is entered. Adding it lets you see how repayment fits after school.' : postGradSet ? 'You have a separate post-graduation budget.' : 'Your post-graduation budget currently reuses today’s expenses.',
    priority: !isNum(m.expectedIncome) && stage !== 'repayment' ? 'medium' : 'low', dueDate: null, link: '/app/finances#budget', alreadyDone: isNum(m.expectedIncome) && postGradSet,
  });
  if (isNum(m.estimatedMonthlyPayment)) {
    add({
      key: 'practice_payment', stage: 'practice', title: 'Practice a loan payment in Money Lab',
      reason: `Your estimated payment is about ${money(m.estimatedMonthlyPayment)} a month. Practicing it shows how much room is left in your budget.`,
      priority: shortfall ? 'high' : 'medium', dueDate: null, link: '/app/money-lab?tab=practice', alreadyDone: false,
    });
  }
  if (shortfall) {
    add({
      key: 'shortfall', stage: 'practice', title: 'Explore ways to close your projected shortfall',
      reason: `Your projected monthly cash flow after graduation is ${money(m.projectedCashFlow)}. Test changes in Money Lab without changing your saved budget.`,
      priority: 'high', dueDate: null, link: '/app/money-lab?tab=lifestyle', alreadyDone: false,
    });
  }
  if (notFullTime && stage !== 'repayment') {
    add({
      key: 'delay_scenario', stage: 'practice', title: 'Test a delayed-employment scenario',
      reason: thinCushion ? 'Your recorded savings cover less than three months of expenses, so a slow job start could be tight.' : 'Seeing how long savings last without a paycheck helps you plan for a slower job search.',
      priority: thinCushion ? 'high' : 'medium', dueDate: null, link: '/app/money-lab?tab=delay', alreadyDone: false,
    });
  }
  add({
    key: 'savings_goal', stage: 'practice', title: 'Set an emergency savings goal',
    reason: i.goals.length ? 'You have a savings goal set.' : isNum(monthlyNeed) ? `One common starting point is a few months of expenses. Yours are about ${money(monthlyNeed, { whole: true })} a month.` : 'A target gives you something concrete to save toward before repayment.',
    priority: i.goals.length ? 'low' : 'medium', dueDate: null, link: '/app/finances#savings', alreadyDone: i.goals.length > 0,
  });

  // Stage 3 — Prepare
  if (i.loans.length) {
    add({
      key: 'confirm_first_payment', stage: 'prepare', title: 'Confirm your first payment date',
      reason: knownFirstPayment ? `A first payment date of ${knownFirstPayment} is recorded.` : 'Grace periods differ by loan, so FirstStep does not guess this date. Your servicer has the official one.',
      priority: knownFirstPayment ? 'low' : 'high', dueDate: null, link: '/app/loan-planner', alreadyDone: !!knownFirstPayment,
    });
    add({
      key: 'review_options', stage: 'prepare', title: 'Review repayment options on StudentAid.gov',
      reason: 'Federal repayment plans changed on July 1, 2026. Official resources show which options apply to your loans.',
      priority: 'medium', dueDate: null, link: '/app/learn/repayment-plans', alreadyDone: false,
    });
  }
  add({
    key: 'set_reminders', stage: 'prepare', title: 'Set reminders for important dates',
    reason: knownFirstPayment ? 'You have a date recorded. Reminders help you prepare ahead of it.' : 'Turn on reminders now so they start once you record your dates.',
    priority: 'low', dueDate: null, link: '/app/settings#notifications', alreadyDone: false,
  });
  if (knownFirstPayment) {
    add({
      key: 'prepare_first_payment', stage: 'prepare', title: 'Prepare for your first payment',
      reason: 'Check your servicer account, payment method and autopay options before the first due date.',
      priority: 'medium', dueDate: addDays(knownFirstPayment, -14), link: '/app/loan-planner', alreadyDone: false,
    });
  }
  add({
    key: 'revisit_budget', stage: 'prepare', title: 'Revisit your budget before repayment begins',
    reason: 'Income and expenses often change after graduation. A fresh review keeps your plan accurate.',
    priority: 'low', dueDate: knownFirstPayment ? addDays(knownFirstPayment, -30) : null, link: '/app/review', alreadyDone: false,
  });

  // Order: unresolved data gaps first, then by priority.
  const rank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };
  tasks.sort((a, b) => Number(a.alreadyDone) - Number(b.alreadyDone) || rank[a.priority] - rank[b.priority]);

  const recommendations: GeneratedPlan['recommendations'] = [];
  if (shortfall) {
    const parts: string[] = [];
    parts.push(`expected income ${money(m.expectedIncome ?? m.currentIncome)}`);
    parts.push(`post-graduation expenses ${money(m.postGradExpenses)}`);
    if (!i.settings.studentLoanPaymentInExpenses && isNum(m.estimatedMonthlyPayment)) parts.push(`estimated loan payment ${money(m.estimatedMonthlyPayment)}`);
    recommendations.push({
      title: 'Your projected budget runs short',
      detail: `This comes from ${parts.join(', ')}. Try adjustments in Money Lab; your saved budget won’t change unless you edit it.`,
      link: '/app/money-lab?tab=lifestyle',
    });
  }
  for (const t of tasks.filter((t) => !t.alreadyDone && t.priority === 'high')) {
    if (recommendations.length >= 3) break;
    if (t.key === 'shortfall') continue;
    recommendations.push({ title: t.title, detail: t.reason, link: t.link });
  }
  if (!recommendations.length) {
    const next = tasks.find((t) => !t.alreadyDone);
    if (next) recommendations.push({ title: next.title, detail: next.reason, link: next.link });
  }

  const { paymentPartial: _p, postGradFellBack: _f, ...metrics } = m;
  return { stage, metrics, missing, uncertainties, recommendations, tasks };
}
