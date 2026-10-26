import { useEffect, useState, type FormEvent } from 'react';
import { LuPlus } from 'react-icons/lu';
import { dateLabel, money, pct, todayISO } from '../../shared/format';
import { STAGE_LABEL } from '../../shared/plan';
import type { GraduationStatus, EmploymentStatus } from '../../shared/types';
import { navigate } from '../lib/router';
import { useAction, useApp } from '../lib/state';
import { OnboardingLayout } from '../components/layouts';
import { Alert, Button, ButtonLink, Field, HowCalculated, PriorityBadge, ProgressBar, SourceBadge, Stat } from '../components/ui';
import { ImportReview, LoanFormDialog, UploadInstructions, UploadPanel } from '../components/loans';
import { ConnectPanel } from '../components/connect';
import { SummaryEditor } from '../components/summary';

export function GraduationStep() {
  const { data, mutate } = useApp();
  const p = data.profile;
  const [date, setDate] = useState(p.graduationDate ?? '');
  const [status, setStatus] = useState<GraduationStatus | ''>(p.graduationStatus ?? '');
  const [school, setSchool] = useState(p.school ?? '');
  const [emp, setEmp] = useState<EmploymentStatus | ''>(p.employmentStatus ?? '');
  const [start, setStart] = useState(p.expectedEmploymentStart ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { run, pending, error } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!date) errs.date = 'Choose your expected or actual graduation date.';
    if (!status) errs.status = 'Choose one.';
    if (!emp) errs.emp = 'Choose your current employment status.';
    if (status === 'graduated' && date && date > todayISO()) errs.date = 'You chose “Already graduated”, so the date should be today or earlier.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    run(async () => {
      await mutate('POST', '/api/onboarding/graduation', { graduationDate: date, graduationStatus: status, school: school.trim() || null, employmentStatus: emp, expectedEmploymentStart: start || null });
      navigate('/onboarding/loans');
    });
  };
  return (
    <OnboardingLayout
      current="graduation"
      steps={data.onboarding.steps}
      actions={
        <>
          <Button variant="ghost" onClick={() => navigate('/')}>Back</Button>
          <Button type="submit" form="grad-form" loading={pending} arrow>Continue</Button>
        </>
      }
    >
      <form id="grad-form" className="stack stack-lg" onSubmit={submit} noValidate>
        <div className="stack stack-sm">
          <h1>When do you expect to graduate?</h1>
          <p className="muted">Your graduation date organizes your preparation timeline. FirstStep won’t assume when your grace period ends or when payments start — those depend on your loans.</p>
        </div>
        {error && <Alert kind="error">{error}</Alert>}
        <fieldset>
          <legend>Where are you now?</legend>
          <div className="radio-cards" role="radiogroup" aria-invalid={!!errors.status}>
            {([['planning', 'Planning to graduate', 'More than a semester away'], ['soon', 'Graduating soon', 'This term or next'], ['graduated', 'Already graduated', 'Focus on repayment prep']] as const).map(([v, l, d]) => (
              <label key={v} className="radio-card">
                <input type="radio" name="gs" value={v} checked={status === v} onChange={() => setStatus(v)} />
                <span><strong>{l}</strong><br /><span className="small muted">{d}</span></span>
              </label>
            ))}
          </div>
          {errors.status && <span className="error-text">{errors.status}</span>}
        </fieldset>
        <div className="grid-2">
          <Field label={status === 'graduated' ? 'Graduation date' : 'Expected graduation date'} error={errors.date}>{(p) => <input {...p} type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />}</Field>
          <Field label="School or university" optional>{(p) => <input {...p} className="input" value={school} onChange={(e) => setSchool(e.target.value)} maxLength={120} autoComplete="organization" />}</Field>
          <Field label="Current employment" error={errors.emp}>
            {(p) => (
              <select {...p} className="select" value={emp} onChange={(e) => setEmp(e.target.value as EmploymentStatus)}>
                <option value="">Choose…</option>
                <option value="student">Student, not working</option>
                <option value="part_time">Working part-time</option>
                <option value="full_time">Working full-time</option>
                <option value="offer_accepted">Accepted a job offer</option>
                <option value="unemployed">Looking for work</option>
                <option value="other">Other</option>
              </select>
            )}
          </Field>
          <Field label="Expected job start date" optional help="If you know it. Used for planning, not assumed.">{(p) => <input {...p} type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
        </div>
        {status === 'graduated' && <Alert>Since you’ve graduated, your plan will focus on where you are in repayment preparation now.</Alert>}
      </form>
    </OnboardingLayout>
  );
}

export function LoansStep() {
  const { data, mutate } = useApp();
  const [adding, setAdding] = useState(false);
  const { run, pending, error, setError } = useAction();
  const pending_ = data.imports.find((i) => i.status === 'parsed' && i.origin === 'studentaid_file');
  useEffect(() => {
    if (data.onboarding.steps.loans === 'not_started') mutate('POST', '/api/onboarding/step', { step: 'loans', action: 'open' }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const go = (action: 'continue' | 'skip') =>
    run(async () => {
      await mutate('POST', '/api/onboarding/step', { step: 'loans', action });
      navigate('/onboarding/connect');
    });
  return (
    <OnboardingLayout
      current="loans"
      steps={data.onboarding.steps}
      actions={
        <>
          <Button variant="ghost" onClick={() => navigate('/onboarding/graduation')}>Back</Button>
          <div className="row">
            {!data.loans.length && <Button variant="secondary" onClick={() => go('skip')} disabled={pending}>I’ll add loans later</Button>}
            <Button onClick={() => go('continue')} loading={pending} disabled={!data.loans.length || !!pending_} arrow>Continue</Button>
          </div>
        </>
      }
    >
      <div className="stack stack-lg">
        <div className="stack stack-sm">
          <h1>Let’s understand your student loans.</h1>
          <p className="muted">Upload your student loan information from StudentAid.gov so FirstStep can organize your loans and help estimate your upcoming payments.</p>
        </div>
        {error && <Alert kind="error" onDismiss={() => setError(null)}>{error}</Alert>}
        {pending_ ? (
          <ImportReview key={pending_.id} imp={pending_} onDone={() => undefined} />
        ) : (
          <>
            <UploadInstructions />
            <UploadPanel onParsed={() => undefined} />
          </>
        )}
        <section className="stack">
          <div className="row-between">
            <h2 className="h3">Your loans {data.loans.length ? `(${data.loans.length})` : ''}</h2>
            <Button variant="secondary" onClick={() => setAdding(true)}><LuPlus aria-hidden="true" /> Add a loan manually</Button>
          </div>
          {data.loans.length === 0 ? (
            <p className="small muted">No loans saved yet. Upload your file above, or add loans by hand — including private loans, which aren’t on StudentAid.gov.</p>
          ) : (
            <div className="divider-list panel">
              {data.loans.map((l) => (
                <div key={l.id} className="row-between" style={{ padding: '10px 0' }}>
                  <span><strong>{l.name}</strong> <span className="small muted">{money(l.principal, { fallback: 'no balance' })} · {l.interestRate === null ? 'no rate' : pct(l.interestRate)}</span></span>
                  <SourceBadge source={l.source} />
                </div>
              ))}
            </div>
          )}
          {data.imports.some((i) => i.status === 'failed') && <p className="xs muted">Earlier upload attempts that couldn’t be read are listed in Setup &amp; import history.</p>}
        </section>
      </div>
      {adding && <LoanFormDialog open loan={null} onClose={() => setAdding(false)} />}
    </OnboardingLayout>
  );
}

export function ConnectStep() {
  const { data, mutate } = useApp();
  const [reviewId, setReviewId] = useState<string | null>(null);
  const { run, pending, error, setError } = useAction();
  useEffect(() => {
    if (data.onboarding.steps.connections === 'not_started') mutate('POST', '/api/onboarding/step', { step: 'connections', action: 'open' }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const connected = data.connections.some((c) => c.status === 'connected');
  const review = data.imports.find((i) => i.id === reviewId && i.status === 'parsed') ?? data.imports.find((i) => i.status === 'parsed' && i.origin === 'plaid_liabilities');
  const go = (action: 'continue' | 'skip') =>
    run(async () => {
      await mutate('POST', '/api/onboarding/step', { step: 'connections', action });
      navigate('/onboarding/review');
    });
  return (
    <OnboardingLayout
      current="connections"
      steps={data.onboarding.steps}
      actions={
        <>
          <Button variant="ghost" onClick={() => navigate('/onboarding/loans')}>Back</Button>
          <div className="row">
            {connected ? (
              <Button onClick={() => go('continue')} loading={pending} disabled={!!review} arrow>Continue</Button>
            ) : (
              <Button onClick={() => go('skip')} loading={pending} arrow>Continue without connecting</Button>
            )}
          </div>
        </>
      }
    >
      <div className="stack stack-lg">
        <div className="stack stack-sm">
          <h1>Let’s bring your financial picture together.</h1>
          <p className="muted">Connect your supported financial accounts so FirstStep can help organize your spending, understand your budget, and prepare for repayment.</p>
          <p className="small muted">This step is optional. Everything works with information you enter yourself.</p>
        </div>
        {error && <Alert kind="error" onDismiss={() => setError(null)}>{error}</Alert>}
        {review ? <ImportReview key={review.id} imp={review} onDone={() => setReviewId(null)} /> : <ConnectPanel onServicerImport={setReviewId} />}
      </div>
    </OnboardingLayout>
  );
}

export function ReviewStep() {
  const { data } = useApp();
  return (
    <OnboardingLayout
      current="summary"
      steps={data.onboarding.steps}
      actions={<Button variant="ghost" onClick={() => navigate('/onboarding/connect')}>Back</Button>}
    >
      <div className="stack stack-lg">
        <div className="stack stack-sm">
          <h1>Does this look like your monthly budget?</h1>
          <p className="muted">FirstStep organized your financial information into estimated monthly income and expenses. Review everything before we build your plan.</p>
        </div>
        <SummaryEditor onConfirmed={() => navigate('/onboarding/plan')} />
      </div>
    </OnboardingLayout>
  );
}

export function PlanStep() {
  const { data, mutate } = useApp();
  const { run, pending, error } = useAction();
  const plan = data.plan;
  const needs = data.onboarding.steps.plan === 'needs_attention' || !plan;
  if (!data.summary)
    return (
      <OnboardingLayout current="plan" steps={data.onboarding.steps}>
        <Alert kind="warn" title="Confirm your summary first">Your plan is built only from information you’ve reviewed. <ButtonLink to="/onboarding/review" size="sm">Review my summary</ButtonLink></Alert>
      </OnboardingLayout>
    );
  if (needs)
    return (
      <OnboardingLayout current="plan" steps={data.onboarding.steps}>
        <div className="stack">
          <h1>We couldn’t finish your plan.</h1>
          <p className="muted">Your confirmed information is saved — you don’t need to enter it again.</p>
          {error && <Alert kind="error">{error}</Alert>}
          <div className="row"><Button onClick={() => run(() => mutate('POST', '/api/plan/generate'))} loading={pending}>Try again</Button><ButtonLink to="/onboarding/review" variant="secondary">Review my summary</ButtonLink></div>
        </div>
      </OnboardingLayout>
    );
  const m = plan.metrics;
  const tasks = data.tasks.filter((t) => t.status === 'open').sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.priority] - ({ high: 0, medium: 1, low: 2 })[b.priority]);
  return (
    <OnboardingLayout current="plan" steps={data.onboarding.steps} actions={<><ButtonLink to="/app/review" variant="ghost">Revisit my summary</ButtonLink><ButtonLink to="/app" arrow>Go to my dashboard</ButtonLink></>}>
      <div className="stack stack-lg">
        <div className="stack stack-sm">
          <span className="eyebrow">{STAGE_LABEL[plan.stage]}</span>
          <h1>Your FirstStep plan is ready.</h1>
          <p className="muted">Built from the summary you confirmed on {dateLabel(data.summary.confirmedAt)}. Estimates only — your servicer has the official numbers.</p>
        </div>
        <div className="grid-3">
          <Stat label="Total recorded loan balance" value={money(m.totalBalance, { fallback: '—' })} sub={m.totalBalance === null ? 'No loan balances recorded' : m.totalInterestBalance ? `Includes ${money(m.totalInterestBalance)} unpaid interest` : `${m.loansCounted} loan(s)`} />
          <Stat label="Estimated monthly payment" value={m.estimatedMonthlyPayment === null ? '—' : money(m.estimatedMonthlyPayment)} sub={m.estimatedMonthlyPayment === null ? m.paymentMissing[0] : m.paymentMissing.length ? 'Leaves out loans with missing data' : 'Assumptions apply'}>
            <HowCalculated><p>Each loan is estimated separately with standard amortization and your stated or default term, then added together. Open My Finances for the per-loan breakdown.</p></HowCalculated>
          </Stat>
          <Stat label="Estimated take-home income" value={money(m.expectedIncome ?? m.currentIncome, { fallback: '—' })} sub={m.expectedIncome !== null ? 'Expected after graduation' : m.currentIncome !== null ? 'Current' : 'Not entered'} />
          <Stat label="Estimated monthly expenses" value={money(m.postGradExpenses ?? m.currentExpenses, { fallback: '—' })} sub="After graduation" />
          <Stat label="Projected monthly cash flow" value={m.projectedCashFlow === null ? '—' : <span className={m.projectedCashFlow < 0 ? 'neg' : ''}>{money(m.projectedCashFlow)}</span>} sub={m.projectedCashFlow === null ? 'Needs income and expenses' : 'After the estimated loan payment'} />
          <Stat label="Accessible emergency savings" value={money(m.accessibleSavings, { fallback: '—' })} />
        </div>
        <div className="grid-2">
          <section className="panel stack stack-sm">
            <div className="row-between"><h2 className="h4">Data completeness</h2><strong>{m.dataCompleteness}%</strong></div>
            <ProgressBar value={m.dataCompleteness} label="Data completeness" />
            {plan.missing.length > 0 ? <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{plan.missing.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="small muted">Nothing essential is missing.</p>}
          </section>
          <section className="panel stack stack-sm">
            <h2 className="h4">Timeline</h2>
            <ul className="timeline small">
              <li className={data.profile.graduationStatus === 'graduated' ? 'done' : 'next'}>Graduation: {dateLabel(data.profile.graduationDate)}</li>
              <li>Grace period end: {(() => { const l = data.loans.find((x) => x.gracePeriodEnd); return l ? `${dateLabel(l.gracePeriodEnd)} (${l.gracePeriodEndStatus.replace('_', ' ')})` : 'Unknown — confirm with your servicer'; })()}</li>
              <li>First payment: {(() => { const l = data.loans.find((x) => x.firstPaymentDate); return l ? `${dateLabel(l.firstPaymentDate)} (${l.firstPaymentDateStatus.replace('_', ' ')})` : 'Unknown — confirm with your servicer'; })()}</li>
            </ul>
          </section>
        </div>
        {plan.uncertainties.length > 0 && <Alert kind="warn" title="Things to keep in mind"><ul style={{ margin: 0, paddingLeft: 18 }}>{plan.uncertainties.map((u) => <li key={u}>{u}</li>)}</ul></Alert>}
        <section className="stack">
          <h2 className="h3">Recommended next steps</h2>
          <div className="grid-3">
            {plan.recommendations.map((r) => (
              <div key={r.title} className="panel stack stack-sm">
                <strong>{r.title}</strong>
                <p className="small muted">{r.detail}</p>
                <ButtonLink to={r.link} size="sm" variant="secondary" arrow>Open</ButtonLink>
              </div>
            ))}
          </div>
        </section>
        <section className="stack">
          <h2 className="h3">Your preparation plan</h2>
          <div className="panel divider-list">
            {tasks.slice(0, 6).map((t) => (
              <div key={t.id} className="task">
                <span className="eyebrow" style={{ width: 80 }}>{t.stage}</span>
                <div className="stack stack-sm"><strong>{t.title}</strong><span className="small muted">{t.reason}</span></div>
                <PriorityBadge priority={t.priority} />
              </div>
            ))}
          </div>
          <ButtonLink to="/app/plan" variant="secondary">See the full action plan</ButtonLink>
        </section>
      </div>
    </OnboardingLayout>
  );
}
