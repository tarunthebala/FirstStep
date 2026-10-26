import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amortizedPayment,
  amortizationTotals,
  cashFlow,
  compareRepayment,
  dailyInterest,
  delayedEmployment,
  employedFraction,
  estimateLoan,
  estimatePortfolio,
  interestAccrual,
  lifestyle,
  loanTotals,
  postGradExpenses,
  practicePayment,
  savingsProjection,
  sumMoney,
  unexpectedExpenses,
  weightedAverageRate,
} from '../src/shared/finance';

const loan = (o: Partial<Parameters<typeof estimateLoan>[0]> = {}) => ({ id: 'l', name: 'Loan', principal: 10000, interestBalance: 0, interestRate: 5, termMonths: 120, ...o });

test('amortized payment matches the standard formula', () => {
  const r = amortizedPayment(10000, 5, 120);
  assert.ok(r.ok);
  assert.equal(r.payment, 106.07); // well-known value for $10k, 5%, 10 years
});

test('zero-interest loans divide evenly', () => {
  const r = amortizedPayment(12000, 0, 120);
  assert.ok(r.ok);
  assert.equal(r.payment, 100);
  const t = amortizationTotals(12000, 0, 120)!;
  assert.equal(t.totalInterest, 0);
  assert.equal(t.totalPaid, 12000);
  assert.equal(t.months, 120);
});

test('invalid inputs are rejected, not guessed', () => {
  assert.equal(amortizedPayment(-1, 5, 120).ok, false);
  assert.equal(amortizedPayment(1000, -2, 120).ok, false);
  assert.equal(amortizedPayment(1000, 5, 0).ok, false);
  assert.equal(amortizedPayment(1000, 5, 12.5).ok, false);
  assert.equal(amortizedPayment(Number.NaN, 5, 12).ok, false);
});

test('schedule totals stay within a cent of payment × months', () => {
  const t = amortizationTotals(10000, 5, 120)!;
  assert.equal(t.months, 120);
  assert.ok(Math.abs(t.totalPaid - 106.07 * 120) < 2);
  assert.ok(Math.abs(t.totalInterest - (t.totalPaid - 10000)) < 0.001);
});

test('extra payments shorten the schedule and cut interest', () => {
  const base = amortizationTotals(10000, 5, 120)!;
  const extra = amortizationTotals(10000, 5, 120, 50)!;
  assert.ok(extra.months < base.months);
  assert.ok(extra.totalInterest < base.totalInterest);
});

test('missing loan data produces no estimate and says what is missing', () => {
  const e = estimateLoan(loan({ interestRate: null }));
  assert.equal(e.ok, false);
  assert.equal(e.payment, null);
  assert.deepEqual(e.missing, ['interest rate']);
  const e2 = estimateLoan(loan({ principal: null }));
  assert.ok(e2.missing.includes('outstanding principal'));
});

test('unpaid interest is added to the repayment balance with a stated assumption', () => {
  const e = estimateLoan(loan({ interestBalance: 500 }));
  assert.equal(e.balanceUsed, 10500);
  assert.ok(e.assumptions.some((a) => a.includes('unpaid interest')));
});

test('term defaults are labeled as assumptions', () => {
  const e = estimateLoan(loan({ termMonths: null }), 120);
  assert.equal(e.termAssumed, true);
  assert.ok(e.assumptions[0].includes('120-month'));
});

test('multiple loans with different terms are amortized separately', () => {
  const a = loan({ id: 'a', name: 'A', principal: 5000, interestRate: 4, termMonths: 60 });
  const b = loan({ id: 'b', name: 'B', principal: 20000, interestRate: 7, termMonths: 240 });
  const p = estimatePortfolio([a, b]);
  const pa = amortizedPayment(5000, 4, 60);
  const pb = amortizedPayment(20000, 7, 240);
  assert.ok(pa.ok && pb.ok);
  assert.equal(p.totalPayment, Math.round((pa.payment + pb.payment) * 100) / 100);
  // An averaged rate/term would give a different (wrong) answer.
  const avg = amortizedPayment(25000, weightedAverageRate([a, b])!, 150);
  assert.ok(avg.ok && Math.abs(avg.payment - p.totalPayment!) > 1);
});

test('portfolio with some incomplete loans is partial and lists gaps', () => {
  const p = estimatePortfolio([loan({ id: 'a', name: 'A' }), loan({ id: 'b', name: 'B', interestRate: null })]);
  assert.equal(p.partial, true);
  assert.equal(p.missing.length, 1);
  assert.ok(p.missing[0].startsWith('B'));
  assert.equal(estimatePortfolio([]).totalPayment, null);
});

test('loan totals keep principal and interest apart', () => {
  const t = loanTotals([{ principal: 1000.1, interestBalance: 10.2 }, { principal: 2000.2, interestBalance: null }, { principal: null, interestBalance: null }]);
  assert.equal(t.principal, 3000.3);
  assert.equal(t.interest, 10.2);
  assert.equal(t.total, 3010.5);
  assert.equal(t.missingBalance, 1);
});

test('daily interest and accrual', () => {
  assert.equal(Math.round(dailyInterest(10000, 5)! * 10000) / 10000, 1.3699);
  assert.equal(interestAccrual(10000, 5, 30), 41.1);
  assert.equal(interestAccrual(null, 5, 30), null);
});

test('cash flow does not double count loan payments', () => {
  const a = cashFlow({ income: 3000, expenses: 2200, loanPayment: 250, loanPaymentInExpenses: false });
  assert.equal(a.value, 550);
  const b = cashFlow({ income: 3000, expenses: 2200, loanPayment: 250, loanPaymentInExpenses: true });
  assert.equal(b.value, 800);
  const c = cashFlow({ income: null, expenses: 2200, loanPayment: 250, loanPaymentInExpenses: false });
  assert.equal(c.value, null);
  assert.deepEqual(c.missing, ['income']);
});

test('negative projected cash flow is reported as negative', () => {
  assert.equal(cashFlow({ income: 1800, expenses: 1900, loanPayment: 200, loanPaymentInExpenses: false }).value, -300);
});

test('cent arithmetic avoids float drift', () => {
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
  const s = savingsProjection(0, 0.1, 1000);
  assert.equal(s[999], 100);
});

test('post-grad expenses fall back to current per category', () => {
  const r = postGradExpenses([
    { key: 'housing', scope: 'current', monthlyAmount: 600 },
    { key: 'housing', scope: 'post_grad', monthlyAmount: 1100 },
    { key: 'groceries', scope: 'current', monthlyAmount: 300 },
  ]);
  assert.equal(r.total, 1400);
  assert.deepEqual(r.fellBack, ['groceries']);
});

test('employment fraction handles partial months', () => {
  assert.equal(employedFraction(1, 0), 1);
  assert.equal(employedFraction(1, 30), 0);
  assert.equal(employedFraction(2, 45), 0.5);
  assert.equal(employedFraction(3, 45), 1);
});

test('delayed employment: income is zero during the delay and prorated after', () => {
  const r = delayedEmployment({ startingSavings: 3000, monthlyExpenses: 2000, monthlyIncome: 3000, delayDays: 45, movingCosts: 500, otherOneTime: 0, horizonMonths: 4 });
  assert.equal(r.rows[0].income, 0);
  assert.equal(r.rows[1].income, 1500);
  assert.equal(r.rows[2].income, 3000);
  // month1: 3000-2000-500=500; month2: 500+1500-2000=0; month3: +1000
  assert.equal(r.rows[0].balance, 500);
  assert.equal(r.rows[1].balance, 0);
  assert.equal(r.rows[2].balance, 1000);
  assert.equal(r.firstShortfallMonth, null);
});

test('delayed employment never shows a negative balance; shortfall is separate', () => {
  const r = delayedEmployment({ startingSavings: 1000, monthlyExpenses: 2000, monthlyIncome: 2500, delayDays: 90, movingCosts: 0, otherOneTime: 0, horizonMonths: 6 });
  assert.equal(r.firstShortfallMonth, 1);
  assert.ok(r.rows.every((row) => row.balance >= 0));
  assert.equal(r.rows[0].shortfall, 1000);
  assert.equal(r.rows[2].shortfall, 5000);
});

test('immediate employment matches simple projection', () => {
  const r = delayedEmployment({ startingSavings: 0, monthlyExpenses: 1000, monthlyIncome: 1500, delayDays: 0, movingCosts: 0, otherOneTime: 0, horizonMonths: 12 });
  assert.equal(r.endingBalance, 6000);
});

test('unexpected expenses and temporary income reduction', () => {
  const r = unexpectedExpenses({ startingSavings: 2000, monthlyIncome: 3000, monthlyExpenses: 2500, events: [{ label: 'Car', amount: 1200, month: 2 }], incomeReductionPct: 50, incomeReductionStart: 3, incomeReductionMonths: 2, horizonMonths: 5 });
  assert.deepEqual(r.rows.map((x) => x.income), [3000, 3000, 1500, 1500, 3000]);
  assert.equal(r.rows[1].oneTime, 1200);
  // 2000 +500 =2500; -700 =1800; -1000=800; -1000 => shortfall 200; +500 => 300
  assert.equal(r.rows[3].shortfall, 200);
  assert.equal(r.firstShortfallMonth, 4);
  assert.equal(r.endingBalance, 300);
});

test('practice payment before/after', () => {
  const r = practicePayment({ monthlyIncome: 3000, monthlyExpenses: 2400, payment: 250, months: 12 });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.before, 600);
    assert.equal(r.after, 350);
    assert.equal(r.savedAfter, 4200);
  }
  const missing = practicePayment({ monthlyIncome: null, monthlyExpenses: 2400, payment: 250, months: 12 });
  assert.equal(missing.ok, false);
});

test('lifestyle: $80/month freed is $960 over 12 months', () => {
  const r = lifestyle({ baseline: { dining: 200, subscriptions: 60 }, adjusted: { dining: 140, subscriptions: 40 }, monthlyIncome: 3000, otherExpenses: 2000, loanPayment: 300, months: 12 });
  assert.equal(r.freedMonthly, 80);
  assert.equal(r.freedOverPeriod, 960);
  assert.equal(r.changes.length, 2);
  assert.equal(r.cashFlowAfter, 820);
});

test('repayment comparison excludes incomplete loans and reports totals', () => {
  const r = compareRepayment([loan({ id: 'a', name: 'A' }), loan({ id: 'b', name: 'B', interestRate: null })], [{ label: '10 yr', termMonths: 120 }, { label: '20 yr', termMonths: 240 }]);
  assert.deepEqual(r.excluded, ['B']);
  assert.ok(r.results[1].totalInterest! > r.results[0].totalInterest!);
  assert.ok(r.results[1].monthlyPayment! < r.results[0].monthlyPayment!);
});

test('a gap that later recovers still reports its peak', () => {
  const r = delayedEmployment({ startingSavings: 2400, monthlyExpenses: 2477, monthlyIncome: 3250, delayDays: 60, movingCosts: 0, otherOneTime: 0, horizonMonths: 6 });
  assert.equal(r.firstShortfallMonth, 1);
  assert.equal(r.totalShortfall, 0, 'income catches up by month 6');
  assert.equal(r.peakShortfallMonth, 2);
  assert.equal(r.peakShortfall, 2554);
});
