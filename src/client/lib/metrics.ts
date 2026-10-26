import { estimatePortfolio } from '../../shared/finance';
import { computeReadiness } from '../../shared/readiness';
import { computeMetrics, determineStage } from '../../shared/plan';
import { todayISO } from '../../shared/format';
import type { AppState } from './state';

/**
 * Live metrics from the user's current saved data (not from the last generated plan),
 * so edits to the baseline show up immediately everywhere.
 */
export function liveMetrics(d: AppState) {
  const input = { profile: d.profile, loans: d.loans, income: d.income, expenses: d.expenses, savings: d.savings, goals: d.goals, settings: d.settings };
  const m = computeMetrics(input);
  const portfolio = estimatePortfolio(d.loans, d.settings.defaultTermMonths);
  const goal = d.goals.length ? d.goals.reduce((a, g) => a + g.targetAmount, 0) : null;
  const ready = computeReadiness({ ...d, habits: d.habits ?? [], estimatedMonthlyPayment: m.estimatedMonthlyPayment });
  const stage = determineStage(input, todayISO());
  /** True when saved data changed after the plan was generated. */
  const latestEdit = [...d.loans, ...d.income, ...d.expenses, ...d.savings, ...d.goals].map((x) => x.updatedAt).sort().pop() ?? '';
  const stale = !!d.plan && latestEdit > d.plan.generatedAt;
  return { ...m, portfolio, readiness: ready, stage, goal, stale };
}
export type LiveMetrics = ReturnType<typeof liveMetrics>;
