import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { TOPICS, TOPIC_CATEGORIES } from '../../shared/coach-kb';
import { LuCopy, LuMessageCircle, LuPencil, LuRotateCcw, LuSave, LuTrash2 } from 'react-icons/lu';
import { compareRepayment, delayedEmployment, fromCents, isNum, lifestyle, practicePayment, toCents, unexpectedExpenses, type UnexpectedEvent } from '../../shared/finance';
import { money, pct } from '../../shared/format';
import { EXPENSE_LABELS, type ExpenseKey, type Scenario, type ScenarioType } from '../../shared/types';
import { api } from '../lib/api';
import { prefersReducedMotion } from '../lib/spring';
import { liveMetrics, type LiveMetrics } from '../lib/metrics';
import { navigate, useLocation } from '../lib/router';
import { useAction, useApp, type AppState } from '../lib/state';
import { PageHead } from '../components/layouts';
import { CompareBars, ProjectionChart } from '../components/charts';
import { Alert, Button, Dialog, Field, HowCalculated, MoneyInput, NumberInput, Tabs } from '../components/ui';

type TabId = 'lifestyle' | 'delay' | 'unexpected' | 'practice' | 'compare';
const TAB_TYPE: Record<TabId, ScenarioType> = { lifestyle: 'lifestyle', delay: 'delayed_employment', unexpected: 'unexpected', practice: 'practice_payment', compare: 'repayment_compare' };
const TYPE_TAB = Object.fromEntries(Object.entries(TAB_TYPE).map(([k, v]) => [v, k])) as Record<ScenarioType, TabId>;
const TAB_LABEL: Record<TabId, string> = { lifestyle: 'Lifestyle', delay: 'Delayed job start', unexpected: 'Unexpected expenses', practice: 'Practice a payment', compare: 'Repayment terms' };
const LIFESTYLE_KEYS: ExpenseKey[] = ['dining', 'subscriptions', 'shopping', 'transportation', 'housing', 'other'];

interface Explain {
  changed: ReactNode;
  why: ReactNode;
  next: ReactNode;
  summary: string; // plain text for the coach
}

// ───────── baselines (from saved data; never written back)
function postGradAmount(d: AppState, k: ExpenseKey) {
  const p = d.expenses.find((e) => e.key === k && e.scope === 'post_grad');
  if (p && isNum(p.monthlyAmount)) return p.monthlyAmount;
  return d.expenses.find((e) => e.key === k && e.scope === 'current')?.monthlyAmount ?? 0;
}
function baselineFor(tab: TabId, d: AppState, m: LiveMetrics): Record<string, unknown> {
  const income = m.expectedIncome ?? m.currentIncome ?? 0;
  const expenses = m.postGradExpenses ?? m.currentExpenses ?? 0;
  const savings = m.accessibleSavings ?? 0;
  switch (tab) {
    case 'lifestyle':
      return { amounts: Object.fromEntries(LIFESTYLE_KEYS.map((k) => [k, postGradAmount(d, k)])), months: 12 };
    case 'delay':
      return { startingSavings: savings, monthlyExpenses: expenses, monthlyIncome: income, delayDays: 60, movingCosts: 0, otherOneTime: 0, horizonMonths: 6, includeLoan: false, loanStartMonth: 4 };
    case 'unexpected':
      return { startingSavings: savings, monthlyIncome: income, monthlyExpenses: expenses, events: [{ label: 'Car repair', amount: 800, month: 2 }], incomeReductionPct: 0, incomeReductionStart: 3, incomeReductionMonths: 2, horizonMonths: 6 };
    case 'practice':
      return { payment: m.estimatedMonthlyPayment !== null ? Math.round(m.estimatedMonthlyPayment) : 200, monthlyIncome: income, monthlyExpenses: expenses, months: 12 };
    case 'compare':
      return { terms: [120, 180, 240], extraMonthly: 0 };
  }
}

export function MoneyLab() {
  const { data, mutate } = useApp();
  const { search } = useLocation();
  const m = useMemo(() => liveMetrics(data), [data]);
  const tab = ((search.get('tab') as TabId) in TAB_TYPE ? search.get('tab') : 'lifestyle') as TabId;
  const [inputs, setInputs] = useState<Record<TabId, Record<string, unknown>>>(() => ({
    lifestyle: baselineFor('lifestyle', data, m), delay: baselineFor('delay', data, m), unexpected: baselineFor('unexpected', data, m), practice: baselineFor('practice', data, m), compare: baselineFor('compare', data, m),
  }));
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [explain, setExplain] = useState<Explain | null>(null);
  const [nameDialog, setNameDialog] = useState<null | 'save' | 'rename'>(null);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { run, pending } = useAction();
  const loaded = data.scenarios.find((s) => s.id === loadedId) ?? null;
  const setTab = (t: TabId) => {
    navigate(`/app/money-lab?tab=${t}`, { replace: true });
    if (loaded && TAB_TYPE[t] !== loaded.type) setLoadedId(null);
  };
  const setTabInputs = (v: Record<string, unknown>) => setInputs((x) => ({ ...x, [tab]: v }));
  const reset = () => (setTabInputs(baselineFor(tab, data, m)), setLoadedId(null));
  const load = (s: Scenario) => {
    const t = TYPE_TAB[s.type];
    setInputs((x) => ({ ...x, [t]: { ...baselineFor(t, data, m), ...s.inputs } }));
    setLoadedId(s.id);
    navigate(`/app/money-lab?tab=${t}`, { replace: true });
  };
  const dirty = loaded ? JSON.stringify(loaded.inputs) !== JSON.stringify(inputs[tab]) : false;

  const save = () =>
    run(async () => {
      if (nameDialog === 'rename' && loaded) await mutate('PATCH', `/api/scenarios/${loaded.id}`, { name });
      else {
        const r = await mutate<{ saved: string }>('POST', '/api/scenarios', { name, type: TAB_TYPE[tab], inputs: inputs[tab] });
        setLoadedId(r.saved);
      }
      setNameDialog(null);
    }, nameDialog === 'rename' ? 'Scenario renamed.' : 'Scenario saved. Your budget wasn’t changed.');
  const updateSaved = () => run(() => mutate('PATCH', `/api/scenarios/${loaded!.id}`, { inputs: inputs[tab] }), 'Scenario updated.');
  const duplicate = () => run(async () => { const r = await mutate<{ saved: string }>('POST', `/api/scenarios/${loaded!.id}/duplicate`); setLoadedId(r.saved); }, 'Scenario duplicated.');
  const del = () => run(async () => { await mutate('DELETE', `/api/scenarios/${loaded!.id}`); setLoadedId(null); setConfirmDelete(false); }, 'Scenario deleted.');

  const typeScenarios = data.scenarios.filter((s) => s.type === TAB_TYPE[tab]);
  const props = { inputs: inputs[tab], setInputs: setTabInputs, baseline: baselineFor(tab, data, m), data, m, compare, onExplain: setExplain };

  return (
    <>
      <PageHead eyebrow="Practice before it counts" title="Money Lab" intro="Try what-ifs with your own numbers. Nothing here changes your saved budget or moves any money." />
      <div className="stack stack-lg">
        <Alert>Scenarios start from your saved data. Adjust anything — your baseline in My Finances stays exactly as it is.</Alert>
        <Tabs label="Scenario type" value={tab} onChange={setTab} tabs={(Object.keys(TAB_TYPE) as TabId[]).map((id) => ({ id, label: TAB_LABEL[id] }))} />

        <div className="panel-muted row-between" role="toolbar" aria-label="Scenario controls">
          <div className="row">
            <label className="small" htmlFor="saved-sel"><strong>Saved:</strong></label>
            <select id="saved-sel" className="select" style={{ width: 'auto', minWidth: 200 }} value={loaded?.id ?? ''} onChange={(e) => { const s = data.scenarios.find((x) => x.id === e.target.value); if (s) load(s); else reset(); }}>
              <option value="">Baseline (unsaved changes)</option>
              {typeScenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {dirty && <span className="badge badge-review">Unsaved edits</span>}
          </div>
          <div className="row">
            <Button size="sm" variant="ghost" onClick={reset}><LuRotateCcw aria-hidden="true" /> Reset to baseline</Button>
            <label className="check small" style={{ alignItems: 'center' }}><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Compare with baseline</label>
            {loaded && dirty && <Button size="sm" variant="secondary" onClick={updateSaved} loading={pending}>Update “{loaded.name}”</Button>}
            <Button size="sm" onClick={() => (setName(loaded ? `${loaded.name} v2` : `${TAB_LABEL[tab]} — ${new Date().toLocaleDateString()}`), setNameDialog('save'))}><LuSave aria-hidden="true" /> Save scenario</Button>
            {loaded && (
              <>
                <Button size="sm" variant="ghost" onClick={() => (setName(loaded.name), setNameDialog('rename'))}><LuPencil aria-hidden="true" /> Rename</Button>
                <Button size="sm" variant="ghost" onClick={duplicate}><LuCopy aria-hidden="true" /> Duplicate</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}><LuTrash2 aria-hidden="true" /> Delete</Button>
              </>
            )}
          </div>
        </div>

        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="stack stack-lg">
          {tab === 'lifestyle' && <Lifestyle {...props} />}
          {tab === 'delay' && <Delay {...props} />}
          {tab === 'unexpected' && <Unexpected {...props} />}
          {tab === 'practice' && <Practice {...props} />}
          {tab === 'compare' && <Compare {...props} />}
          {explain && (
            <section className="explain" aria-label="Explanation">
              <div><h2 className="h4">What changed?</h2><div className="small mt-8">{explain.changed}</div></div>
              <div><h2 className="h4">Why does it matter?</h2><div className="small mt-8">{explain.why}</div></div>
              <div><h2 className="h4">What could you do next?</h2><div className="small mt-8">{explain.next}</div></div>
            </section>
          )}
          <Coach tab={tab} scenario={explain ? { type: TAB_TYPE[tab], summary: explain.summary } : null} />
        </div>
      </div>

      <Dialog open={!!nameDialog} onClose={() => setNameDialog(null)} title={nameDialog === 'rename' ? 'Rename scenario' : 'Save scenario'} footer={<><Button variant="ghost" onClick={() => setNameDialog(null)}>Cancel</Button><Button onClick={save} loading={pending} disabled={!name.trim()}>Save</Button></>}>
        <div className="stack">
          <Field label="Scenario name">{(p) => <input {...p} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />}</Field>
          <p className="small muted">Saved scenarios are stored separately from your budget.</p>
        </div>
      </Dialog>
      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete scenario?" footer={<><Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="danger" onClick={del} loading={pending}>Delete</Button></>}>
        <p>“{loaded?.name}” will be removed. Your budget isn’t affected.</p>
      </Dialog>
    </>
  );
}

interface TabProps {
  inputs: Record<string, any>;
  setInputs: (v: Record<string, unknown>) => void;
  baseline: Record<string, any>;
  data: AppState;
  m: LiveMetrics;
  compare: boolean;
  onExplain: (e: Explain | null) => void;
}

function Slider({ label, value, onChange, min, max, step = 10, prefix = '$', suffix, help }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number; prefix?: string; suffix?: string; help?: string }) {
  const id = label.replace(/\W+/g, '-').toLowerCase();
  return (
    <div className="stack stack-sm">
      <div className="slider-row">
        <label htmlFor={id} className="small" style={{ fontWeight: 600 }}>{label}</label>
        <input type="range" min={min} max={Math.max(max, value)} step={step} value={value} style={{ ['--pct' as string]: `${((value - min) / Math.max(1, Math.max(max, value) - min)) * 100}%` }} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} aria-valuetext={`${prefix === '$' ? money(value, { whole: true }) : value}${suffix ?? ''}`} />
        <NumberInput id={id} value={value} onChange={(v) => onChange(v ?? 0)} prefix={prefix || undefined} suffix={suffix} />
      </div>
      {help && <span className="xs muted">{help}</span>}
    </div>
  );
}

function useExplain(onExplain: TabProps['onExplain'], e: Explain | null, deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => onExplain(e), deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => onExplain(null), []);
}

// ───────── A. Lifestyle
function Lifestyle({ inputs, setInputs, baseline, m, compare, onExplain }: TabProps) {
  const amounts = inputs.amounts as Record<string, number>;
  const base = baseline.amounts as Record<string, number>;
  const otherCats = fromCents(toCents(m.postGradExpenses ?? m.currentExpenses ?? 0) - Object.values(base).reduce((a, v) => a + toCents(v), 0));
  const income = m.expectedIncome ?? m.currentIncome;
  const loanPay = m.estimatedMonthlyPayment;
  const r = lifestyle({ baseline: base, adjusted: amounts, monthlyIncome: income, otherExpenses: otherCats, loanPayment: loanPay, months: inputs.months });
  const afterLoan = r.cashFlowAfter !== null && loanPay !== null ? r.cashFlowAfter - loanPay : null;
  const cuts = r.changes.filter((c) => c.after < c.before);
  const e: Explain = {
    changed: r.changes.length ? <>{r.changes.map((c) => `${EXPENSE_LABELS[c.key as ExpenseKey]} ${money(c.before, { whole: true })} → ${money(c.after, { whole: true })}`).join('; ')}.</> : 'Nothing yet — move a slider to try a change.',
    why: r.changes.length ? (
      <>Your monthly spending {r.freedMonthly >= 0 ? 'drops' : 'rises'} by {money(Math.abs(r.freedMonthly))}. Sustained for {r.months} months, that {r.freedMonthly >= 0 ? 'frees up' : 'costs'} {money(Math.abs(r.freedOverPeriod))}, before other changes or interest.{afterLoan !== null && <> After the estimated {money(loanPay)} loan payment, you’d have {money(afterLoan)} a month{afterLoan < 0 ? ' — still short' : ''}.</>}</>
    ) : 'Each change is applied to your post-graduation budget forecast, and the difference is multiplied by the number of months.',
    next: cuts.length ? `You could direct some of the ${money(r.freedMonthly, { whole: true })} toward emergency savings or extra loan payments, or keep it as breathing room. If this feels realistic, update your budget in My Finances — this scenario won’t do it for you.` : 'Try lowering one or two categories you feel flexible about and see what it adds up to.',
    summary: `Lifestyle changes free ${money(r.freedMonthly)} per month (${money(r.freedOverPeriod)} over ${r.months} months). Cash flow before loan: ${money(r.cashFlowBefore)} → ${money(r.cashFlowAfter)}.`,
  };
  useExplain(onExplain, e, [JSON.stringify(inputs), income, loanPay]);
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <section className="panel stack">
        <h2 className="h3">Adjust monthly spending</h2>
        <p className="xs muted">Starting values are your post-graduation budget (current amounts where you haven’t set one).</p>
        {LIFESTYLE_KEYS.map((k) => (
          <Slider key={k} label={EXPENSE_LABELS[k]} value={amounts[k] ?? 0} min={0} max={Math.max(200, Math.round((base[k] ?? 0) * 2))} onChange={(v) => setInputs({ ...inputs, amounts: { ...amounts, [k]: v } })} help={amounts[k] !== base[k] ? `Baseline ${money(base[k], { whole: true })}` : undefined} />
        ))}
        <Slider label="Period to add up" value={inputs.months} min={1} max={36} step={1} prefix="" suffix=" mo" onChange={(v) => setInputs({ ...inputs, months: Math.max(1, Math.round(v)) })} />
      </section>
      <section className="panel stack">
        <h2 className="h3">Results</h2>
        <dl className="kv" style={{ fontSize: 16 }}>
          <dt>Freed up each month</dt><dd className={r.freedMonthly < 0 ? 'neg' : 'pos'}><strong>{money(r.freedMonthly)}</strong></dd>
          <dt>Over {r.months} months</dt><dd><strong>{money(r.freedOverPeriod)}</strong></dd>
          <dt>Cash flow before loan payment</dt><dd>{money(r.cashFlowBefore, { fallback: 'needs income' })} → {money(r.cashFlowAfter, { fallback: '—' })}</dd>
          <dt>Covers estimated payment ({money(loanPay, { fallback: 'n/a' })})?</dt><dd>{r.coversPaymentAfter === null ? 'Not calculable' : r.coversPaymentAfter ? 'Yes' : 'Not fully'}{r.coversPaymentBefore !== null && r.coversPaymentBefore !== r.coversPaymentAfter ? ` (was ${r.coversPaymentBefore ? 'yes' : 'no'})` : ''}</dd>
        </dl>
        {compare && <CompareBars title="Baseline compared with scenario" items={[{ label: 'Baseline monthly cash flow (before loan)', value: r.cashFlowBefore }, { label: 'Scenario monthly cash flow (before loan)', value: r.cashFlowAfter }]} />}
        <HowCalculated><p>Change per category is baseline − new amount; the total is multiplied by the period. Cash flow = expected (or current) income − all post-graduation expenses, with only the adjusted categories changed. No interest or investment returns are added.</p></HowCalculated>
      </section>
    </div>
  );
}

// ───────── B. Delayed employment
function Delay({ inputs, setInputs, baseline, m, compare, onExplain }: TabProps) {
  const r = delayedEmployment({ ...inputs, monthlyLoanPayment: inputs.includeLoan ? m.estimatedMonthlyPayment ?? 0 : 0, loanPaymentStartMonth: inputs.includeLoan ? inputs.loanStartMonth : null } as never);
  const base = delayedEmployment({ ...baseline, delayDays: 0 } as never);
  const presets = [0, 30, 60, 90];
  const e: Explain = {
    changed: `Job starts ${inputs.delayDays === 0 ? 'immediately' : `after ${inputs.delayDays} days`}, with ${money(inputs.startingSavings, { whole: true })} in savings, ${money(inputs.monthlyExpenses, { whole: true })}/month in expenses${inputs.movingCosts || inputs.otherOneTime ? ` and ${money(inputs.movingCosts + inputs.otherOneTime, { whole: true })} in one-time costs` : ''}.`,
    why: r.firstShortfallMonth ? `Savings run out in month ${r.firstShortfallMonth}. The gap is deepest in month ${r.peakShortfallMonth} at ${money(r.peakShortfall)} — money you’d need from somewhere else, not a balance you have.${r.totalShortfall ? ` By month ${inputs.horizonMonths} you’re still ${money(r.totalShortfall)} short.` : ` Income catches up by month ${inputs.horizonMonths}, ending with ${money(r.endingBalance)}.`}` : `Savings last the whole ${inputs.horizonMonths} months, ending around ${money(r.endingBalance)}${base.endingBalance > r.endingBalance ? ` — ${money(base.endingBalance - r.endingBalance)} less than starting work right away` : ''}.`,
    next: r.firstShortfallMonth ? 'You could build a larger cushion before graduating, lower expenses during a job search, or plan for temporary income. If repayment could start during a gap, ask your servicer which options apply.' : 'This cushion looks enough for this scenario. Try a longer delay or adding one-time costs to stress-test it.',
    summary: `Delayed start of ${inputs.delayDays} days. ${r.firstShortfallMonth ? `Shortfall starts month ${r.firstShortfallMonth}, deepest ${money(r.peakShortfall)} in month ${r.peakShortfallMonth}, ${money(r.totalShortfall)} at the end.` : `Ending savings ${money(r.endingBalance)}.`}`,
  };
  useExplain(onExplain, e, [JSON.stringify(inputs), m.estimatedMonthlyPayment]);
  const set = (k: string, v: unknown) => setInputs({ ...inputs, [k]: v });
  return (
    <div className="stack stack-lg">
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <section className="panel stack">
          <h2 className="h3">When does your job start?</h2>
          <div className="chip-row" role="group" aria-label="Delay presets">
            {presets.map((d) => <button key={d} className="chip" aria-pressed={inputs.delayDays === d} onClick={() => set('delayDays', d)}>{d === 0 ? 'Immediately' : `After ${d} days`}</button>)}
          </div>
          <Slider label="Custom delay" value={inputs.delayDays} min={0} max={365} step={5} prefix="" suffix=" days" onChange={(v) => set('delayDays', Math.max(0, Math.round(v)))} />
          <Slider label="Current savings" value={inputs.startingSavings} min={0} max={20000} step={50} onChange={(v) => set('startingSavings', v)} />
          <Slider label="Monthly living expenses" value={inputs.monthlyExpenses} min={0} max={8000} step={25} onChange={(v) => set('monthlyExpenses', v)} />
          <Slider label="Expected take-home income" value={inputs.monthlyIncome} min={0} max={12000} step={50} onChange={(v) => set('monthlyIncome', v)} help="Monthly, once the job starts. Income is $0 during the delay." />
          <Slider label="Moving expenses" value={inputs.movingCosts} min={0} max={5000} step={25} onChange={(v) => set('movingCosts', v)} />
          <Slider label="Other one-time costs" value={inputs.otherOneTime} min={0} max={5000} step={25} onChange={(v) => set('otherOneTime', v)} help="Deposits, furniture, a work wardrobe…" />
          <Slider label="Months to project" value={inputs.horizonMonths} min={2} max={24} step={1} prefix="" suffix=" mo" onChange={(v) => set('horizonMonths', Math.round(v))} />
          <label className="check small"><input type="checkbox" checked={inputs.includeLoan} disabled={m.estimatedMonthlyPayment === null} onChange={(e) => set('includeLoan', e.target.checked)} /> Include my estimated loan payment ({money(m.estimatedMonthlyPayment, { fallback: 'not calculable' })}) starting in month</label>
          {inputs.includeLoan && <Slider label="Loan payment starts in month" value={inputs.loanStartMonth} min={1} max={inputs.horizonMonths} step={1} prefix="" onChange={(v) => set('loanStartMonth', Math.round(v))} help="You choose this — FirstStep doesn’t assume your first payment date." />}
        </section>
        <section className="panel stack">
          <h2 className="h3">Projected savings</h2>
          <ProjectionChart rows={r.rows} startingSavings={inputs.startingSavings} title={`Projected savings over ${inputs.horizonMonths} months with a ${inputs.delayDays}-day delay`} />
          <dl className="kv">
            <dt>Ending savings</dt><dd><strong>{money(r.endingBalance)}</strong></dd>
            <dt>Largest shortfall</dt><dd className={r.peakShortfall ? 'neg' : ''}><strong>{r.peakShortfall ? `${money(r.peakShortfall)} (month ${r.peakShortfallMonth})` : 'None'}</strong></dd>
            <dt>Shortfall at the end</dt><dd className={r.totalShortfall ? 'neg' : ''}>{r.totalShortfall ? money(r.totalShortfall) : 'None'}</dd>
            <dt>Becomes unsustainable</dt><dd>{r.firstShortfallMonth ? `Month ${r.firstShortfallMonth}` : 'Not within this period'}</dd>
          </dl>
          {compare && <CompareBars title="Starting immediately compared with this scenario" items={[{ label: 'Start immediately: ending savings', value: base.endingBalance - base.totalShortfall }, { label: 'This scenario: ending savings', value: r.endingBalance - r.totalShortfall, note: 'Negative means a shortfall' }]} />}
          <HowCalculated>{r.assumptions.map((a) => <p key={a}>{a}</p>)}</HowCalculated>
        </section>
      </div>
    </div>
  );
}

// ───────── C. Unexpected expenses
const EVENT_TYPES = ['Car repair', 'Medical bill', 'Moving expenses', 'Security deposit', 'Laptop replacement', 'Custom expense'];
function Unexpected({ inputs, setInputs, baseline, compare, onExplain }: TabProps) {
  const events = inputs.events as UnexpectedEvent[];
  const r = unexpectedExpenses(inputs as never);
  const base = unexpectedExpenses({ ...baseline, events: [], incomeReductionPct: 0 } as never);
  const total = events.reduce((a, ev) => a + (ev.amount || 0), 0);
  const set = (k: string, v: unknown) => setInputs({ ...inputs, [k]: v });
  const setEv = (i: number, p: Partial<UnexpectedEvent>) => set('events', events.map((ev, j) => (j === i ? { ...ev, ...p } : ev)));
  const e: Explain = {
    changed: `${events.length ? events.map((ev) => `${ev.label} ${money(ev.amount, { whole: true })} in month ${ev.month}`).join('; ') : 'No surprise costs'}${inputs.incomeReductionPct ? `; income down ${inputs.incomeReductionPct}% for ${inputs.incomeReductionMonths} month(s) from month ${inputs.incomeReductionStart}` : ''}.`,
    why: r.firstShortfallMonth ? `These costs push you past your savings in month ${r.firstShortfallMonth}. The deepest gap is ${money(r.peakShortfall)} in month ${r.peakShortfallMonth}${r.totalShortfall ? `, and you’re still ${money(r.totalShortfall)} short by month ${inputs.horizonMonths}` : ', then income catches up'}.` : `Your savings absorb these costs. You’d end at ${money(r.endingBalance)} instead of ${money(base.endingBalance)} — ${money(base.endingBalance - r.endingBalance)} less.`,
    next: r.firstShortfallMonth ? 'An emergency fund sized to cover a surprise like this would prevent the gap. You could also look at which monthly costs could flex temporarily.' : `A cushion of at least ${money(total, { whole: true })} handled this. Consider whether your savings goal covers a surprise and a slow month at once.`,
    summary: `Unexpected costs total ${money(total)}. ${r.firstShortfallMonth ? `Shortfall from month ${r.firstShortfallMonth}, ${money(r.totalShortfall)}.` : `Ending savings ${money(r.endingBalance)}.`}`,
  };
  useExplain(onExplain, e, [JSON.stringify(inputs)]);
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <section className="panel stack">
        <h2 className="h3">Surprise costs</h2>
        {events.map((ev, i) => (
          <div key={i} className="panel-muted stack stack-sm">
            <div className="row-between">
              <select className="select" style={{ width: 'auto' }} aria-label={`Expense ${i + 1} type`} value={EVENT_TYPES.includes(ev.label) ? ev.label : 'Custom expense'} onChange={(e) => setEv(i, { label: e.target.value })}>
                {EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
              <Button size="sm" variant="ghost" onClick={() => set('events', events.filter((_, j) => j !== i))} aria-label={`Remove ${ev.label}`}><LuTrash2 aria-hidden="true" /></Button>
            </div>
            <div className="grid-2">
              <Field label="Amount">{(p) => <MoneyInput {...p} value={ev.amount} onChange={(v) => setEv(i, { amount: v ?? 0 })} />}</Field>
              <Field label="Month it happens">{(p) => <NumberInput {...p} min={1} max={inputs.horizonMonths} value={ev.month} onChange={(v) => setEv(i, { month: Math.max(1, Math.round(v ?? 1)) })} />}</Field>
            </div>
          </div>
        ))}
        <Button variant="secondary" size="sm" onClick={() => set('events', [...events, { label: 'Medical bill', amount: 500, month: 1 }])} disabled={events.length >= 8}>Add a surprise cost</Button>
        <h3 className="h4">Temporary income reduction</h3>
        <Slider label="Income drop" value={inputs.incomeReductionPct} min={0} max={100} step={5} prefix="" suffix="%" onChange={(v) => set('incomeReductionPct', v)} />
        {inputs.incomeReductionPct > 0 && (
          <div className="grid-2">
            <Field label="Starting month">{(p) => <NumberInput {...p} min={1} max={inputs.horizonMonths} value={inputs.incomeReductionStart} onChange={(v) => set('incomeReductionStart', Math.max(1, Math.round(v ?? 1)))} />}</Field>
            <Field label="For how many months">{(p) => <NumberInput {...p} min={1} max={24} value={inputs.incomeReductionMonths} onChange={(v) => set('incomeReductionMonths', Math.max(1, Math.round(v ?? 1)))} />}</Field>
          </div>
        )}
        <details className="how">
          <summary>Starting numbers</summary>
          <div className="stack">
            <Slider label="Savings" value={inputs.startingSavings} min={0} max={20000} step={50} onChange={(v) => set('startingSavings', v)} />
            <Slider label="Monthly income" value={inputs.monthlyIncome} min={0} max={12000} step={50} onChange={(v) => set('monthlyIncome', v)} />
            <Slider label="Monthly expenses" value={inputs.monthlyExpenses} min={0} max={8000} step={25} onChange={(v) => set('monthlyExpenses', v)} />
          </div>
        </details>
      </section>
      <section className="panel stack">
        <h2 className="h3">Impact</h2>
        <ProjectionChart rows={r.rows} startingSavings={inputs.startingSavings} title="Projected savings with unexpected expenses" />
        <dl className="kv">
          <dt>Total surprise costs</dt><dd>{money(total)}</dd>
          <dt>Monthly cash flow (normal month)</dt><dd className={inputs.monthlyIncome - inputs.monthlyExpenses < 0 ? 'neg' : ''}>{money(inputs.monthlyIncome - inputs.monthlyExpenses)}</dd>
          <dt>Ending savings</dt><dd><strong>{money(r.endingBalance)}</strong></dd>
          <dt>Can you cover it?</dt><dd>{r.firstShortfallMonth ? <span className="neg">Short from month {r.firstShortfallMonth}</span> : 'Yes, with savings'}</dd>
        </dl>
        {compare && <CompareBars title="Without surprises compared with this scenario" items={[{ label: 'Without surprises: ending savings', value: base.endingBalance - base.totalShortfall }, { label: 'This scenario: ending savings', value: r.endingBalance - r.totalShortfall }]} />}
      </section>
    </div>
  );
}

// ───────── D. Practice a payment
function Practice({ inputs, setInputs, m, compare, onExplain }: TabProps) {
  const r = practicePayment({ monthlyIncome: inputs.monthlyIncome, monthlyExpenses: inputs.monthlyExpenses, payment: inputs.payment, months: inputs.months });
  const set = (k: string, v: unknown) => setInputs({ ...inputs, [k]: v });
  const e: Explain | null = r.ok
    ? {
        changed: `You practiced a ${money(inputs.payment)} monthly payment against ${money(inputs.monthlyIncome)} income and ${money(inputs.monthlyExpenses)} expenses.`,
        why: <>Cash flow goes from {money(r.before)} to {money(r.after)} a month{r.paymentShareOfIncome !== null ? `; the payment is ${pct(r.paymentShareOfIncome * 100, 1)} of income` : ''}. Over {r.months} months you could set aside {money(r.savedAfter)} instead of {money(r.savedBefore)}.{r.after < 0 && ' The payment doesn’t fit without changes.'}</>,
        next: r.after < 0 ? 'Try the Lifestyle tab to find room, or ask your servicer about plans that base payments on income.' : 'You could rehearse this for real: move this amount into savings each month until repayment starts. If it’s comfortable, you’re ready — and you’ll have a buffer.',
        summary: `Practice payment ${money(inputs.payment)}: cash flow ${money(r.before)} → ${money(r.after)}.`,
      }
    : null;
  useExplain(onExplain, e, [JSON.stringify(inputs)]);
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <section className="panel stack">
        <Alert kind="warn" title="This is a simulation">It does not make, schedule or promise a payment. Your servicer sets your real amount and due date.</Alert>
        <Slider label="Practice payment" value={inputs.payment} min={0} max={Math.max(1500, Math.round((m.estimatedMonthlyPayment ?? 0) * 2))} step={5} onChange={(v) => set('payment', v)} help={m.estimatedMonthlyPayment !== null ? `FirstStep’s estimate: ${money(m.estimatedMonthlyPayment)}` : 'Add loan details to see an estimate.'} />
        <Slider label="Monthly take-home income" value={inputs.monthlyIncome} min={0} max={12000} step={50} onChange={(v) => set('monthlyIncome', v)} />
        <Slider label="Monthly expenses" value={inputs.monthlyExpenses} min={0} max={8000} step={25} onChange={(v) => set('monthlyExpenses', v)} />
        <Slider label="Months" value={inputs.months} min={1} max={36} step={1} prefix="" suffix=" mo" onChange={(v) => set('months', Math.round(v))} />
      </section>
      <section className="panel stack">
        <h2 className="h3">Before and after</h2>
        {r.ok ? (
          <>
            <CompareBars title="Cash flow before and after the practice payment" items={[{ label: 'Cash flow before the payment', value: r.before }, { label: 'After the payment (discretionary money left)', value: r.after }]} />
            <dl className="kv">
              <dt>Payment share of income</dt><dd>{r.paymentShareOfIncome === null ? '—' : pct(r.paymentShareOfIncome * 100, 1)}</dd>
              <dt>Savings over {r.months} months, before</dt><dd>{money(r.savedBefore)}</dd>
              <dt>Savings over {r.months} months, after</dt><dd><strong>{money(r.savedAfter)}</strong></dd>
            </dl>
            {compare && <p className="small muted">Baseline (no payment) leaves {money(r.before)} a month; this scenario leaves {money(r.after)}.</p>}
            <HowCalculated><p>Before = income − expenses. After = before − payment. Savings = whatever cash flow is positive, added up each month, without interest.</p></HowCalculated>
          </>
        ) : <p className="muted">Enter income and expenses to practice.</p>}
      </section>
    </div>
  );
}

// ───────── E. Repayment terms
function Compare({ inputs, setInputs, data, onExplain }: TabProps) {
  const terms = inputs.terms as number[];
  const opts = terms.map((t) => ({ label: `${t / 12}-year fixed`, termMonths: t, extraMonthly: inputs.extraMonthly }));
  const r = compareRepayment(data.loans, opts);
  const ok = r.results.filter((x) => x.ok);
  const [a, b] = [ok[0], ok[ok.length - 1]];
  const e: Explain | null = ok.length >= 1 && a && b
    ? {
        changed: `Comparing ${ok.map((x) => x.label).join(', ')}${inputs.extraMonthly ? ` with ${money(inputs.extraMonthly)} extra each month` : ''} across ${r.loansUsed} loan(s).`,
        why: a === b ? `${a.label}: about ${money(a.monthlyPayment)}/month and ${money(a.totalInterest)} interest.` : `Going from ${a.label} to ${b.label} lowers the monthly payment by about ${money((a.monthlyPayment ?? 0) - (b.monthlyPayment ?? 0))} but adds about ${money((b.totalInterest ?? 0) - (a.totalInterest ?? 0))} in total interest.`,
        next: 'These are illustrations, not plan offers. Use the official Repayment Calculator on StudentAid.gov or ask your servicer which plans apply to your loans — federal options changed on July 1, 2026.',
        summary: ok.map((x) => `${x.label}: ${money(x.monthlyPayment)}/mo, ${money(x.totalInterest)} interest`).join('; '),
      }
    : null;
  useExplain(onExplain, e, [JSON.stringify(inputs), data.loans]);
  const toggle = (t: number) => setInputs({ ...inputs, terms: terms.includes(t) ? terms.filter((x) => x !== t) : [...terms, t].sort((x, y) => x - y) });
  if (r.loansUsed === 0) return <Alert kind="warn" title="Not enough loan information">Repayment comparisons need at least one loan with both a balance and an interest rate. Add them in My Finances.</Alert>;
  return (
    <div className="stack">
      <section className="panel stack">
        <h2 className="h3">Illustrative fixed-payment terms</h2>
        <div className="chip-row" role="group" aria-label="Terms to compare">
          {[120, 180, 240, 300].map((t) => <button key={t} className="chip" aria-pressed={terms.includes(t)} onClick={() => toggle(t)}>{t / 12} years</button>)}
        </div>
        <Slider label="Extra payment each month" value={inputs.extraMonthly} min={0} max={500} step={10} onChange={(v) => setInputs({ ...inputs, extraMonthly: v })} help="Applied across loans to see how paying extra shortens repayment." />
        {r.excluded.length > 0 && <Alert kind="warn">Left out (missing balance or rate): {r.excluded.join(', ')}.</Alert>}
        <div className="table-wrap">
          <table className="table stack-mobile">
            <thead><tr><th>Assumption</th><th className="r">Monthly payment</th><th className="r">Total repaid</th><th className="r">Total interest</th><th className="r">Time to pay off</th></tr></thead>
            <tbody>
              {r.results.map((x) => (
                <tr key={x.label}>
                  <td data-label="Assumption"><strong>{x.label}</strong>{x.extraMonthly ? <div className="xs muted">+{money(x.extraMonthly)}/mo extra</div> : null}</td>
                  <td data-label="Monthly" className="r num">{money(x.monthlyPayment, { fallback: 'n/a' })}</td>
                  <td data-label="Total repaid" className="r num">{money(x.totalPaid, { fallback: 'n/a' })}</td>
                  <td data-label="Interest" className="r num">{money(x.totalInterest, { fallback: 'n/a' })}</td>
                  <td data-label="Payoff" className="r num">{x.monthsToPayoff ? `${Math.floor(x.monthsToPayoff / 12)} yr ${x.monthsToPayoff % 12} mo` : 'n/a'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CompareBars title="Total interest by term" items={ok.map((x) => ({ label: `${x.label} — total interest`, value: x.totalInterest }))} />
        <HowCalculated>
          <p>Each loan is amortized separately at its own recorded rate over the chosen term; payments and interest are then added. Recorded unpaid interest is included in the starting balance. Extra payments are split evenly across loans.</p>
          <p>These are fixed-payment illustrations. They don’t represent the Tiered Standard plan’s actual term for your balance, income-based plans like RAP, or your eligibility for any plan.</p>
        </HowCalculated>
      </section>
    </div>
  );
}

// ───────── Coach (financial-literacy-only tutor answering from the built-in library)
const STARTERS: Record<TabId, string[]> = {
  lifestyle: ['Explain this result', 'Is it better to save the extra or pay down loans?', 'What’s a realistic share of income for rent?'],
  delay: ['Explain this result', 'How big should my emergency fund be?', 'What can I do if I can’t pay during a job search?'],
  unexpected: ['Explain this result', 'Why does an emergency fund matter?', 'Should I use a credit card for emergencies?'],
  practice: ['Explain this result', 'How is my loan payment estimated?', 'What does it mean to practice a payment?'],
  compare: ['Explain this result', 'What is capitalization?', 'How do longer terms change total interest?'],
};

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  scope?: 'in' | 'out';
  source?: 'built_in';
  related?: string[];
}

function Coach({ scenario, tab }: { scenario: { type: string; summary: string } | null; tab: TabId }) {
  const [q, setQ] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [turns, pending]);
  const last = turns[turns.length - 1];
  const ask = async (question: string) => {
    const text = question.trim();
    if (text.length < 2 || pending) return;
    setError(null);
    setQ('');
    const history = turns.filter((t) => t.scope !== 'out').map(({ role, content }) => ({ role, content }));
    setTurns((t) => [...t, { role: 'user', content: text }]);
    setPending(true);
    try {
      const r = await api<{ answer: string; source: 'built_in'; scope: 'in' | 'out'; related?: string[] }>('POST', '/api/coach', { question: text, scenario, history });
      setTurns((t) => [...t, { role: 'assistant', content: r.answer, scope: r.scope, source: r.source, related: r.related }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The coach couldn’t answer right now.');
      setTurns((t) => t.slice(0, -1));
      setQ(text);
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="panel stack" aria-labelledby="coach-h">
      <div className="row-between">
        <div className="row"><LuMessageCircle aria-hidden="true" size={20} /><h2 id="coach-h" className="h3">Learning coach</h2><span className="badge badge-connected">Money topics only</span></div>
        {turns.length > 0 && <Button size="sm" variant="ghost" onClick={() => (setTurns([]), setError(null))}><LuRotateCcw aria-hidden="true" /> New conversation</Button>}
      </div>
      <p className="xs muted">
        {`Answers come from FirstStep’s library of ${TOPICS.length} written explanations on student loans, interest, budgeting, saving and credit, plus your own numbers. It explains; it doesn’t decide for you. Nothing you type leaves FirstStep.`}
      </p>
      <div ref={thread} className="coach-thread" aria-live="polite">
        {turns.length === 0 && <p className="small muted">Ask about anything on this screen, or a money concept you want explained.</p>}
        {turns.map((t, i) => (
          <div key={i} className={`bubble ${t.role === 'user' ? 'bubble-user' : 'bubble-coach'} ${t.scope === 'out' ? 'bubble-out' : ''}`}>
            <span className="sr-only">{t.role === 'user' ? 'You said:' : 'Coach:'}</span>
            <p style={{ whiteSpace: 'pre-line' }}>{t.content}</p>
          </div>
        ))}
        {pending && <div className="bubble bubble-coach"><span className="typing" aria-label="Coach is thinking"><i /><i /><i /></span></div>}
      </div>
      {!pending && last?.role === 'assistant' && !!last.related?.length && (
        <div className="stack stack-sm coach-related">
          <span className="xs muted">Related questions</span>
          <div className="chip-row">{last.related.map((c) => <button key={c} type="button" className="chip" onClick={() => ask(c)}>{c}</button>)}</div>
        </div>
      )}
      {error && <Alert kind="error" onDismiss={() => setError(null)}>{error}</Alert>}
      {turns.length === 0 && <div className="chip-row">{STARTERS[tab].map((c) => <button key={c} className="chip" onClick={() => ask(c)} disabled={pending}>{c}</button>)}</div>}
      <form className="coach-input" onSubmit={(e) => (e.preventDefault(), ask(q))}>
        <label htmlFor="coach-q" className="sr-only">Ask the learning coach a money question</label>
        <input id="coach-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a money question…" maxLength={600} autoComplete="off" />
        <Button type="submit" loading={pending} disabled={q.trim().length < 2}>Ask</Button>
      </form>
      <details className="coach-topics">
        <summary className="small">Browse all {TOPICS.length} topics</summary>
        <div className="stack">
          {TOPIC_CATEGORIES.map((cat) => (
            <div key={cat} className="stack stack-sm">
              <h3 className="xs muted">{cat}</h3>
              <div className="chip-row">
                {TOPICS.filter((t) => t.category === cat).map((t) => <button key={t.id} type="button" className="chip" onClick={() => ask(t.q)} disabled={pending}>{t.q}</button>)}
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
