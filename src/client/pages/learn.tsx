import { useState } from 'react';
import { LuCircleCheck } from 'react-icons/lu';
import { amortizationTotals, dailyInterest, interestAccrual } from '../../shared/finance';
import { money } from '../../shared/format';
import { LEARN_MODULES, type ExerciseKind } from '../../shared/learn';
import { Link } from '../lib/router';
import { useAction, useSession } from '../lib/state';
import { PageHead } from '../components/layouts';
import { Alert, Button, ButtonLink, Field, MoneyInput, NumberInput, ProgressBar } from '../components/ui';

export function LearnIndex({ publicView = false }: { publicView?: boolean }) {
  const { data } = useSession();
  const base = publicView ? '/learn' : '/app/learn';
  const progress = data?.learning ?? [];
  const done = progress.filter((p) => p.completed).length;
  const body = (
    <div className="stack stack-lg">
      {!publicView && (
        <div className="panel stack stack-sm">
          <div className="row-between"><strong>Your progress</strong><span>{done} of {LEARN_MODULES.length} modules</span></div>
          <ProgressBar value={(done / LEARN_MODULES.length) * 100} label="Learning progress" />
        </div>
      )}
      <div className="grid-2">
        {LEARN_MODULES.map((m, i) => {
          const p = progress.find((x) => x.moduleId === m.id);
          return (
            <Link key={m.id} to={`${base}/${m.id}`} className="panel stack stack-sm card-link">
              <div className="row-between"><span className="eyebrow">Module {String(i + 1).padStart(2, '0')} · {m.minutes} min</span>{p?.completed && <span className="badge badge-success"><LuCircleCheck aria-hidden="true" /> Done</span>}</div>
              <h2 className="h3">{m.title}</h2>
              <p className="small muted">{m.objective}</p>
              {p && p.quizCorrect !== null && <span className="xs muted">Knowledge check: {p.quizCorrect ? 'correct' : 'try again'} · {p.attempts} attempt{p.attempts === 1 ? '' : 's'}</span>}
            </Link>
          );
        })}
      </div>
    </div>
  );
  if (publicView)
    return (
      <section className="section">
        <div className="container stack stack-lg">
          <div className="stack">
            <span className="eyebrow">Learn</span>
            <h1 className="display" style={{ maxWidth: '12ch' }}>Learn by understanding.</h1>
            <p className="lede">Ten short modules on interest, budgeting, repayment and your first payment. Free to read. <Link to="/signup">Create an account</Link> to track your progress.</p>
          </div>
          {body}
        </div>
      </section>
    );
  return (
    <>
      <PageHead eyebrow="Financial literacy" title="Learn" intro="Short modules that help you reason through decisions — not just give answers." />
      {body}
    </>
  );
}

export function LearnModulePage({ id, publicView = false }: { id: string; publicView?: boolean }) {
  const { status, data, mutate } = useSession();
  const m = LEARN_MODULES.find((x) => x.id === id);
  const [choice, setChoice] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const { run, pending } = useAction();
  const idx = LEARN_MODULES.findIndex((x) => x.id === id);
  const base = publicView ? '/learn' : '/app/learn';
  if (!m) return <div className="container section"><h1>Module not found</h1><Link to={base}>All modules</Link></div>;
  const prog = data?.learning.find((p) => p.moduleId === id);
  const authed = status === 'authed';
  const check = () => {
    if (choice === null) return;
    setChecked(true);
    if (authed) run(() => mutate('PUT', `/api/learning/${id}`, { quizCorrect: choice === m.quiz.correct }));
  };
  const next = LEARN_MODULES[idx + 1];
  const content = (
    <article className="stack stack-lg" style={{ maxWidth: 820 }}>
      <div className="stack stack-sm">
        <span className="eyebrow">Module {String(idx + 1).padStart(2, '0')} · {m.minutes} min</span>
        <h1>{m.title}</h1>
        <p className="lede"><strong>You’ll learn to:</strong> {m.objective.charAt(0).toLowerCase() + m.objective.slice(1)}</p>
      </div>
      <div className="prose stack">{m.explanation.map((p) => <p key={p}>{p}</p>)}</div>
      <div className="panel-muted stack stack-sm"><span className="eyebrow">Example</span><h2 className="h4">{m.example.title}</h2><p>{m.example.body}</p></div>
      <section className="panel stack" aria-labelledby="ex-h">
        <span className="eyebrow">Try it</span>
        <h2 id="ex-h" className="h4">{m.exercise.prompt}</h2>
        <Exercise kind={m.exercise.kind} />
      </section>
      <section className="panel stack" aria-labelledby="q-h">
        <span className="eyebrow">Knowledge check</span>
        <fieldset className="stack stack-sm">
          <legend id="q-h" className="h4">{m.quiz.question}</legend>
          {m.quiz.options.map((o, i) => (
            <label key={o} className="radio-card">
              <input type="radio" name="quiz" checked={choice === i} onChange={() => (setChoice(i), setChecked(false))} />
              <span>{o}</span>
            </label>
          ))}
        </fieldset>
        <div><Button onClick={check} disabled={choice === null} loading={pending}>Check answer</Button></div>
        <div aria-live="polite">
          {checked && choice !== null && (
            <Alert kind={choice === m.quiz.correct ? 'success' : 'warn'} title={choice === m.quiz.correct ? 'Correct.' : 'Not quite.'}>{m.quiz.explanation}</Alert>
          )}
        </div>
      </section>
      <section className="stack stack-sm">
        <h2 className="h4">Sources</h2>
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {m.references.map((r) => <li key={r.url}><a href={r.url} target="_blank" rel="noreferrer">{r.label}</a></li>)}
        </ul>
        <p className="xs muted">Checked October 2026. Rules change — the linked official pages are the authority.</p>
      </section>
      <div className="row-between">
        {authed && !publicView ? (
          prog?.completed ? <span className="badge badge-success"><LuCircleCheck aria-hidden="true" /> Module completed</span> : <Button onClick={() => run(() => mutate('PUT', `/api/learning/${id}`, { completed: true }), 'Module marked complete.')} loading={pending}>Mark module complete</Button>
        ) : (
          <span className="small muted"><Link to="/signup">Create an account</Link> to save your progress.</span>
        )}
        {next ? <ButtonLink to={`${base}/${next.id}`} variant="secondary" arrow>Next: {next.title}</ButtonLink> : <ButtonLink to={base} variant="secondary">All modules</ButtonLink>}
      </div>
    </article>
  );
  if (publicView) return <section className="section"><div className="container">{content}</div></section>;
  return content;
}

function Exercise({ kind }: { kind: ExerciseKind }) {
  switch (kind) {
    case 'interest': return <InterestEx />;
    case 'capitalization': return <CapEx />;
    case 'budget': return <BudgetEx />;
    case 'takehome': return <TakeHomeEx />;
    case 'emergency': return <EmergencyEx />;
    case 'compare_terms': return <TermsEx />;
    case 'federal_private': return <SortEx items={[['Fixed rates set by law', 'federal'], ['Rate may depend on your credit', 'private'], ['Access to federal income-based repayment plans', 'federal'], ['Repayment options set by each lender', 'private'], ['Deferment and forbearance under federal rules', 'federal'], ['A co-signer may be required', 'private']]} />;
    case 'loan_parts': return <SortEx labels={{ a: 'What you still owe', b: 'Yearly cost of borrowing', c: 'Who bills you' }} items={[['$5,500 principal', 'a'], ['6.39% fixed', 'b'], ['Your loan servicer', 'c']]} />;
    case 'missed': return <MissedEx />;
    case 'first_payment': return <ChecklistEx items={['Found out who my servicer is', 'Logged in to my servicer account', 'Confirmed my first due date', 'Compared repayment plans on StudentAid.gov', 'Practiced my payment for a month', 'Updated my contact information']} />;
  }
}

function InterestEx() {
  const [p, setP] = useState<number | null>(10000);
  const [r, setR] = useState<number | null>(6);
  const [d, setD] = useState<number | null>(30);
  const daily = dailyInterest(p, r);
  return (
    <div className="stack">
      <div className="grid-3">
        <Field label="Principal">{(x) => <MoneyInput {...x} value={p} onChange={setP} />}</Field>
        <Field label="Rate">{(x) => <NumberInput {...x} suffix="%" max={99} value={r} onChange={setR} />}</Field>
        <Field label="Days">{(x) => <NumberInput {...x} max={3650} value={d} onChange={setD} />}</Field>
      </div>
      <p aria-live="polite">Daily interest: <strong>{money(daily)}</strong>. Over {d ?? 0} days: <strong>{money(interestAccrual(p, r, d ?? 0))}</strong>.</p>
    </div>
  );
}
function CapEx() {
  const [p, setP] = useState<number | null>(10000);
  const [i, setI] = useState<number | null>(600);
  const [r, setR] = useState<number | null>(6);
  const a = p !== null && r !== null ? amortizationTotals(p, r, 120) : null;
  const b = p !== null && r !== null ? amortizationTotals(p + (i ?? 0), r, 120) : null;
  return (
    <div className="stack">
      <div className="grid-3">
        <Field label="Principal">{(x) => <MoneyInput {...x} value={p} onChange={setP} />}</Field>
        <Field label="Unpaid interest">{(x) => <MoneyInput {...x} value={i} onChange={setI} />}</Field>
        <Field label="Rate">{(x) => <NumberInput {...x} suffix="%" max={99} value={r} onChange={setR} />}</Field>
      </div>
      {a && b && <p aria-live="polite">On a 10-year schedule: <strong>{money(a.payment)}</strong>/month without capitalization vs. <strong>{money(b.payment)}</strong> with it — {money(b.totalPaid - a.totalPaid)} more over the life of the loan.</p>}
    </div>
  );
}
function BudgetEx() {
  const [inc, setInc] = useState<number | null>(3200);
  const [rent, setRent] = useState<number | null>(1100);
  const [food, setFood] = useState<number | null>(400);
  const [other, setOther] = useState<number | null>(800);
  const left = (inc ?? 0) - (rent ?? 0) - (food ?? 0) - (other ?? 0);
  return (
    <div className="stack">
      <div className="grid-4">
        <Field label="Take-home pay">{(x) => <MoneyInput {...x} value={inc} onChange={setInc} />}</Field>
        <Field label="Rent">{(x) => <MoneyInput {...x} value={rent} onChange={setRent} />}</Field>
        <Field label="Food">{(x) => <MoneyInput {...x} value={food} onChange={setFood} />}</Field>
        <Field label="Everything else">{(x) => <MoneyInput {...x} value={other} onChange={setOther} />}</Field>
      </div>
      <p aria-live="polite">Cash flow: <strong className={left < 0 ? 'neg' : ''}>{money(left)}</strong> a month{left < 0 ? ' — the plan needs changes to work.' : ' for savings, a loan payment and surprises.'}</p>
    </div>
  );
}
function TakeHomeEx() {
  const [salary, setSalary] = useState<number | null>(52000);
  const [rate, setRate] = useState<number | null>(24);
  const gross = (salary ?? 0) / 12;
  return (
    <div className="stack">
      <div className="grid-2">
        <Field label="Annual salary">{(x) => <MoneyInput {...x} value={salary} onChange={setSalary} />}</Field>
        <Field label="Estimated deductions" help="Taxes, Social Security and Medicare (7.65%), benefits, retirement. Your pay stub will tell you the real figure.">{(x) => <NumberInput {...x} suffix="%" max={70} value={rate} onChange={setRate} />}</Field>
      </div>
      <p aria-live="polite">Gross per month {money(gross, { whole: true })} → estimated take-home <strong>{money(gross * (1 - (rate ?? 0) / 100), { whole: true })}</strong>.</p>
    </div>
  );
}
function EmergencyEx() {
  const [exp, setExp] = useState<number | null>(2000);
  const [months, setMonths] = useState<number | null>(3);
  const [save, setSave] = useState<number | null>(150);
  const target = (exp ?? 0) * (months ?? 0);
  return (
    <div className="stack">
      <div className="grid-3">
        <Field label="Monthly essentials">{(x) => <MoneyInput {...x} value={exp} onChange={setExp} />}</Field>
        <Field label="Months to cover">{(x) => <NumberInput {...x} max={12} value={months} onChange={setMonths} />}</Field>
        <Field label="Saving per month">{(x) => <MoneyInput {...x} value={save} onChange={setSave} />}</Field>
      </div>
      <p aria-live="polite">Target <strong>{money(target, { whole: true })}</strong>{save ? <>, reached in about <strong>{Math.ceil(target / save)} months</strong> at {money(save, { whole: true })}/month.</> : '.'}</p>
    </div>
  );
}
function TermsEx() {
  const [bal, setBal] = useState<number | null>(25000);
  const [r, setR] = useState<number | null>(6);
  const rows = [120, 180, 240].map((t) => ({ t, x: bal !== null && r !== null ? amortizationTotals(bal, r, t) : null }));
  return (
    <div className="stack">
      <div className="grid-2">
        <Field label="Balance">{(x) => <MoneyInput {...x} value={bal} onChange={setBal} />}</Field>
        <Field label="Rate">{(x) => <NumberInput {...x} suffix="%" max={99} value={r} onChange={setR} />}</Field>
      </div>
      <div className="table-wrap"><table className="table"><thead><tr><th>Term</th><th className="r">Monthly</th><th className="r">Total interest</th></tr></thead><tbody>
        {rows.map(({ t, x }) => <tr key={t}><td>{t / 12} years</td><td className="r num">{money(x?.payment ?? null)}</td><td className="r num">{money(x?.totalInterest ?? null)}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}
function SortEx({ items, labels = { federal: 'Federal', private: 'Private' } }: { items: [string, string][]; labels?: Record<string, string> }) {
  const [ans, setAns] = useState<Record<number, string>>({});
  const [show, setShow] = useState(false);
  const score = items.filter(([, c], i) => ans[i] === c).length;
  return (
    <div className="stack">
      {items.map(([text, correct], i) => (
        <div key={text} className="row-between" style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 8 }}>
          <span>{text} {show && (ans[i] === correct ? <span className="badge badge-success">Right</span> : <span className="badge badge-review">{labels[correct]}</span>)}</span>
          <select className="select" style={{ width: 'auto' }} aria-label={`Category for: ${text}`} value={ans[i] ?? ''} onChange={(e) => setAns({ ...ans, [i]: e.target.value })}>
            <option value="">Choose…</option>
            {Object.entries(labels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
      ))}
      <div className="row"><Button variant="secondary" size="sm" onClick={() => setShow(true)}>Check</Button>{show && <span aria-live="polite">{score} of {items.length} correct.</span>}</div>
    </div>
  );
}
function MissedEx() {
  const [days, setDays] = useState(1);
  const msg = days < 1 ? 'Paid on time.' : days < 90 ? 'The loan is delinquent. Federal Student Aid says delinquency starts the first day after a missed payment. Contact your servicer now — you have the most options early.' : 'At 90 days, the servicer reports the delinquency to the national credit bureaus, which can hurt your credit. Continued delinquency risks default.';
  return (
    <div className="stack">
      <label className="small" htmlFor="miss">Days since the missed payment: <strong>{days}</strong></label>
      <input id="miss" type="range" min={0} max={180} value={days} style={{ ['--pct' as string]: `${(days / 180) * 100}%` }} onChange={(e) => setDays(Number(e.target.value))} />
      <Alert kind={days >= 90 ? 'error' : days >= 1 ? 'warn' : 'success'}>{msg}</Alert>
    </div>
  );
}
function ChecklistEx({ items }: { items: string[] }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  return (
    <div className="stack stack-sm">
      {items.map((t, i) => (
        <label key={t} className="check"><input type="checkbox" checked={done.has(i)} onChange={() => { const n = new Set(done); n.has(i) ? n.delete(i) : n.add(i); setDone(n); }} /> {t}</label>
      ))}
      <p className="small muted" aria-live="polite">{done.size} of {items.length} done. For a saved version, use the grace-period checklist in the Loan Planner.</p>
    </div>
  );
}

