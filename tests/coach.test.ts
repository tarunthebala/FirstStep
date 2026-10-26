import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askCoach, builtInAnswer, OUT_OF_SCOPE_REPLY, type CoachContext } from '../src/server/coach';

const ctx: CoachContext = {
  metrics: {
    totalPrincipal: 21000, totalInterestBalance: 418.2, totalBalance: 21418.2, loansCounted: 4, loansMissingBalance: 0, estimatedMonthlyPayment: 246.56,
    paymentMissing: [], currentIncome: 920, expectedIncome: 3250, currentExpenses: 1352, postGradExpenses: 2477, currentCashFlow: -432,
    projectedCashFlow: 526.44, accessibleSavings: 2400, dataCompleteness: 80,
  },
  loanCount: 4,
  ratesKnown: 4,
  scenario: { type: 'delayed_employment', summary: 'Delayed start of 60 days. Ending savings $538.00.' },
};

test('answers come from the built-in library, with related questions, and make no network calls', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error('network used'); }) as typeof fetch;
  try {
    const r = await askCoach('What is capitalization?', ctx);
    assert.equal(r.source, 'built_in');
    assert.equal(r.scope, 'in');
    assert.match(r.answer, /capitaliz/i);
    assert.ok(r.related && r.related.length > 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('explains the scenario on screen and the student’s own payment', async () => {
  assert.match((await askCoach('Explain this result', ctx)).answer, /Delayed start of 60 days/);
  assert.match((await askCoach('How much will my payment be?', ctx)).answer, /\$246\.56/);
});

test('built-in coach stays on money topics', () => {
  assert.equal(builtInAnswer('who won the game last night?', ctx), OUT_OF_SCOPE_REPLY);
  assert.notEqual(builtInAnswer('how should I budget my rent?', ctx), OUT_OF_SCOPE_REPLY);
});
