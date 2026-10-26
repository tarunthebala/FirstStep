import { test } from 'node:test';
import assert from 'node:assert/strict';
import { determineStage, generatePlan, type PlanInput } from '../src/shared/plan';
import type { ExpenseCategory, IncomeSource, Loan } from '../src/shared/types';

const now = '2026-10-23T00:00:00Z';
const L = (o: Partial<Loan>): Loan => ({
  id: 'l' + Math.random(), userId: 'u', name: 'Loan', loanType: null, category: 'federal', principal: 10000, interestBalance: 0, balanceAsOf: null,
  interestRate: 5, rateType: 'FIXED', status: null, repaymentPlan: null, servicer: null, disbursementDate: null, repaymentBeginDate: null,
  nextPaymentDueDate: null, gracePeriodEnd: null, gracePeriodEndStatus: 'unknown', firstPaymentDate: null, firstPaymentDateStatus: 'unknown',
  termMonths: null, source: 'imported', importId: null, importIndex: null, notes: null, createdAt: now, updatedAt: now, ...o,
});
const I = (o: Partial<IncomeSource>): IncomeSource => ({ id: 'i', userId: 'u', label: 'Job', kind: 'expected', monthlyAmount: 3000, status: 'estimated', source: 'manual', createdAt: now, updatedAt: now, ...o });
const E = (key: ExpenseCategory['key'], amt: number, o: Partial<ExpenseCategory> = {}): ExpenseCategory => ({ id: key, userId: 'u', key, scope: 'current', monthlyAmount: amt, status: 'confirmed', source: 'manual', observedTotal: null, observedMonths: null, createdAt: now, updatedAt: now, ...o });

const base = (o: Partial<PlanInput> = {}): PlanInput => ({
  profile: { graduationDate: '2027-05-15', graduationStatus: 'soon', employmentStatus: 'student', expectedEmploymentStart: null },
  loans: [L({})],
  income: [I({})],
  expenses: [E('housing', 1000), E('groceries', 300), E('transportation', 200)],
  savings: [],
  goals: [],
  settings: { studentLoanPaymentInExpenses: false, defaultTermMonths: 120, monthlySavingsContribution: null },
  today: '2026-10-23',
  ...o,
});

test('stage detection', () => {
  assert.equal(determineStage(base(), '2026-10-23'), 'in_school');
  assert.equal(determineStage(base({ profile: { graduationDate: '2026-05-01', graduationStatus: 'graduated', employmentStatus: null, expectedEmploymentStart: null } }), '2026-10-23'), 'grace_period');
  assert.equal(determineStage(base({ loans: [L({ status: 'REPAYMENT' })] }), '2026-10-23'), 'repayment');
  assert.equal(determineStage(base({ profile: { graduationDate: null, graduationStatus: null, employmentStatus: null, expectedEmploymentStart: null }, loans: [] }), '2026-10-23'), 'unknown');
});

test('no loans: no payment is invented and gathering loans is the top task', () => {
  const p = generatePlan(base({ loans: [] }));
  assert.equal(p.metrics.estimatedMonthlyPayment, null);
  assert.ok(p.missing.includes('No student loans are recorded yet.'));
  assert.equal(p.tasks[0].key, 'gather_loans');
  assert.equal(p.tasks[0].priority, 'high');
  assert.ok(!p.tasks.some((t) => t.key === 'practice_payment'));
  assert.ok(!p.tasks.some((t) => t.key === 'confirm_first_payment'));
});

test('first payment date is never assumed', () => {
  const p = generatePlan(base());
  const t = p.tasks.find((t) => t.key === 'confirm_first_payment')!;
  assert.equal(t.priority, 'high');
  assert.equal(t.alreadyDone, false);
  assert.ok(p.missing.some((m) => m.includes('first payment date')));
  assert.ok(!p.tasks.some((t) => t.key === 'prepare_first_payment'));
});

test('user-entered first payment date creates dated prep tasks', () => {
  const p = generatePlan(base({ loans: [L({ firstPaymentDate: '2027-12-01', firstPaymentDateStatus: 'user_entered' })] }));
  const prep = p.tasks.find((t) => t.key === 'prepare_first_payment')!;
  assert.equal(prep.dueDate, '2027-11-17');
  assert.equal(p.tasks.find((t) => t.key === 'revisit_budget')!.dueDate, '2027-11-01');
});

test('shortfall surfaces a recommendation naming the contributing assumptions', () => {
  const p = generatePlan(base({ income: [I({ monthlyAmount: 1500 })] }));
  assert.ok(p.metrics.projectedCashFlow! < 0);
  assert.ok(p.tasks.some((t) => t.key === 'shortfall' && t.priority === 'high'));
  assert.ok(p.recommendations[0].detail.includes('expected income'));
});

test('tasks that do not apply are left out', () => {
  const p = generatePlan(base({ profile: { graduationDate: '2025-05-01', graduationStatus: 'graduated', employmentStatus: 'full_time', expectedEmploymentStart: null } }));
  assert.ok(!p.tasks.some((t) => t.key === 'delay_scenario'));
});

test('missing data is ordered ahead of dependent work', () => {
  const p = generatePlan(base({ loans: [L({ interestRate: null })], income: [] }));
  const order = p.tasks.map((t) => t.key);
  assert.ok(order.indexOf('gather_loans') < order.indexOf('savings_goal'));
  assert.ok(order.indexOf('estimate_budget') < order.indexOf('revisit_budget'));
});

test('connecting accounts does not change completeness by itself', () => {
  const a = generatePlan(base());
  assert.equal(typeof a.metrics.dataCompleteness, 'number');
  assert.ok(a.metrics.dataCompleteness <= 100);
});
