import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchTopic, TOPIC_BY_ID, TOPIC_CATEGORIES, TOPICS } from '../src/shared/coach-kb';
import { builtInReply, OUT_OF_SCOPE_REPLY, type CoachContext } from '../src/server/coach';

const ctx: CoachContext = {
  metrics: {
    totalPrincipal: 21000, totalInterestBalance: 418.2, totalBalance: 21418.2, loansCounted: 4, loansMissingBalance: 0, estimatedMonthlyPayment: 246.56,
    paymentMissing: [], currentIncome: 920, expectedIncome: 3250, currentExpenses: 1352, postGradExpenses: 2477, currentCashFlow: -432,
    projectedCashFlow: 526.44, accessibleSavings: 2400, dataCompleteness: 80,
  },
  loanCount: 4,
  ratesKnown: 4,
  scenario: null,
};
const topicOf = (q: string) => matchTopic(q)?.id;

test('the library is large, ids are unique, and every category is used', () => {
  assert.ok(TOPICS.length >= 60, `has ${TOPICS.length} topics`);
  assert.equal(new Set(TOPICS.map((t) => t.id)).size, TOPICS.length);
  for (const c of TOPIC_CATEGORIES) assert.ok(TOPICS.some((t) => t.category === c), c);
});

test('every topic’s own question finds that topic (so every chip gives the answer it promises)', () => {
  for (const t of TOPICS) assert.equal(topicOf(t.q), t.id, `"${t.q}"`);
});

test('every related link points to a real, different topic', () => {
  for (const t of TOPICS) {
    assert.ok(t.related.length >= 1, t.id);
    for (const r of t.related) {
      assert.ok(TOPIC_BY_ID.has(r), `${t.id} → ${r}`);
      assert.notEqual(r, t.id);
    }
  }
});

test('answers are short, plain text, emoji-free, and give no investment picks', () => {
  for (const t of TOPICS) {
    assert.ok(t.answer.split(/\s+/).length <= 130, `${t.id} is too long`);
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t.answer), t.id);
    assert.ok(!/\b(buy|sell) (stocks?|crypto|shares)\b/i.test(t.answer), t.id);
  }
});

test('natural phrasings reach the right topic', () => {
  const cases: [string, string][] = [
    ['How does interest capitalization work?', 'capitalization'],
    ['what does capitalized interest mean', 'capitalization'],
    ['Should I use a credit card for emergencies?', 'credit-card-emergencies'],
    ['how do credit cards work', 'credit-card'],
    ['What’s a realistic share of income for rent?', 'rent'],
    ['What can I do if I can’t pay during a job search?', 'cant-pay'],
    ['Is it better to save the extra or pay down loans?', 'save-vs-pay'],
    ['How do longer terms change total interest?', 'total-interest'],
    ['Why does an emergency fund matter?', 'emergency-fund'],
    ['what is the 50/30/20 rule', '50-30-20'],
    ['explain subsidized vs unsubsidized', 'subsidized'],
    ['what is PSLF', 'forgiveness'],
    ['should i refinance my loans', 'refinancing'],
    ['how do I raise my credit score', 'credit-score'],
    ['what is a W-4', 'taxes-paycheck'],
    ['is klarna bad', 'bnpl'],
    ['someone called offering to lower my payments for a fee, is that a scam', 'scams'],
    ['what is deferment', 'deferment-forbearance'],
    ['what happens if I miss a payment', 'delinquency'],
    ['How big should my emergency fund be?', 'emergency-fund'],
  ];
  for (const [q, id] of cases) assert.equal(topicOf(q), id, q);
});

test('personal questions use the student’s own numbers', () => {
  assert.match(builtInReply('What will my monthly payment be?', ctx).answer, /\$246\.56/);
  assert.match(builtInReply('What is my cash flow?', ctx).answer, /\$526\.44/);
  assert.match(builtInReply('How much do I owe?', ctx).answer, /\$21,418\.20/);
});

test('hardship and how-it-works questions are not hijacked by the personal payment answer', () => {
  assert.match(builtInReply('What can I do if I can’t make my payment?', ctx).answer, /Contact your servicer before you miss/);
  assert.match(builtInReply('When is my first payment due?', ctx).answer, /servicer sets the official date/);
  assert.match(builtInReply('How is my loan payment estimated?', ctx).answer, /amortization formula/);
});

test('scenario explanations use the scenario on screen, and say so when there is none', () => {
  const withScenario = builtInReply('Explain this result', { ...ctx, scenario: { type: 'delayed_employment', summary: 'Ending savings $538.00.' } });
  assert.match(withScenario.answer, /delayed employment scenario: Ending savings \$538\.00/);
  assert.match(builtInReply('Explain this result', ctx).answer, /no saved result on screen/);
});

test('off-topic questions get the fixed redirect; unknown money questions get suggestions', () => {
  const off = builtInReply('who won the game last night?', ctx);
  assert.equal(off.answer, OUT_OF_SCOPE_REPLY);
  assert.equal(off.scope, 'out');
  const unknown = builtInReply('what about money for llamas', ctx);
  assert.equal(unknown.scope, 'in');
  assert.ok((unknown.related ?? []).length >= 3);
  for (const r of unknown.related ?? []) assert.ok(matchTopic(r), r);
});

test('every reply from the library comes with related questions that themselves have answers', () => {
  for (const t of TOPICS.slice(0, 20)) {
    const r = builtInReply(t.q, { ...ctx, metrics: null });
    assert.ok(r.related && r.related.length > 0, t.id);
    for (const q of r.related!) assert.ok(matchTopic(q), q);
  }
});
