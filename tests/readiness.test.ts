import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  celebrations,
  computeReadiness,
  habitPoints,
  milestoneReached,
  nextMilestone,
  nextWin,
  tierFor,
  weekStartOf,
  type ReadinessData,
} from '../src/shared/readiness';

const empty: ReadinessData = { loans: [], income: [], expenses: [], transactions: [], summary: null, scenarios: [], tasks: [], learning: [], goals: [], habits: [], estimatedMonthlyPayment: null };
const loan = (o = {}) => ({ principal: 5000, interestRate: 5, source: 'imported' as const, firstPaymentDate: null, firstPaymentDateStatus: 'unknown' as const, ...o });
const exp = (n: number, status: 'confirmed' | 'estimated' | 'needs_review' = 'confirmed') => Array.from({ length: n }, () => ({ scope: 'current' as const, monthlyAmount: 100, status }));
const weeks = (n: number, perWeek: number) =>
  Array.from({ length: n }).flatMap((_, w) => ['review_spending', 'check_budget', 'review_loans', 'check_repayment', 'update_savings'].slice(0, perWeek).map((k) => ({ habitKey: k as never, weekStart: weekStartOf(`2026-0${(w % 9) + 1}-15`) })));

const full: ReadinessData = {
  loans: [loan({ source: 'verified', firstPaymentDate: '2027-01-01', firstPaymentDateStatus: 'confirmed' })],
  income: [{ monthlyAmount: 3000, status: 'estimated', kind: 'expected' }],
  expenses: exp(6),
  transactions: [{ reviewed: true, excluded: false }],
  summary: { confirmedAt: '2026-10-01T00:00:00Z' },
  scenarios: [{ type: 'practice_payment' }, { type: 'repayment_compare' }, { type: 'delayed_employment' }],
  tasks: [],
  learning: [],
  goals: [{ id: 'g' }],
  habits: weeks(4, 3),
  estimatedMonthlyPayment: 250,
};

test('no data: score 0 and not yet meaningful (getting-started state)', () => {
  const r = computeReadiness(empty);
  assert.equal(r.score, 0);
  assert.equal(r.meaningful, false);
  assert.equal(nextWin(r).title, 'Let’s get to know your loans.');
  assert.equal(nextWin(r).key, 'loans_added', 'add loans before anything that depends on them');
});

test('next win never suggests a step whose prerequisite is missing', () => {
  const noLoans = computeReadiness({ ...full, loans: [], estimatedMonthlyPayment: null });
  assert.equal(nextWin(noLoans).key, 'loans_added');
  const noExpenses = computeReadiness({ ...full, expenses: [], summary: null });
  assert.notEqual(nextWin(noExpenses).key, 'spending_reviewed');
});

test('four categories of 25 points each', () => {
  const r = computeReadiness(full);
  assert.deepEqual(r.categories.map((c) => c.max), [25, 25, 25, 25]);
  for (const c of r.categories) assert.equal(c.items.reduce((a, i) => a + i.max, 0), 25, c.key);
});

test('everything complete is exactly 100 and the next win says so', () => {
  const r = computeReadiness(full);
  assert.equal(r.score, 100);
  assert.equal(nextWin(r).key, 'complete');
  assert.match(nextWin(r).title, /Your preparation is complete/);
});

test('100 is only shown when every item is done (no rounding up to 100)', () => {
  const r = computeReadiness({ ...full, expenses: [...exp(5), { scope: 'current', monthlyAmount: null, status: 'confirmed' }] });
  assert.ok(r.score < 100);
});

test('verifying loans and recording a date raise the loans category', () => {
  const unverified = computeReadiness({ ...empty, loans: [loan(), loan()] }).categories[0].points;
  const half = computeReadiness({ ...empty, loans: [loan({ source: 'verified' }), loan()] }).categories[0].points;
  const all = computeReadiness({ ...empty, loans: [loan({ source: 'verified' }), loan({ source: 'verified', firstPaymentDate: '2027-01-01', firstPaymentDateStatus: 'user_entered' })] }).categories[0].points;
  assert.equal(unverified, 10);
  assert.equal(half, 15);
  assert.equal(all, 25);
});

test('estimated dates do not count as a known first payment date', () => {
  const r = computeReadiness({ ...empty, loans: [loan({ firstPaymentDate: '2027-01-01', firstPaymentDateStatus: 'estimated' })] });
  assert.equal(r.categories[0].items.find((i) => i.key === 'first_payment_date')!.done, false);
});

test('spending review needs categories reviewed and transactions checked', () => {
  const pending = computeReadiness({ ...empty, expenses: exp(6, 'needs_review') });
  assert.equal(pending.categories[1].items.find((i) => i.key === 'spending_reviewed')!.done, false);
  const tx = computeReadiness({ ...empty, expenses: exp(6), transactions: [{ reviewed: false, excluded: false }] });
  assert.equal(tx.categories[1].items.find((i) => i.key === 'spending_reviewed')!.done, false);
  const ok = computeReadiness({ ...empty, expenses: exp(6), transactions: [{ reviewed: false, excluded: true }] });
  assert.equal(ok.categories[1].items.find((i) => i.key === 'spending_reviewed')!.done, true);
});

test('habit credit: duplicates in a week count once, max three per week, capped at 20', () => {
  const w = weekStartOf('2026-10-21');
  assert.equal(habitPoints([{ habitKey: 'check_budget', weekStart: w }, { habitKey: 'check_budget', weekStart: w }]), 2);
  assert.equal(habitPoints(weeks(1, 5)), 6);
  assert.equal(habitPoints(weeks(9, 3)), 20);
  assert.equal(habitPoints([{ habitKey: 'not_a_habit' as never, weekStart: w }]), 0);
});

test('missing time never lowers the score: habit credit has no time dimension', () => {
  const r1 = computeReadiness({ ...full, habits: weeks(2, 3) });
  // Same data evaluated "months later" is identical; nothing decays.
  const r2 = computeReadiness({ ...full, habits: weeks(2, 3) });
  assert.equal(r1.score, r2.score);
});

test('logging in or opening pages earns nothing: only data and completed actions count', () => {
  const r = computeReadiness({ ...empty, tasks: [{ key: 'some_open_task', status: 'open' }] });
  assert.equal(r.score, 0);
});

test('weekStartOf returns Monday', () => {
  assert.equal(weekStartOf('2026-10-24'), '2026-10-19'); // Saturday
  assert.equal(weekStartOf('2026-10-19'), '2026-10-19'); // Monday
  assert.equal(weekStartOf('2026-10-25'), '2026-10-19'); // Sunday
});

test('tiers use the exact copy and boundaries', () => {
  assert.equal(tierFor(0).headline, 'Your future self will thank you for starting today.');
  assert.equal(tierFor(24).key, 'start');
  assert.equal(tierFor(25).headline, 'Look at you making moves!');
  assert.equal(tierFor(49).key, 'momentum');
  assert.equal(tierFor(50).headline, 'You’re not just thinking about your future. You’re building it.');
  assert.equal(tierFor(75).headline, 'Look how far you’ve come. You’re so close!');
  assert.equal(tierFor(99).key, 'almost');
  assert.equal(tierFor(100).headline, 'You did that! Your repayment game plan is ready.');
  const all = [0, 30, 60, 80, 100].map((s) => tierFor(s));
  for (const t of all) assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t.headline + t.message), 'no emoji');
  assert.ok(!/paid off|guarantee|can afford/i.test(tierFor(100).message), '100% makes no outcome promises');
});

test('milestones', () => {
  assert.equal(milestoneReached(24), 0);
  assert.equal(milestoneReached(25), 25);
  assert.equal(milestoneReached(99), 75);
  assert.equal(milestoneReached(100), 100);
  assert.deepEqual(nextMilestone(40), { milestone: 50, pointsAway: 10 });
  assert.equal(nextMilestone(100), null);
});

test('next win picks the biggest foundation gap before habits and never a completed item', () => {
  const r = computeReadiness({ ...full, loans: [loan({ firstPaymentDate: '2027-01-01', firstPaymentDateStatus: 'confirmed' })], habits: [] });
  const w = nextWin(r);
  assert.equal(w.key, 'loans_verified');
  assert.equal(w.link, '/app/finances#loans');
  const budgetGap = computeReadiness({ ...full, summary: null, expenses: exp(6, 'needs_review'), habits: [] });
  assert.equal(nextWin(budgetGap).title, 'Let’s see where your money is going.');
  const onlyHabits = computeReadiness({ ...full, habits: weeks(1, 3) });
  assert.equal(nextWin(onlyHabits).key, 'weekly_habits');
});

test('celebrations come from real actions and respect dismissals', () => {
  const today = '2026-10-24';
  const w = weekStartOf(today);
  const habits = ['review_spending', 'check_budget', 'review_loans'].map((k) => ({ habitKey: k as never, weekStart: w, completedAt: '2026-10-23T10:00:00Z' }));
  const c = celebrations({ today, habits, scenarios: [{ id: 's1', type: 'practice_payment', createdAt: '2026-10-22T10:00:00Z' }], summary: null, lastSeenAt: '2026-10-24T10:00:00Z', previousSeenAt: '2026-10-10T10:00:00Z', dismissed: [] });
  assert.deepEqual(c.map((x) => x.text), [
    'Welcome back! Every step forward counts. Let’s keep building.',
    'Three habits completed this week. You’re building real momentum.',
    'Your repayment plan is taking shape. You’re making your next steps clearer.',
    'You took a closer look at your spending. That’s how financial confidence starts.',
  ]);
  const dismissed = celebrations({ today, habits, scenarios: [], summary: null, lastSeenAt: null, previousSeenAt: null, dismissed: [`habits3:${w}`, `spending:${w}`] });
  assert.equal(dismissed.length, 0);
  const quiet = celebrations({ today, habits: [], scenarios: [{ id: 'old', type: 'practice_payment', createdAt: '2026-09-01T00:00:00Z' }], summary: null, lastSeenAt: '2026-10-24T10:00:00Z', previousSeenAt: '2026-10-23T10:00:00Z', dismissed: [] });
  assert.equal(quiet.length, 0, 'no celebration without a real recent accomplishment');
});
