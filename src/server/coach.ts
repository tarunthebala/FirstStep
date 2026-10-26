/**
 * Money Lab learning coach — a financial-literacy tutor built from hand-written answers.
 *
 * Answers come from FirstStep's built-in library (src/shared/coach-kb.ts) plus the student's own numbers.
 * There is no AI and no network call: nothing the student types leaves FirstStep. Questions that aren't
 * about money get a fixed redirect.
 */
import { matchTopic, normalizeQuestion, TOPIC_BY_ID, TOPICS, type CoachTopic } from '../shared/coach-kb';
import { money } from '../shared/format';
import type { PlanMetrics } from '../shared/types';

export interface CoachContext {
  metrics: PlanMetrics | null;
  loanCount: number;
  ratesKnown: number;
  scenario?: { type: string; summary: string } | null;
}

export interface CoachTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface CoachReply {
  answer: string;
  source: 'built_in';
  scope: 'in' | 'out';
  /** Follow-up questions the student can tap. */
  related?: string[];
}

export const OUT_OF_SCOPE_REPLY =
  'I’m FirstStep’s financial literacy coach, so I can only help with money topics — student loans, interest, budgeting, saving, credit, repayment, and your Money Lab scenarios. Try something like “How does interest capitalization work?” or “Explain my delayed-job scenario.”';

/** Kept async with the same signature so the API route doesn't change. History isn't needed by the library. */
export async function askCoach(question: string, ctx: CoachContext, _history: CoachTurn[] = []): Promise<CoachReply> {
  return builtInReply(question, ctx);
}

const FINANCE_WORDS = /loan|interest|budget|sav|money|pay|debt|credit|income|expense|rent|cash|bank|rate|grace|servicer|repay|fund|salary|tax|spend|cost|afford|financ|scenario|plan|balance|principal|capitaliz|default|delinquen|emergency|fafsa|studentaid|invest|\$/i;

const STARTER_IDS = ['capitalization', 'emergency-fund', 'repayment-plans', 'budget', 'credit-score', 'cant-pay'];
const relatedFrom = (ids: string[]) => ids.map((id) => TOPIC_BY_ID.get(id)).filter((t): t is CoachTopic => !!t).map((t) => t.q);

/** Answers that use the student's own FirstStep numbers. Only for questions about "my"/"I" or the scenario on screen. */
function personalAnswer(q: string, ctx: CoachContext): { answer: string; related: string[] } | null {
  const m = ctx.metrics;
  const personal = /\b(my|me|i|im|ive|this)\b/.test(q);
  if (!personal) return null;
  if (ctx.scenario && /explain (this|the|my) (result|scenario)|this (result|scenario)|my scenario/.test(q)) {
    return { answer: `About your ${ctx.scenario.type.replace(/_/g, ' ')} scenario: ${ctx.scenario.summary}\n\nScenarios are practice only; they don’t change your saved budget.`, related: relatedFrom(['emergency-fund', 'cash-flow', 'cant-pay']) };
  }
  if (!m) return null;
  if (/how is my (loan )?payment estimated|how (is|was) my (loan )?payment calculated/.test(q)) return null; // answered by the library
  const hardship = /\b(cant|cannot|can not|unable|miss|missed|late|struggl|extra|autopay|auto pay|first|due|when|lower|reduce|pause)\b/.test(q);
  if (!hardship && /\bmy\b.*\b(monthly |loan |student loan )?payments?\b|\bafford\b|how much (will|would|do) i (pay|have to pay)|payment be\b/.test(q)) {
    if (m.estimatedMonthlyPayment === null) return { answer: `FirstStep can’t estimate a payment yet. ${m.paymentMissing.join(' ')}\n\nAdd the missing details in My Finances, or check your servicer account.`, related: relatedFrom(['payment-estimate', 'find-my-loans']) };
    const cf = m.projectedCashFlow;
    return {
      answer: `Your estimated payment is about ${money(m.estimatedMonthlyPayment)} a month. That’s a FirstStep estimate from your recorded balances and rates using a fixed schedule; your servicer sets the real amount.\n\n${cf === null ? 'Add income and expenses to see whether it fits your budget.' : cf >= 0 ? `After it, your projected monthly cash flow is ${money(cf)}.` : `With it, your projected budget is short by ${money(Math.abs(cf))} a month. Money Lab lets you test changes without touching your saved budget.`}`,
      related: relatedFrom(['payment-estimate', 'repayment-plans', 'practice-payment']),
    };
  }
  if (/\bmy\b.*\b(cash ?flow|budget)\b|left ?over/.test(q)) {
    if (m.projectedCashFlow === null) return { answer: 'Cash flow is income minus expenses (and loan payments not already in your expenses). FirstStep needs both your income and your expenses to calculate yours. Add them in My Finances.', related: relatedFrom(['budget', 'take-home-pay']) };
    return {
      answer: `Your projected monthly cash flow after graduation:\n\nexpected income ${money(m.expectedIncome ?? m.currentIncome)}\n− post-graduation expenses ${money(m.postGradExpenses)}\n− estimated loan payment ${money(m.estimatedMonthlyPayment)}\n= ${money(m.projectedCashFlow)} a month\n\n${m.projectedCashFlow >= 0 ? 'Positive cash flow is room to save or pay extra.' : 'A negative number means the gap would come from savings. Money Lab can help you test changes.'}`,
      related: relatedFrom(['cut-spending', 'emergency-fund', 'save-vs-pay']),
    };
  }
  if (/how much do i owe|\bmy\b.*\b(total )?(balance|debt)\b|\bi owe\b/.test(q)) {
    if (m.totalBalance === null || ctx.loanCount === 0) return { answer: 'FirstStep doesn’t have your loan balances yet. Upload your StudentAid.gov file or add your loans in My Finances.', related: relatedFrom(['find-my-loans', 'fsa-id']) };
    return { answer: `Your recorded loans total about ${money(m.totalBalance)} across ${ctx.loanCount} loan${ctx.loanCount === 1 ? '' : 's'}, including any unpaid interest you’ve entered.\n\nYour servicer has the official, up-to-date balance, so check it there and mark your loans verified in FirstStep.`, related: relatedFrom(['principal', 'capitalization', 'servicer']) };
  }
  if (/\b(missing|incomplete)\b/.test(q)) {
    return { answer: m.paymentMissing.length ? `Still missing: ${m.paymentMissing.join('; ')}.` : `Your data completeness is ${m.dataCompleteness}%. Check the Action Plan for the next item to fill in.`, related: relatedFrom(['readiness', 'data-labels']) };
  }
  return null;
}

export function builtInReply(question: string, ctx: CoachContext): CoachReply {
  const q = normalizeQuestion(question).trim();
  const personal = personalAnswer(q, ctx);
  if (personal) return { ...personal, source: 'built_in', scope: 'in' };
  if (!ctx.scenario && /explain (this|the|my) (result|scenario)|this (result|scenario)/.test(q)) {
    return { answer: 'There’s no saved result on screen yet. Fill in the scenario above and run it, then ask me to explain the result.', related: relatedFrom(['practice-payment', 'delay-scenario', 'unexpected-scenario']), source: 'built_in', scope: 'in' };
  }
  const topic = matchTopic(question);
  if (topic) return { answer: topic.answer, related: relatedFrom(topic.related), source: 'built_in', scope: 'in' };
  if (!FINANCE_WORDS.test(q)) return { answer: OUT_OF_SCOPE_REPLY, related: relatedFrom(STARTER_IDS.slice(0, 3)), source: 'built_in', scope: 'out' };
  return {
    answer: `I don’t have a written answer for that one yet. I know ${TOPICS.length} money topics, from student loans and interest to budgeting, saving and credit. Try asking about one of the topics below, or tap “Browse all topics”.\n\nFor official rules about your loans, check StudentAid.gov or your servicer.`,
    related: relatedFrom(STARTER_IDS),
    source: 'built_in',
    scope: 'in',
  };
}

/** Text-only form of the built-in answer. */
export function builtInAnswer(question: string, ctx: CoachContext): string {
  return builtInReply(question, ctx).answer;
}
