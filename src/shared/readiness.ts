/**
 * Financial Readiness — a transparent 0–100 score built from real preparation, in four equal parts:
 *   1. Understanding and verifying student loans        25
 *   2. Reviewing income, expenses and a monthly budget   25
 *   3. Creating a realistic repayment strategy           25
 *   4. Maintaining helpful financial habits              25
 *
 * Rules:
 *  - Every point comes from saved data or a completed action. Logging in or opening a page earns nothing.
 *  - Weekly habits count once per habit per week (duplicates can't add points), at most three per week.
 *    Habit credit accumulates; it never decays, so missing a day or a week never lowers the score.
 *  - Reaching 100% means FirstStep's preparation checklist is complete — nothing more.
 */
import { isNum } from './finance';
import type { ExpenseCategory, IncomeSource, LearningProgress, Loan, Scenario, SavingsGoal, Task, Transaction, FinancialSummary } from './types';

// ───────────── weekly habits

export const HABITS = [
  { key: 'review_spending', label: 'Review your spending', link: '/app/review', needs: null },
  { key: 'check_budget', label: 'Check your budget', link: '/app/finances#budget', needs: null },
  { key: 'review_loans', label: 'Review your loan details', link: '/app/finances#loans', needs: 'loans' },
  { key: 'check_repayment', label: 'Check your repayment plan', link: '/app/loan-planner', needs: 'plan' },
  { key: 'update_savings', label: 'Update your savings goal', link: '/app/finances#savings', needs: null },
] as const;
export type HabitKey = (typeof HABITS)[number]['key'];
export const HABIT_KEYS = HABITS.map((h) => h.key) as HabitKey[];

export interface HabitLog {
  id: string;
  userId: string;
  habitKey: HabitKey;
  /** Monday of the week the habit was done, yyyy-mm-dd (user's local calendar). */
  weekStart: string;
  completedAt: string;
}

export const HABIT_POINTS_EACH = 2;
export const HABITS_COUNTED_PER_WEEK = 3;
export const HABIT_POINTS_MAX = 20;

/** Monday of the week containing `iso` (yyyy-mm-dd). */
export function weekStartOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const day = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Points from habits: distinct (habit, week) pairs, max three per week, capped. Never decreases over time. */
export function habitPoints(logs: Pick<HabitLog, 'habitKey' | 'weekStart'>[]): number {
  const perWeek = new Map<string, Set<string>>();
  for (const l of logs) {
    if (!HABIT_KEYS.includes(l.habitKey as HabitKey)) continue;
    const s = perWeek.get(l.weekStart) ?? new Set<string>();
    s.add(l.habitKey);
    perWeek.set(l.weekStart, s);
  }
  let pts = 0;
  for (const s of perWeek.values()) pts += Math.min(s.size, HABITS_COUNTED_PER_WEEK) * HABIT_POINTS_EACH;
  return Math.min(HABIT_POINTS_MAX, pts);
}

// ───────────── score

export interface ReadinessData {
  loans: Pick<Loan, 'principal' | 'interestRate' | 'source' | 'firstPaymentDate' | 'firstPaymentDateStatus'>[];
  income: Pick<IncomeSource, 'monthlyAmount' | 'status' | 'kind'>[];
  expenses: Pick<ExpenseCategory, 'scope' | 'monthlyAmount' | 'status'>[];
  transactions: Pick<Transaction, 'reviewed' | 'excluded'>[];
  summary: Pick<FinancialSummary, 'confirmedAt'> | null;
  scenarios: Pick<Scenario, 'type'>[];
  tasks: Pick<Task, 'key' | 'status'>[];
  learning: Pick<LearningProgress, 'moduleId' | 'completed'>[];
  goals: Pick<SavingsGoal, 'id'>[];
  habits: Pick<HabitLog, 'habitKey' | 'weekStart'>[];
  estimatedMonthlyPayment: number | null;
}

export type CategoryKey = 'loans' | 'budget' | 'strategy' | 'habits';

export interface ReadinessItem {
  key: string;
  label: string;
  points: number;
  max: number;
  done: boolean;
  /** False when a prerequisite is missing (e.g. you can't verify loans you haven't added). Defaults to true. */
  available?: boolean;
  /** Copy for “Your Next Win” when this item is the best next step. */
  win: { title: string; detail: string; cta: string; link: string };
}

export interface ReadinessCategoryResult {
  key: CategoryKey;
  label: string;
  points: number;
  max: 25;
  items: ReadinessItem[];
}

export interface ReadinessResult {
  score: number;
  /** False when there isn't enough information yet for a meaningful score. */
  meaningful: boolean;
  categories: ReadinessCategoryResult[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const taskDone = (d: ReadinessData, key: string) => d.tasks.some((t) => t.key === key && t.status === 'done');

const WIN = {
  loans: (detail: string) => ({ title: 'Let’s get to know your loans.', detail, cta: 'Go to my loans', link: '/app/finances#loans' }),
  date: { title: 'Let’s pin down your first payment date.', detail: 'Find the official date in your servicer account and add it, so your timeline and reminders are accurate.', cta: 'Open Loan Planner', link: '/app/loan-planner' },
  budget: (detail: string) => ({ title: 'Let’s build a budget that works for you.', detail, cta: 'Open my budget', link: '/app/finances#budget' }),
  spending: (detail: string) => ({ title: 'Let’s see where your money is going.', detail, cta: 'Review my spending', link: '/app/review' }),
  strategy: (detail: string, link: string, cta: string) => ({ title: 'Let’s find a repayment strategy that fits your situation.', detail, cta, link }),
  savings: { title: 'Let’s set a savings target.', detail: 'A savings goal gives you something concrete to build toward before repayment starts.', cta: 'Set a goal', link: '/app/finances#savings' },
  habits: { title: 'Make this week count.', detail: 'Check off a weekly money habit. Each one you complete adds to your readiness, and your progress never resets.', cta: 'See this week’s habits', link: '/app#habits' },
};

export function computeReadiness(d: ReadinessData): ReadinessResult {
  // 1. Loans
  const n = d.loans.length;
  const complete = d.loans.filter((l) => isNum(l.principal) && isNum(l.interestRate)).length;
  const verifiedShare = taskDone(d, 'confirm_loans') ? 1 : n ? d.loans.filter((l) => l.source === 'verified').length / n : 0;
  const dateKnown = d.loans.some((l) => l.firstPaymentDate && (l.firstPaymentDateStatus === 'confirmed' || l.firstPaymentDateStatus === 'user_entered'));
  const loanItems: ReadinessItem[] = [
    { key: 'loans_added', label: 'Add your student loans', max: 4, points: n ? 4 : 0, done: n > 0, win: WIN.loans('Upload your StudentAid.gov file or add your loans, so FirstStep can show what’s ahead.') },
    { key: 'loans_complete', label: 'Every loan has a balance and interest rate', max: 6, points: n ? round1((complete / n) * 6) : 0, done: n > 0 && complete === n, available: n > 0, win: WIN.loans('Fill in any missing balances or interest rates so your estimates are complete.') },
    { key: 'loans_verified', label: 'Check your loans against your servicer', max: 10, points: n ? round1(verifiedShare * 10) : 0, done: n > 0 && verifiedShare >= 1, available: n > 0, win: WIN.loans('Compare your loans with your official servicer account, then mark each one verified.') },
    { key: 'first_payment_date', label: 'Record your first payment date', max: 5, points: dateKnown ? 5 : 0, done: dateKnown, available: n > 0, win: WIN.date },
  ];

  // 2. Budget
  const hasIncome = d.income.some((i) => isNum(i.monthlyAmount) && i.status !== 'not_available');
  const current = d.expenses.filter((e) => e.scope === 'current');
  const filled = current.filter((e) => isNum(e.monthlyAmount)).length;
  const needsReview = current.some((e) => e.status === 'needs_review');
  const unreviewedTx = d.transactions.some((t) => !t.reviewed && !t.excluded);
  const spendingReviewed = filled > 0 && !needsReview && !unreviewedTx;
  const budgetItems: ReadinessItem[] = [
    { key: 'income', label: 'Add your income or expected income', max: 6, points: hasIncome ? 6 : 0, done: hasIncome, win: WIN.budget('Add your current or expected take-home pay so FirstStep can see what fits.') },
    { key: 'expenses', label: 'Fill in your main expense categories', max: 7, points: round1((Math.min(filled, 6) / 6) * 7), done: filled >= 6, win: WIN.budget('Fill in your main monthly costs, like rent, groceries and transportation.') },
    { key: 'spending_reviewed', label: 'Review your spending categories', max: 6, points: spendingReviewed ? 6 : 0, done: spendingReviewed, available: filled > 0, win: WIN.spending(unreviewedTx ? 'A few transactions still need a category check.' : 'Mark each expense category as confirmed or estimated once you’ve looked it over.') },
    { key: 'summary_confirmed', label: 'Confirm your financial summary', max: 6, points: d.summary ? 6 : 0, done: !!d.summary, win: WIN.spending('Review your monthly summary and confirm it, so your plan is built on numbers you trust.') },
  ];

  // 3. Repayment strategy
  const hasEstimate = isNum(d.estimatedMonthlyPayment);
  const practiced = d.scenarios.some((s) => s.type === 'practice_payment') || taskDone(d, 'practice_payment');
  const compared = d.scenarios.some((s) => s.type === 'repayment_compare') || d.learning.some((l) => l.moduleId === 'understanding-repayment-plans' && l.completed) || taskDone(d, 'review_options') || taskDone(d, 'checklist_options');
  const stressTested = d.scenarios.some((s) => s.type === 'delayed_employment' || s.type === 'unexpected') || taskDone(d, 'delay_scenario');
  const strategyItems: ReadinessItem[] = [
    { key: 'payment_estimate', label: 'Get a payment estimate', max: 5, points: hasEstimate ? 5 : 0, done: hasEstimate, available: n > 0, win: WIN.strategy('Add balances and interest rates so FirstStep can estimate your monthly payment.', '/app/finances#loans', 'Complete my loans') },
    { key: 'practiced_payment', label: 'Save a practice payment in Money Lab', max: 7, points: practiced ? 7 : 0, done: practiced, win: WIN.strategy('Practice your estimated payment in Money Lab and save it, to see how it fits your budget.', '/app/money-lab?tab=practice', 'Practice a payment') },
    { key: 'compared_terms', label: 'Explore repayment options', max: 6, points: compared ? 6 : 0, done: compared, win: WIN.strategy('Compare repayment terms in Money Lab or read the repayment plans module.', '/app/money-lab?tab=compare', 'Compare options') },
    { key: 'stress_tested', label: 'Test a what-if scenario', max: 7, points: stressTested ? 7 : 0, done: stressTested, win: WIN.strategy('Try a delayed job start or a surprise expense, and save it to see how your plan holds up.', '/app/money-lab?tab=delay', 'Run a what-if') },
  ];

  // 4. Habits
  const habitPts = habitPoints(d.habits);
  const habitItems: ReadinessItem[] = [
    { key: 'savings_goal', label: 'Set a savings goal', max: 5, points: d.goals.length ? 5 : 0, done: d.goals.length > 0, win: WIN.savings },
    { key: 'weekly_habits', label: `Weekly habits (${HABIT_POINTS_EACH} points each, up to ${HABITS_COUNTED_PER_WEEK} a week)`, max: HABIT_POINTS_MAX, points: habitPts, done: habitPts >= HABIT_POINTS_MAX, win: WIN.habits },
  ];

  const cat = (key: CategoryKey, label: string, items: ReadinessItem[]): ReadinessCategoryResult => ({ key, label, max: 25, items, points: round1(items.reduce((a, i) => a + i.points, 0)) });
  const categories = [
    cat('loans', 'Understand and verify your loans', loanItems),
    cat('budget', 'Review your income, expenses and budget', budgetItems),
    cat('strategy', 'Create a realistic repayment strategy', strategyItems),
    cat('habits', 'Keep up helpful money habits', habitItems),
  ];
  const total = categories.reduce((a, c) => a + c.points, 0);
  // Round down so 100 is shown only when every item is actually complete.
  const score = Math.max(0, Math.min(100, categories.every((c) => c.items.every((i) => i.done)) ? 100 : Math.min(99, Math.floor(total))));
  const meaningful = n > 0 || hasIncome || filled > 0;
  return { score, meaningful, categories };
}

// ───────────── tiers, milestones, next win

export const MILESTONES = [25, 50, 75, 100] as const;

export interface Tier {
  key: 'start' | 'momentum' | 'progress' | 'almost' | 'ready';
  label: string;
  headline: string;
  message: string;
}

export function tierFor(score: number): Tier {
  if (score >= 100)
    return { key: 'ready', label: 'Ready for your next step', headline: 'You did that! Your repayment game plan is ready.', message: 'You’ve completed your financial readiness checklist. You understand your loans, have reviewed your budget, and have a plan for what comes next. Take a moment to appreciate how far you’ve come.' };
  if (score >= 75)
    return { key: 'almost', label: 'Almost there', headline: 'Look how far you’ve come. You’re so close!', message: 'You’ve put in the work and made real progress. Complete your final preparation steps and get your repayment game plan ready.' };
  if (score >= 50)
    return { key: 'progress', label: 'Making real progress', headline: 'You’re not just thinking about your future. You’re building it.', message: 'Your preparation is adding up, and you’re getting closer to having a clear plan for repayment. One more step gets you closer to being ready.' };
  if (score >= 25)
    return { key: 'momentum', label: 'Building momentum', headline: 'Look at you making moves!', message: 'You’re turning uncertainty into a plan. Every task you complete helps you feel more prepared for what’s ahead. Keep that momentum going!' };
  return { key: 'start', label: 'Just getting started', headline: 'Your future self will thank you for starting today.', message: 'You’re taking the first steps toward understanding your student loans and taking control of your financial future. Let’s make your first move.' };
}

/** Highest milestone reached (0 if none). */
export function milestoneReached(score: number): number {
  return [...MILESTONES].reverse().find((m) => score >= m) ?? 0;
}

export function nextMilestone(score: number): { milestone: number; pointsAway: number } | null {
  const m = MILESTONES.find((x) => score < x);
  return m ? { milestone: m, pointsAway: m - score } : null;
}

export interface NextWin {
  key: string;
  title: string;
  detail: string;
  cta: string;
  link: string;
  gain: number;
}

/**
 * The single most valuable next action: the incomplete item worth the most points, with earlier
 * categories (loans before budget before strategy) winning ties, because later steps depend on them.
 */
export function nextWin(r: ReadinessResult): NextWin {
  // Foundation first: adding loans comes before everything (most steps depend on it), and loan, budget and
  // strategy gaps outrank habits even when habits are worth more, because habits build on an existing plan.
  const candidates = r.categories.flatMap((c, ci) =>
    c.items
      .filter((item) => !item.done && item.available !== false && item.max - item.points > 0)
      .map((item, ii) => ({ item, gain: round1(item.max - item.points), priority: round1(item.max - item.points) - (c.key === 'habits' ? 15 : 0) + (item.key === 'loans_added' ? 100 : 0), order: ci * 10 + ii })),
  );
  candidates.sort((a, b) => b.priority - a.priority || a.order - b.order);
  const best = candidates[0];
  if (!best) return { key: 'complete', title: 'Your preparation is complete. Review your plan and understand the next steps.', detail: 'Look over your action plan and loan timeline so you know exactly what comes next.', cta: 'Review my plan', link: '/app/plan', gain: 0 };
  return { key: best.item.key, ...best.item.win, gain: best.gain };
}

// ───────────── celebrations of real accomplishments

export interface CelebrationInput {
  today: string; // yyyy-mm-dd, local
  habits: Pick<HabitLog, 'habitKey' | 'weekStart' | 'completedAt'>[];
  scenarios: Pick<Scenario, 'id' | 'type' | 'createdAt'>[];
  summary: Pick<FinancialSummary, 'id' | 'confirmedAt'> | null;
  lastSeenAt: string | null;
  previousSeenAt: string | null;
  dismissed: string[];
}

export interface Celebration {
  key: string;
  text: string;
}

const daysAgo = (iso: string, today: string) => (new Date(`${today}T12:00:00Z`).getTime() - new Date(iso).getTime()) / 86400000;

export function celebrations(c: CelebrationInput): Celebration[] {
  const week = weekStartOf(c.today);
  const thisWeek = new Set(c.habits.filter((h) => h.weekStart === week).map((h) => h.habitKey));
  const out: Celebration[] = [];
  if (c.previousSeenAt && c.lastSeenAt && (new Date(c.lastSeenAt).getTime() - new Date(c.previousSeenAt).getTime()) / 86400000 >= 5)
    out.push({ key: `welcome:${c.previousSeenAt}`, text: 'Welcome back! Every step forward counts. Let’s keep building.' });
  if (thisWeek.size >= 3) out.push({ key: `habits3:${week}`, text: `${thisWeek.size === 3 ? 'Three' : thisWeek.size === 4 ? 'Four' : 'Five'} habits completed this week. You’re building real momentum.` });
  const plan = c.scenarios.filter((s) => (s.type === 'practice_payment' || s.type === 'repayment_compare') && daysAgo(s.createdAt, c.today) <= 7).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (plan) out.push({ key: `repay:${plan.id}`, text: 'Your repayment plan is taking shape. You’re making your next steps clearer.' });
  if (thisWeek.has('review_spending')) out.push({ key: `spending:${week}`, text: 'You took a closer look at your spending. That’s how financial confidence starts.' });
  else if (c.summary && daysAgo(c.summary.confirmedAt, c.today) <= 7) out.push({ key: `spending:summary:${c.summary.id}`, text: 'You took a closer look at your spending. That’s how financial confidence starts.' });
  return out.filter((x) => !c.dismissed.includes(x.key));
}

export const MILESTONE_MESSAGE = 'That’s another big step toward being repayment-ready. Take a moment to recognize your progress.';
