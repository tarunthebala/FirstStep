import { useState } from 'react';
import { dailyInterest, interestAccrual, isNum } from '../../shared/finance';
import { dateLabel, daysBetween, money, pct, todayISO } from '../../shared/format';
import { GRACE_CHECKLIST } from '../../shared/learn-ids';
import type { DateStatus, Loan } from '../../shared/types';
import { Link } from '../lib/router';
import { useAction, useApp } from '../lib/state';
import { PageHead } from '../components/layouts';
import { Alert, Button, DateStatusBadge, Dialog, Empty, Field, HowCalculated } from '../components/ui';

function interestTreatment(l: Loan): { label: string; accrues: boolean | null } {
  const t = `${l.loanType ?? ''} ${l.name}`.toLowerCase();
  if (l.category === 'private') return { label: 'Private loan: interest usually builds from disbursement. Your lender’s terms decide.', accrues: true };
  if (t.includes('unsubsidized') || t.includes('unsub')) return { label: 'Direct Unsubsidized: interest builds from the day the money was paid out, including in school and grace.', accrues: true };
  if (t.includes('subsidized')) return { label: 'Direct Subsidized: the government generally pays the interest while you’re in school at least half-time and during grace. Confirm with your servicer.', accrues: false };
  if (t.includes('plus')) return { label: 'PLUS loan: interest builds from disbursement.', accrues: true };
  return { label: 'Interest treatment unknown. Check the loan type with your servicer.', accrues: null };
}

export function LoanPlanner() {
  const { data, mutate } = useApp();
  const [editing, setEditing] = useState<Loan | null>(null);
  const { run } = useAction();
  const today = todayISO();
  const checklist = GRACE_CHECKLIST.map((c) => ({ ...c, done: data.tasks.some((t) => t.key === c.key && t.status === 'done') }));
  const doneCount = checklist.filter((c) => c.done).length;

  type Ev = { date: string | null; label: string; status: DateStatus | 'task' | 'goal'; detail?: string };
  const events: Ev[] = [{ date: data.profile.graduationDate, label: data.profile.graduationStatus === 'graduated' ? 'Graduated' : 'Expected graduation', status: data.profile.graduationDate ? 'user_entered' : 'unknown' }];
  for (const l of data.loans) {
    events.push({ date: l.gracePeriodEnd, label: `Grace period ends — ${l.name}`, status: l.gracePeriodEndStatus });
    events.push({ date: l.firstPaymentDate, label: `First payment — ${l.name}`, status: l.firstPaymentDateStatus });
  }
  for (const g of data.goals) if (g.targetDate) events.push({ date: g.targetDate, label: `Savings milestone: ${g.label} (${money(g.targetAmount, { whole: true })})`, status: 'goal' });
  for (const t of data.tasks.filter((t) => t.status === 'open' && t.dueDate)) events.push({ date: t.dueDate, label: t.title, status: 'task' });
  const dated = events.filter((e) => e.date).sort((a, b) => a.date!.localeCompare(b.date!));
  const undated = events.filter((e) => !e.date);

  return (
    <>
      <PageHead eyebrow="From school to repayment" title="Loan Planner" intro="Your dates, your interest, and a checklist for the grace period. FirstStep never assumes when your grace period ends — loans differ, so confirm each date with your servicer." />
      <div className="stack stack-lg">
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <section className="panel stack" aria-labelledby="tl-h">
            <h2 id="tl-h" className="h3">Timeline</h2>
            <ul className="timeline">
              {dated.map((e, i) => (
                <li key={i} className={e.date! <= today ? 'done' : ''}>
                  <div className="row"><strong>{e.label}</strong>{e.status === 'task' ? <span className="badge badge-low">Task</span> : e.status === 'goal' ? <span className="badge badge-low">Your target</span> : <DateStatusBadge status={e.status} />}</div>
                  <div className="small muted">{dateLabel(e.date)}{e.date! > today ? ` · in ${daysBetween(today, e.date!)} days` : ''}</div>
                </li>
              ))}
            </ul>
            {undated.length > 0 && (
              <div className="stack stack-sm">
                <h3 className="h4">Dates still unknown</h3>
                <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{undated.map((e, i) => <li key={i}>{e.label}</li>)}</ul>
                <p className="xs muted">Find these in your servicer account, then add them with “Edit dates” below. Federal Student Aid lists six months of grace for Direct Subsidized, Direct Unsubsidized and FFEL loans and nine months for Perkins; PLUS loans differ — your servicer has the exact dates.</p>
              </div>
            )}
          </section>

          <section className="panel stack" aria-labelledby="cl-h">
            <div className="row-between"><h2 id="cl-h" className="h3">Grace-period checklist</h2><span className="small muted">{doneCount} of {checklist.length}</span></div>
            <div className="divider-list">
              {checklist.map((c) => (
                <label key={c.key} className="task" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" className="task-check" checked={c.done} onChange={(e) => run(() => mutate('PUT', `/api/checklist/${c.key}`, { done: e.target.checked }))} />
                  <span className={c.done ? 'task-title' : ''} style={{ textDecoration: c.done ? 'line-through' : undefined }}>{c.title}</span>
                  <Link to={c.link} className="small" onClick={(e) => e.stopPropagation()}>Go</Link>
                </label>
              ))}
            </div>
          </section>
        </div>

        <section className="stack" aria-labelledby="int-h">
          <h2 id="int-h" className="h3">Interest on each loan</h2>
          {data.loans.length === 0 ? <Empty title="No loans yet" action={<Link to="/app/finances">Add a loan</Link>}>Add your loans to see how interest builds.</Empty> : (
            <div className="grid-2">
              {data.loans.map((l) => {
                const t = interestTreatment(l);
                const daily = dailyInterest(l.principal, l.interestRate);
                const untilFirst = l.firstPaymentDate && l.firstPaymentDate > today ? daysBetween(today, l.firstPaymentDate) : null;
                const accrueUntil = untilFirst !== null && t.accrues ? interestAccrual(l.principal, l.interestRate, untilFirst) : null;
                return (
                  <article key={l.id} className="panel stack stack-sm">
                    <div className="row-between"><h3 className="h4">{l.name}</h3><Button size="sm" variant="ghost" onClick={() => setEditing(l)}>Edit dates</Button></div>
                    <dl className="kv">
                      <dt>Principal</dt><dd>{money(l.principal, { fallback: 'Unknown' })}</dd>
                      <dt>Interest rate</dt><dd>{pct(l.interestRate)}</dd>
                      <dt>Unpaid interest recorded</dt><dd>{money(l.interestBalance, { fallback: 'Unknown' })}</dd>
                      <dt>Interest per day</dt><dd>{daily === null ? 'Needs principal and rate' : money(daily)}</dd>
                      <dt>About 30 days of interest</dt><dd>{money(interestAccrual(l.principal, l.interestRate, 30), { fallback: '—' })}</dd>
                      {accrueUntil !== null && <><dt>Until first payment ({untilFirst} days)</dt><dd>{money(accrueUntil)}</dd></>}
                    </dl>
                    <p className="small">{t.label}</p>
                    {t.accrues === false && daily !== null && <p className="xs muted">The figures above show what interest would be if it were charged; for subsidized periods it generally isn’t.</p>}
                    <HowCalculated label="Capitalization, in plain English">
                      <p>If unpaid interest is added to your principal (capitalized), you start paying interest on that interest. Whether and when that happens depends on your loan type and current federal rules, which have changed in recent years — ask your servicer. Paying interest as it builds keeps your balance from growing.</p>
                      <p>Interest per day = principal × rate ÷ 365 (simple daily interest, the method Federal Student Aid describes). Estimates only.</p>
                    </HowCalculated>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <Alert>Want the details? Read <Link to="/app/learn/understanding-interest">Understanding interest</Link> and <Link to="/app/learn/interest-capitalization">Interest capitalization</Link>.</Alert>
      </div>
      {editing && <DatesDialog loan={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function DatesDialog({ loan, onClose }: { loan: Loan; onClose: () => void }) {
  const { mutate } = useApp();
  const [first, setFirst] = useState(loan.firstPaymentDate ?? '');
  const [firstS, setFirstS] = useState<DateStatus>(loan.firstPaymentDateStatus === 'unknown' ? 'user_entered' : loan.firstPaymentDateStatus);
  const [grace, setGrace] = useState(loan.gracePeriodEnd ?? '');
  const [graceS, setGraceS] = useState<DateStatus>(loan.gracePeriodEndStatus === 'unknown' ? 'user_entered' : loan.gracePeriodEndStatus);
  const { run, pending } = useAction();
  const save = () =>
    run(async () => {
      await mutate('PATCH', `/api/loans/${loan.id}`, { firstPaymentDate: first || null, firstPaymentDateStatus: first ? firstS : 'unknown', gracePeriodEnd: grace || null, gracePeriodEndStatus: grace ? graceS : 'unknown' });
      onClose();
    }, 'Dates saved.');
  const sel = (v: DateStatus, set: (s: DateStatus) => void, label: string) => (
    <select className="select" aria-label={label} value={v} onChange={(e) => set(e.target.value as DateStatus)}>
      <option value="confirmed">Confirmed with my servicer</option>
      <option value="user_entered">Entered by me</option>
      <option value="estimated">My estimate</option>
    </select>
  );
  return (
    <Dialog open onClose={onClose} title={`Dates for ${loan.name}`} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={pending}>Save dates</Button></>}>
      <div className="stack">
        <Field label="Grace period end">{(p) => <input {...p} type="date" className="input" value={grace} onChange={(e) => setGrace(e.target.value)} />}</Field>
        {grace && sel(graceS, setGraceS, 'Where the grace-period date came from')}
        <Field label="First payment due">{(p) => <input {...p} type="date" className="input" value={first} onChange={(e) => setFirst(e.target.value)} />}</Field>
        {first && sel(firstS, setFirstS, 'Where the first payment date came from')}
        <p className="xs muted">Only choose “Confirmed” if you saw the date in your servicer account or a servicer notice. Reminders are FirstStep reminders, not official notices.</p>
        {!isNum(loan.principal) && <Alert kind="warn">This loan has no balance yet, so interest can’t be estimated.</Alert>}
      </div>
    </Dialog>
  );
}
