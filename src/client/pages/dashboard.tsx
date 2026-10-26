import { useMemo, useState } from 'react';
import { LuFlaskConical } from 'react-icons/lu';
import { isNum, practicePayment } from '../../shared/finance';
import { dateLabel, dateTimeLabel, money, todayISO, daysBetween } from '../../shared/format';
import { STAGE_LABEL } from '../../shared/plan';
import { liveMetrics } from '../lib/metrics';
import { Link } from '../lib/router';
import { useAction, useApp } from '../lib/state';
import { PageHead } from '../components/layouts';
import { CashFlowBars } from '../components/charts';
import { Alert, Button, ButtonLink, Empty, HowCalculated, MoneyInput, PriorityBadge, ProgressBar } from '../components/ui';
import { CelebrationBanner, HabitTracker, ReadinessMeter, useVisit } from '../components/readiness';

const STAGE_TEXT = {
  in_school: 'You’re still in school. This is the best time to learn your numbers and practice — nothing is due yet.',
  grace_period: 'You’ve graduated or left school. Use this time to confirm your dates, settle on a budget and practice your payment.',
  repayment: 'At least one loan looks like it’s in repayment. Keep your budget current and check your servicer account regularly.',
  unknown: 'Add your graduation date and loan details so FirstStep can tell where you are in preparing.',
} as const;

export function Dashboard() {
  const { data, mutate } = useApp();
  const m = useMemo(() => liveMetrics(data), [data]);
  useVisit();
  const { run, pending } = useAction();
  const name = data.profile.displayName?.replace(' (demo)', '') || null;
  const openTasks = data.tasks.filter((t) => t.status === 'open' && !t.key.startsWith('checklist_')).sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.priority] - ({ high: 0, medium: 1, low: 2 })[b.priority]);
  const goal = data.goals[0] ?? null;

  return (
    <>
      <PageHead
        eyebrow={STAGE_LABEL[m.stage]}
        title={name ? `Hi, ${name}.` : 'Your dashboard'}
        intro={STAGE_TEXT[m.stage]}
        actions={<ButtonLink to="/app/money-lab" variant="secondary"><LuFlaskConical aria-hidden="true" /> Open Money Lab</ButtonLink>}
      />
      <div className="stack stack-lg">
        <CelebrationBanner />
        <ReadinessMeter readiness={m.readiness} />
        <div className="panel-muted row-between small">
          <span>
            {data.summary ? <>Financial summary last reviewed <strong>{dateTimeLabel(data.summary.confirmedAt)}</strong>.</> : 'You haven’t confirmed a financial summary yet.'}{' '}
            Numbers below use your current saved data.
          </span>
          <ButtonLink to="/app/review" size="sm" variant="secondary">Review or correct</ButtonLink>
        </div>
        {m.stale && (
          <Alert kind="info" title="Your data changed since your plan was built">
            <div className="row-between">
              <span>Metrics here are already up to date. Update your action plan so tasks reflect the changes.</span>
              <Button size="sm" loading={pending} onClick={() => run(() => mutate('POST', '/api/plan/generate'), 'Plan updated.')}>Update plan</Button>
            </div>
          </Alert>
        )}

        {/* Key metrics */}
        <div className="grid-3">
          <div className="stat">
            <span className="label">Total student loan balance</span>
            <span className="big-num">{money(m.totalBalance, { fallback: '—' })}</span>
            <span className="small muted">{data.loans.length ? `${m.loansCounted} of ${data.loans.length} loans have a balance` : 'No loans recorded'}</span>
            {data.loans.length > 0 ? (
              <HowCalculated label="Breakdown">
                {data.loans.map((l) => <p key={l.id}>{l.name}: {money(l.principal, { fallback: 'missing' })}{l.interestBalance ? ` + ${money(l.interestBalance)} interest` : ''}</p>)}
                <p>Total = recorded principal + recorded unpaid interest. {m.loansMissingBalance ? `${m.loansMissingBalance} loan(s) without a balance are not included.` : 'All loans included.'}</p>
              </HowCalculated>
            ) : <ButtonLink to="/app/finances" size="sm" variant="secondary">Add a loan</ButtonLink>}
          </div>
          <div className="stat">
            <span className="label">Estimated monthly payment</span>
            <span className="big-num">{m.estimatedMonthlyPayment === null ? '—' : money(m.estimatedMonthlyPayment)}</span>
            <span className="small muted">{m.estimatedMonthlyPayment === null ? m.paymentMissing[0] ?? 'Needs loan details' : m.portfolio.partial ? 'Partial — some loans lack data' : 'FirstStep estimate, not your bill'}</span>
            <HowCalculated>
              {m.portfolio.estimates.map((e) => <p key={e.loanId}>{e.name}: {e.ok ? `${money(e.payment)} (${e.termMonths} mo${e.termAssumed ? ', assumed' : ''})` : `needs ${e.missing.join(' and ')}`}</p>)}
              <p>Each loan uses standard amortization at its own rate and term; results are added. Recorded unpaid interest is added to the balance as a cautious assumption.</p>
            </HowCalculated>
          </div>
          <div className="stat">
            <span className="label">Available monthly cash flow</span>
            <div className="kv" style={{ fontSize: 15 }}>
              <dt>Now</dt><dd className={isNum(m.currentCashFlow) && m.currentCashFlow < 0 ? 'neg' : ''}><strong>{money(m.currentCashFlow, { fallback: '—' })}</strong></dd>
              <dt>After graduation</dt><dd className={isNum(m.projectedCashFlow) && m.projectedCashFlow < 0 ? 'neg' : ''}><strong>{money(m.projectedCashFlow, { fallback: '—' })}</strong></dd>
            </div>
            <span className="xs muted">Projected includes the estimated loan payment{data.settings.studentLoanPaymentInExpenses ? ' (already in your expenses, not counted twice)' : ''}.</span>
            {(m.currentCashFlow === null || m.projectedCashFlow === null) && <span className="xs">{!isNum(m.currentIncome) && !isNum(m.expectedIncome) ? 'Add income to calculate cash flow.' : 'Add expenses to calculate cash flow.'} <Link to="/app/finances#budget">Budget</Link></span>}
            <HowCalculated>
              <p>Now: current income {money(m.currentIncome)} − current expenses {money(m.currentExpenses)}.</p>
              <p>After graduation: {isNum(m.expectedIncome) ? 'expected' : 'current'} income {money(m.expectedIncome ?? m.currentIncome)} − post-graduation expenses {money(m.postGradExpenses)}{data.settings.studentLoanPaymentInExpenses ? '' : ` − estimated payment ${money(m.estimatedMonthlyPayment)}`}.</p>
            </HowCalculated>
          </div>
        </div>

        <div className="grid-2" style={{ alignItems: 'start' }}>
          <HabitTracker />
          {/* Next steps */}
          <section className="panel stack" aria-labelledby="next-h">
            <div className="panel-head"><h2 id="next-h" className="h3">Next best steps</h2><Link to="/app/plan" className="small">All tasks</Link></div>
            {openTasks.length === 0 ? <p className="small muted">{data.tasks.length ? 'Every task is done. Revisit your budget before repayment begins.' : 'Confirm your summary to generate tasks.'}</p> : (
              <div className="divider-list">
                {openTasks.slice(0, 4).map((t) => (
                  <div key={t.id} className="task">
                    <input type="checkbox" className="task-check" aria-label={`Mark “${t.title}” done`} onChange={() => run(() => mutate('PATCH', `/api/tasks/${t.id}`, { status: 'done' }), 'Nice — task done.')} />
                    <div className="stack stack-sm"><Link to={t.link} className="task-title" style={{ fontWeight: 600, color: 'var(--color-text)' }}>{t.title}</Link><span className="small muted">{t.reason}</span></div>
                    <PriorityBadge priority={t.priority} />
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>

        <div className="grid-2" style={{ alignItems: 'start' }}>
          {/* Chart */}
          <section className="panel stack" aria-labelledby="chart-h">
            <h2 id="chart-h" className="h3">Income vs. expenses</h2>
            {m.currentIncome === null && m.expectedIncome === null && m.currentExpenses === null ? (
              <Empty title="Not enough data for a chart">Add income and expenses so FirstStep can compare them. <Link to="/app/finances#budget">Go to budget</Link></Empty>
            ) : (
              <CashFlowBars
                title="Monthly income compared with expenses, now and after graduation"
                columns={[
                  { label: 'Now', income: m.currentIncome, expenses: m.currentExpenses },
                  { label: 'After graduation (projected)', income: m.expectedIncome ?? m.currentIncome, expenses: m.postGradExpenses, loan: data.settings.studentLoanPaymentInExpenses ? null : m.estimatedMonthlyPayment },
                ]}
              />
            )}
          </section>
          <Timeline />
        </div>

        <div className="grid-2" style={{ alignItems: 'start' }}>
          <PracticeCard projectedIncome={m.expectedIncome ?? m.currentIncome} projectedExpenses={m.postGradExpenses} estimate={m.estimatedMonthlyPayment} />
          <section className="panel stack" aria-labelledby="sav-h">
            <h2 id="sav-h" className="h3">Emergency savings</h2>
            <p className="big-num">{money(m.accessibleSavings, { fallback: '—' })}</p>
            {goal ? (
              <>
                <ProgressBar value={((m.accessibleSavings ?? 0) / goal.targetAmount) * 100} label={`Progress toward ${goal.label}`} />
                <p className="small muted">{Math.round(((m.accessibleSavings ?? 0) / goal.targetAmount) * 100)}% of your {money(goal.targetAmount, { whole: true })} “{goal.label}” goal{goal.targetDate ? ` by ${dateLabel(goal.targetDate)}` : ''}.</p>
              </>
            ) : <p className="small muted">No goal set yet. <Link to="/app/finances#savings">Set one</Link></p>}
            <p className="xs muted">Counts only balances you marked as available for emergencies.</p>
          </section>
        </div>

        <div className="grid-2" style={{ alignItems: 'start' }}>
          <section className="panel-dark stack">
            <span className="eyebrow">Money Lab</span>
            <h2 className="h3">What happens if things change?</h2>
            <p className="small" style={{ color: '#dfe8d8' }}>Try a slower job search, a surprise car repair, a cheaper apartment or a longer repayment term — without changing your real budget.</p>
            <div className="row">
              <ButtonLink to="/app/money-lab?tab=delay" variant="secondary" size="sm" className="on-dark">Delayed job start</ButtonLink>
              <ButtonLink to="/app/money-lab?tab=unexpected" variant="secondary" size="sm" className="on-dark">Unexpected expense</ButtonLink>
              <ButtonLink to="/app/money-lab?tab=lifestyle" variant="secondary" size="sm" className="on-dark">Spending changes</ButtonLink>
            </div>
          </section>
          <section className="panel stack" aria-labelledby="act-h">
            <h2 id="act-h" className="h3">Recent activity</h2>
            {data.activity.length === 0 ? <p className="small muted">Nothing yet.</p> : (
              <ul className="small stack stack-sm" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {data.activity.slice(0, 6).map((a) => <li key={a.id} className="row-between"><span>{a.message}</span><span className="xs muted">{dateLabel(a.at)}</span></li>)}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function Timeline() {
  const { data } = useApp();
  const today = todayISO();
  const grace = data.loans.filter((l) => l.gracePeriodEnd).sort((a, b) => a.gracePeriodEnd!.localeCompare(b.gracePeriodEnd!))[0];
  const first = data.loans.filter((l) => l.firstPaymentDate).sort((a, b) => a.firstPaymentDate!.localeCompare(b.firstPaymentDate!))[0];
  const goal = data.goals.find((g) => g.targetDate);
  const due = data.tasks.filter((t) => t.status === 'open' && t.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0];
  const items: { label: string; date: string | null; status: string; done: boolean }[] = [
    { label: data.profile.graduationStatus === 'graduated' ? 'Graduated' : 'Graduation', date: data.profile.graduationDate, status: 'entered by you', done: !!data.profile.graduationDate && data.profile.graduationDate <= today },
    { label: 'Grace period ends', date: grace?.gracePeriodEnd ?? null, status: grace ? grace.gracePeriodEndStatus.replace('_', ' ') : 'unknown', done: !!grace && grace.gracePeriodEnd! <= today },
    { label: 'First payment', date: first?.firstPaymentDate ?? null, status: first ? first.firstPaymentDateStatus.replace('_', ' ') : 'unknown', done: !!first && first.firstPaymentDate! <= today },
  ];
  if (goal) items.push({ label: `Savings goal: ${goal.label}`, date: goal.targetDate, status: 'your target', done: false });
  if (due) items.push({ label: due.title, date: due.dueDate, status: 'task due', done: false });
  items.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  const nextIdx = items.findIndex((i) => !i.done && i.date);
  return (
    <section className="panel stack" aria-labelledby="tl-h">
      <div className="panel-head"><h2 id="tl-h" className="h3">Repayment timeline</h2><Link to="/app/loan-planner" className="small">Loan Planner</Link></div>
      <ul className="timeline small">
        {items.map((i, idx) => (
          <li key={i.label} className={i.done ? 'done' : idx === nextIdx ? 'next' : ''}>
            <strong>{i.label}</strong>
            <div className="muted">{i.date ? `${dateLabel(i.date)}${!i.done ? ` · in ${daysBetween(today, i.date)} days` : ''}` : 'Date unknown'} · <em>{i.status}</em></div>
          </li>
        ))}
      </ul>
      {(!grace || !first) && <p className="xs muted">Unknown dates: check your servicer account, then add them in the Loan Planner.</p>}
    </section>
  );
}

function PracticeCard({ projectedIncome, projectedExpenses, estimate }: { projectedIncome: number | null; projectedExpenses: number | null; estimate: number | null }) {
  const [pay, setPay] = useState<number | null>(estimate !== null ? Math.round(estimate) : 200);
  const r = practicePayment({ monthlyIncome: projectedIncome, monthlyExpenses: projectedExpenses, payment: pay ?? 0, months: 6 });
  return (
    <section className="panel stack" aria-labelledby="pp-h">
      <h2 id="pp-h" className="h3">Practice a payment</h2>
      <p className="xs muted">Simulation only — this doesn’t make or schedule a payment.</p>
      <div className="field">
        <label htmlFor="pp-amt">Monthly payment to practice</label>
        <MoneyInput id="pp-amt" value={pay} onChange={setPay} />
      </div>
      {r.ok ? (
        <dl className="kv">
          <dt>Cash flow before</dt><dd>{money(r.before)}</dd>
          <dt>After the payment</dt><dd className={r.after < 0 ? 'neg' : ''}><strong>{money(r.after)}</strong></dd>
          <dt>Saved over 6 months</dt><dd>{money(r.savedAfter)}</dd>
        </dl>
      ) : <p className="small muted">Add post-graduation income and expenses to practice.</p>}
      <ButtonLink to="/app/money-lab?tab=practice" size="sm" variant="secondary">More in Money Lab</ButtonLink>
    </section>
  );
}
