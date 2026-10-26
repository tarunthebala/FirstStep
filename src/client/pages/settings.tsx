import { useState } from 'react';
import { LuDownload, LuLogOut } from 'react-icons/lu';
import { dateLabel, dateTimeLabel } from '../../shared/format';
import { ONBOARDING_STEPS, type EmploymentStatus, type GraduationStatus, type NotificationPrefs } from '../../shared/types';
import { navigate } from '../lib/router';
import { useAction, useApp, useToast } from '../lib/state';
import { PageHead } from '../components/layouts';
import { SummaryEditor } from '../components/summary';
import { ConnectPanel } from '../components/connect';
import { Alert, Button, ButtonLink, Dialog, Field, NumberInput } from '../components/ui';

export function Settings() {
  const { data, mutate, signOut } = useApp();
  const p = data.profile;
  const toast = useToast();
  const [name, setName] = useState(p.displayName ?? '');
  const [date, setDate] = useState(p.graduationDate ?? '');
  const [gs, setGs] = useState<GraduationStatus | ''>(p.graduationStatus ?? '');
  const [school, setSchool] = useState(p.school ?? '');
  const [emp, setEmp] = useState<EmploymentStatus | ''>(p.employmentStatus ?? '');
  const [start, setStart] = useState(p.expectedEmploymentStart ?? '');
  const [term, setTerm] = useState<number | null>(data.settings.defaultTermMonths);
  const [delOpen, setDelOpen] = useState(false);
  const { run, pending } = useAction();

  const saveProfile = () => run(() => mutate('PUT', '/api/profile', { displayName: name.trim() || null, graduationDate: date || null, graduationStatus: gs || null, school: school.trim() || null, employmentStatus: emp || null, expectedEmploymentStart: start || null }), 'Profile saved.');
  const savePrefs = (patch: Partial<NotificationPrefs>) => run(() => mutate('PUT', '/api/notifications/prefs', patch), 'Notification preferences saved.');
  const exportData = async () => {
    const res = await fetch('/api/account/export', { credentials: 'same-origin' });
    if (!res.ok) return toast('Export failed. Please try again.', 'error');
    const blob = new Blob([JSON.stringify(await res.json(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `firststep-export-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(url);
    toast('Export downloaded.');
  };

  return (
    <>
      <PageHead eyebrow="Account" title="Settings & privacy" />
      <div className="stack stack-lg" style={{ maxWidth: 860 }}>
        <section className="panel stack" aria-labelledby="pr-h">
          <h2 id="pr-h" className="h3">Profile and graduation</h2>
          <p className="small muted">Signed in as {p.isDemo ? 'a demo account' : p.email}.</p>
          <div className="grid-2">
            <Field label="First name" optional>{(x) => <input {...x} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}</Field>
            <Field label="Graduation date">{(x) => <input {...x} type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
            <Field label="Graduation status">
              {(x) => (
                <select {...x} className="select" value={gs} onChange={(e) => setGs(e.target.value as GraduationStatus)}>
                  <option value="">Choose…</option><option value="planning">Planning to graduate</option><option value="soon">Graduating soon</option><option value="graduated">Already graduated</option>
                </select>
              )}
            </Field>
            <Field label="School" optional>{(x) => <input {...x} className="input" value={school} onChange={(e) => setSchool(e.target.value)} maxLength={120} />}</Field>
            <Field label="Employment">
              {(x) => (
                <select {...x} className="select" value={emp} onChange={(e) => setEmp(e.target.value as EmploymentStatus)}>
                  <option value="">Choose…</option><option value="student">Student, not working</option><option value="part_time">Working part-time</option><option value="full_time">Working full-time</option><option value="offer_accepted">Accepted a job offer</option><option value="unemployed">Looking for work</option><option value="other">Other</option>
                </select>
              )}
            </Field>
            <Field label="Expected job start" optional>{(x) => <input {...x} type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
          </div>
          <div><Button onClick={saveProfile} loading={pending}>Save profile</Button></div>
        </section>

        <section className="panel stack" aria-labelledby="bp-h">
          <h2 id="bp-h" className="h3">Income and budget preferences</h2>
          <Field label="Default repayment term for estimates" help="Used for loans without their own term. 120 months (10 years) is FirstStep’s default assumption — it isn’t a statement about your plan.">{(x) => <NumberInput {...x} min={12} max={600} suffix="months" value={term} onChange={setTerm} />}</Field>
          <label className="check small">
            <input type="checkbox" checked={data.settings.studentLoanPaymentInExpenses} onChange={(e) => run(() => mutate('PUT', '/api/settings/budget', { studentLoanPaymentInExpenses: e.target.checked }))} />
            <span>My expenses already include student loan payments (don’t add the estimate again)</span>
          </label>
          <div className="row"><Button variant="secondary" onClick={() => term && run(() => mutate('PUT', '/api/settings/budget', { defaultTermMonths: Math.round(term) }), 'Saved.')} disabled={!term || term < 12}>Save preferences</Button><ButtonLink to="/app/finances#budget" variant="ghost">Edit income and budget</ButtonLink></div>
        </section>

        <section id="notifications" className="panel stack" aria-labelledby="np-h">
          <h2 id="np-h" className="h3">Notifications</h2>
          <fieldset className="stack stack-sm">
            <legend>In-app reminders</legend>
            {([['tasks', 'Upcoming action plan tasks'], ['dates', 'Grace-period and first-payment dates you’ve entered'], ['onboarding', 'Unfinished setup'], ['savings', 'Savings milestones'], ['review', 'Information that may need review']] as const).map(([k, l]) => (
              <label key={k} className="check"><input type="checkbox" checked={data.prefs[k]} onChange={(e) => savePrefs({ [k]: e.target.checked })} /> {l}</label>
            ))}
          </fieldset>
          <label className="check" style={{ opacity: data.integrations.email ? 1 : 0.6 }}>
            <input type="checkbox" checked={data.prefs.emailOptIn} disabled={!data.integrations.email} onChange={(e) => savePrefs({ emailOptIn: e.target.checked })} />
            <span>Also email me reminders {!data.integrations.email && <span className="small muted">— unavailable: no email provider is configured</span>}</span>
          </label>
          <p className="xs muted">FirstStep reminders aren’t servicer notices and can’t guarantee any payment is made. Estimated dates are labeled as estimates.</p>
        </section>

        <section id="accounts" className="stack" aria-labelledby="ca-h">
          <h2 id="ca-h" className="h3">Connected accounts</h2>
          <ConnectPanel />
        </section>

        <section className="panel stack" aria-labelledby="dr-h">
          <h2 id="dr-h" className="h3">Your data</h2>
          <div className="row">
            <ButtonLink to="/app/review" variant="secondary">Review my financial data</ButtonLink>
            <ButtonLink to="/app/history" variant="secondary">Setup &amp; import history</ButtonLink>
            <Button variant="secondary" onClick={exportData}><LuDownload aria-hidden="true" /> Export my data (JSON)</Button>
          </div>
        </section>

        <section className="panel stack" aria-labelledby="pv-h">
          <h2 id="pv-h" className="h3">Privacy controls</h2>
          <ul className="small stack stack-sm" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Leave any balance out of FirstStep with “Leave out of FirstStep” on the review screen.</li>
            <li>Exclude connected accounts or individual transactions at any time.</li>
            <li>Learning coach: runs on built-in explanations — nothing you type is sent anywhere.</li>
            <li>Read the full <a href="/privacy">Privacy and Security</a> page.</li>
          </ul>
        </section>

        <section className="panel stack" aria-labelledby="ac-h" style={{ borderColor: 'var(--color-error)' }}>
          <h2 id="ac-h" className="h3">Account</h2>
          <div className="row">
            <Button variant="secondary" onClick={async () => (await signOut(), navigate('/login?signedOut=1'))}><LuLogOut aria-hidden="true" /> Sign out</Button>
            <Button variant="danger" onClick={() => setDelOpen(true)}>Delete account and data</Button>
          </div>
        </section>
      </div>
      {delOpen && <DeleteDialog onClose={() => setDelOpen(false)} isDemo={p.isDemo} />}
    </>
  );
}

function DeleteDialog({ onClose, isDemo }: { onClose: () => void; isDemo: boolean }) {
  const { mutate, signOut } = useApp();
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const { run, pending, error } = useAction();
  const del = () =>
    run(async () => {
      await mutate('POST', '/api/account/delete', { confirm, password });
      await signOut();
      navigate('/?deleted=1');
    });
  return (
    <Dialog open onClose={onClose} title="Delete your account?" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={del} loading={pending} disabled={confirm !== 'DELETE' || (!isDemo && !password)}>Permanently delete</Button></>}>
      <div className="stack">
        <p>This permanently deletes your account and all FirstStep data — loans, budget, imports, plans, scenarios and progress. Connected accounts are disconnected first. This can’t be undone.</p>
        <p className="small muted">Consider exporting your data first.</p>
        {error && <Alert kind="error">{error}</Alert>}
        <Field label='Type DELETE to confirm'>{(x) => <input {...x} className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />}</Field>
        {!isDemo && <Field label="Your password">{(x) => <input {...x} type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />}</Field>}
      </div>
    </Dialog>
  );
}

export function DataReview() {
  const { data } = useApp();
  const toast = useToast();
  return (
    <>
      <PageHead eyebrow="Financial data review" title="Review my data" intro={data.summary ? `Last confirmed ${dateTimeLabel(data.summary.confirmedAt)}. Correct anything that changed, then confirm to refresh your plan.` : 'Review and confirm your information to build your plan.'} />
      <SummaryEditor confirmLabel={data.summary ? 'Confirm and update my plan' : 'Confirm and Build My Plan'} onConfirmed={(err) => { if (err) toast(`Saved, but the plan couldn’t update: ${err}`, 'error'); else toast('Confirmed. Your plan is up to date.'); navigate(err ? '/onboarding/plan' : '/app'); }} />
    </>
  );
}

const STEP_LABEL = { graduation: 'Graduation date', loans: 'Student loan data', connections: 'Account connections', summary: 'Review and confirm', plan: 'Personalized plan' } as const;
const STEP_PATH = { graduation: '/onboarding/graduation', loans: '/onboarding/loans', connections: '/onboarding/connect', summary: '/onboarding/review', plan: '/onboarding/plan' } as const;
const STATE_LABEL = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed', skipped: 'Skipped', needs_attention: 'Needs attention' } as const;

export function History() {
  const { data } = useApp();
  return (
    <>
      <PageHead eyebrow="Records" title="Setup & import history" />
      <div className="stack stack-lg">
        <section className="stack" aria-labelledby="ob-h">
          <h2 id="ob-h" className="h3">Setup steps</h2>
          <div className="table-wrap">
            <table className="table stack-mobile">
              <thead><tr><th>Step</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {ONBOARDING_STEPS.map((k) => {
                  const s = data.onboarding.steps[k];
                  return (
                    <tr key={k}>
                      <td data-label="Step"><strong>{STEP_LABEL[k]}</strong></td>
                      <td data-label="Status"><span className={`badge badge-${s === 'completed' ? 'success' : s === 'needs_attention' ? 'error' : s === 'skipped' ? 'low' : 'review'}`}>{STATE_LABEL[s]}</span></td>
                      <td data-label="Open"><ButtonLink to={STEP_PATH[k]} size="sm" variant="ghost">Open</ButtonLink></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data.onboarding.completedAt && <p className="small muted">Setup finished {dateTimeLabel(data.onboarding.completedAt)}.</p>}
        </section>
        <section className="stack" aria-labelledby="im-h">
          <h2 id="im-h" className="h3">Loan imports</h2>
          {data.imports.length === 0 ? <p className="small muted">No imports yet.</p> : (
            <div className="table-wrap">
              <table className="table stack-mobile">
                <thead><tr><th>Imported</th><th>Source</th><th>Status</th><th className="r">Loans</th><th>Notes</th></tr></thead>
                <tbody>
                  {data.imports.map((i) => (
                    <tr key={i.id}>
                      <td data-label="Imported">{dateTimeLabel(i.importedAt)}</td>
                      <td data-label="Source">{i.fileName}<div className="xs muted">{i.origin === 'plaid_liabilities' ? 'Connected servicer' : 'StudentAid.gov file'}{i.fileRequestDate ? ` · file from ${i.fileRequestDate.slice(0, 10)}` : ''}</div></td>
                      <td data-label="Status"><span className={`badge badge-${i.status === 'confirmed' ? 'success' : i.status === 'failed' ? 'error' : i.status === 'parsed' ? 'review' : 'low'}`}>{i.status === 'parsed' ? 'Waiting for review' : i.status[0].toUpperCase() + i.status.slice(1)}</span></td>
                      <td data-label="Loans" className="r num">{i.loanCount}</td>
                      <td data-label="Notes" className="small">{i.errors[0] ?? (i.warnings.length ? `${i.warnings.length} warning(s)` : '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="grid-2" style={{ alignItems: 'start' }}>
          <div className="panel stack stack-sm">
            <h2 className="h4">Summary confirmations</h2>
            {data.summaryHistory.length === 0 ? <p className="small muted">None yet.</p> : <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{[...data.summaryHistory].sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt)).map((s) => <li key={s.id}>{dateTimeLabel(s.confirmedAt)}</li>)}</ul>}
          </div>
          <div className="panel stack stack-sm">
            <h2 className="h4">Plans generated</h2>
            {data.planHistory.length === 0 ? <p className="small muted">None yet.</p> : <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{[...data.planHistory].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)).map((p) => <li key={p.id}>{dateTimeLabel(p.generatedAt)} — {p.status}</li>)}</ul>}
          </div>
        </section>
      </div>
    </>
  );
}

export function Saved() {
  const { data, signOut } = useApp();
  const setupDone = !!data.onboarding.completedAt;
  return (
    <div className="stack" style={{ maxWidth: 620 }}>
      <h1>Your progress is saved.</h1>
      <p className="muted">{setupDone ? 'Everything you’ve entered is stored.' : 'When you log in again, you’ll pick up at the first unfinished step.'} Last updated {dateLabel(data.onboarding.updatedAt)}.</p>
      <div className="row">
        {!setupDone && <ButtonLink to="/onboarding" arrow>Continue setup</ButtonLink>}
        {setupDone && <ButtonLink to="/app" arrow>Go to dashboard</ButtonLink>}
        <Button variant="secondary" onClick={async () => (await signOut(), navigate('/login?signedOut=1'))}>Sign out</Button>
      </div>
    </div>
  );
}
