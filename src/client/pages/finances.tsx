import { Fragment, useMemo, useState } from 'react';
import { LuPlus, LuTrash2, LuUpload } from 'react-icons/lu';
import { cashFlow, fromCents, isNum, toCents } from '../../shared/finance';
import { dateLabel, money } from '../../shared/format';
import { EXPENSE_KEYS, EXPENSE_LABELS, FIXED_KEYS, type ExpenseKey, type Loan } from '../../shared/types';
import { liveMetrics } from '../lib/metrics';
import { useAction, useApp, useKeyedDebounce } from '../lib/state';
import { PageHead } from '../components/layouts';
import { ConnectPanel } from '../components/connect';
import { ImportReview, LoanDetailDialog, LoanFormDialog, LoanTable, UploadInstructions, UploadPanel } from '../components/loans';
import { AddIncome, AddSavings, SavingsRow, TransactionsDialog } from '../components/summary';
import { Alert, Button, CategoryStatusBadge, Dialog, Field, HowCalculated, IncomeStatusBadge, MoneyInput, SourceBadge, Tabs } from '../components/ui';

export function Finances() {
  const { data } = useApp();
  const m = useMemo(() => liveMetrics(data), [data]);
  const [detail, setDetail] = useState<Loan | null>(null);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const pendingImport = data.imports.find((i) => i.status === 'parsed');

  return (
    <>
      <PageHead eyebrow="Your saved data" title="My Finances" intro="Everything here is your baseline. Changes save right away and update your dashboard. Money Lab experiments never change it." />
      <div className="stack stack-lg">
        <section id="loans" className="stack" aria-labelledby="loans-h">
          <div className="row-between">
            <h2 id="loans-h">Loan portfolio</h2>
            <div className="row">
              <Button variant="secondary" onClick={() => setUploading(true)}><LuUpload aria-hidden="true" /> Upload StudentAid.gov file</Button>
              <Button onClick={() => setAdding(true)}><LuPlus aria-hidden="true" /> Add loan</Button>
            </div>
          </div>
          {pendingImport && <div className="panel"><ImportReview key={pendingImport.id} imp={pendingImport} onDone={() => setUploading(false)} /></div>}
          <LoanTable loans={data.loans} defaultTerm={data.settings.defaultTermMonths} onSelect={setDetail} />
          {data.loans.length > 0 && (
            <p className="small muted">
              Total recorded {money(m.totalBalance)} · Estimated payment {m.estimatedMonthlyPayment === null ? 'not calculable' : `${money(m.estimatedMonthlyPayment)}/mo`}{m.portfolio.partial ? ' (partial)' : ''}. Select a loan for details and assumptions.
            </p>
          )}
        </section>

        <BudgetManager />
        <CashFlowOverview />
        <SavingsSection />

        <section id="accounts" className="stack" aria-labelledby="acc-h">
          <div className="row-between">
            <h2 id="acc-h">Connected accounts</h2>
            {data.transactions.length > 0 && <Button variant="secondary" onClick={() => setTxOpen(true)}>Review transactions ({data.transactions.length})</Button>}
          </div>
          <ConnectPanel />
        </section>
      </div>

      <LoanDetailDialog loan={detail} onClose={() => setDetail(null)} onEdit={(l) => (setDetail(null), setEditing(l))} />
      {(editing || adding) && <LoanFormDialog key={editing?.id ?? 'new'} open loan={editing} onClose={() => (setEditing(null), setAdding(false))} />}
      <Dialog open={uploading && !pendingImport} onClose={() => setUploading(false)} title="Upload a StudentAid.gov file" wide>
        <div className="stack">
          <UploadInstructions />
          <UploadPanel onParsed={() => setUploading(false)} />
          <p className="xs muted">New imports never overwrite your saved loans. You’ll review the file and choose, loan by loan, whether it updates an existing loan or is added as new.</p>
        </div>
      </Dialog>
      {txOpen && <TransactionsDialog filter="all" onClose={() => setTxOpen(false)} />}
    </>
  );
}

function BudgetManager() {
  const { data, mutate } = useApp();
  const [scope, setScope] = useState<'current' | 'post_grad'>('current');
  const { run } = useAction();
  const debounce = useKeyedDebounce();
  const m = liveMetrics(data);
  const cats = data.expenses.filter((e) => e.scope === scope);
  const currentCats = data.expenses.filter((e) => e.scope === 'current');
  const amount = (k: ExpenseKey) => {
    const c = cats.find((x) => x.key === k);
    if (c && isNum(c.monthlyAmount)) return c.monthlyAmount;
    if (scope === 'post_grad') return currentCats.find((x) => x.key === k)?.monthlyAmount ?? null;
    return null;
  };
  const income = scope === 'current' ? m.currentIncome : m.expectedIncome ?? m.currentIncome;
  const fixed = FIXED_KEYS;
  const debt: ExpenseKey[] = ['debt_payments'];
  const variable = EXPENSE_KEYS.filter((k) => !fixed.includes(k) && !debt.includes(k));
  const sum = (keys: ExpenseKey[]) => fromCents(keys.reduce((a, k) => a + toCents(amount(k) ?? 0), 0));
  const totalExp = sum([...EXPENSE_KEYS]);
  const loanPay = scope === 'post_grad' ? m.estimatedMonthlyPayment : null;
  const save = data.settings.monthlySavingsContribution;
  const remaining = cashFlow({ income, expenses: EXPENSE_KEYS.some((k) => isNum(amount(k))) ? totalExp : null, loanPayment: loanPay, loanPaymentInExpenses: data.settings.studentLoanPaymentInExpenses, savingsContribution: save });
  const setAmt = (k: ExpenseKey, v: number | null) => debounce(`${k}:${scope}`, () => run(() => mutate('PUT', '/api/expenses', { key: k, scope, monthlyAmount: v })));
  const share = (v: number | null) => (isNum(v) && isNum(income) && income > 0 ? Math.round((v / income) * 100) : null);
  const notes: string[] = [];
  const housing = share(amount('housing'));
  if (housing !== null && housing >= 40) notes.push(`Housing takes ${housing}% of ${scope === 'current' ? 'your income' : 'your expected income'}, which leaves less room for everything else.`);
  if (isNum(remaining.value) && remaining.value < 0) notes.push(`This budget is short by ${money(-remaining.value)} a month. Money Lab can help you test changes without editing this budget.`);
  if (scope === 'current' && !isNum(m.currentIncome)) notes.push('No current income is recorded, so percentages and remaining cash flow can’t be shown.');

  const renderRow = (k: ExpenseKey) => {
    const c = cats.find((x) => x.key === k);
    const fallback = scope === 'post_grad' && (!c || !isNum(c.monthlyAmount));
    const pctV = share(amount(k));
    return (
      <tr key={k}>
        <td data-label="Category"><strong>{EXPENSE_LABELS[k]}</strong>{fallback && isNum(amount(k)) && <div className="xs muted">Using current amount</div>}</td>
        <td data-label="Per month" className="r">
          <div style={{ maxWidth: 150, marginLeft: 'auto' }}>
            <MoneyInput aria-label={`${EXPENSE_LABELS[k]} per month (${scope === 'current' ? 'current' : 'after graduation'})`} value={c?.monthlyAmount ?? null} placeholder={fallback ? money(amount(k), { whole: true, fallback: '' }) : ''} onChange={(v) => setAmt(k, v)} />
          </div>
        </td>
        <td data-label="Of income" className="r num small">{pctV === null ? '—' : `${pctV}%`}</td>
        <td data-label="Status">{c ? <CategoryStatusBadge status={c.status} /> : <span className="badge badge-unknown">Not set</span>}</td>
        <td data-label="Source">{c && isNum(c.monthlyAmount) ? <SourceBadge source={c.source} /> : <span className="muted small">—</span>}</td>
      </tr>
    );
  };
  const renderGroup = (title: string, keys: ExpenseKey[]) => (
    <Fragment key={title}>
      <tr><th colSpan={5} style={{ background: 'var(--color-muted-surface-2)' }}>{title} · {money(sum(keys))}</th></tr>
      {keys.map(renderRow)}
    </Fragment>
  );

  return (
    <section id="budget" className="stack" aria-labelledby="budget-h">
      <div className="row-between">
        <h2 id="budget-h">Budget</h2>
        <Tabs label="Budget period" value={scope} onChange={setScope} tabs={[{ id: 'current', label: 'Current budget' }, { id: 'post_grad', label: 'After graduation (forecast)' }]} />
      </div>
      <div id={`panel-${scope}`} role="tabpanel" aria-labelledby={`tab-${scope}`} className="stack">
        {scope === 'post_grad' && <Alert>This is a forecast you define. Leave a category blank to reuse your current amount. The estimated loan payment is added automatically unless your debt payments already include it.</Alert>}
        <div className="panel stack">
          <div className="panel-head">
            <h3 className="h4">{scope === 'current' ? 'Income now' : 'Expected income after graduation'}</h3>
            <AddIncome defaultKind={scope === 'current' ? 'current' : 'expected'} />
          </div>
          {data.income.filter((i) => i.kind === (scope === 'current' ? 'current' : 'expected')).length === 0 ? (
            <p className="small muted">{scope === 'current' ? 'No current income recorded. That’s fine if you aren’t working.' : 'No expected income yet. Add your expected take-home pay to see how repayment fits.'}</p>
          ) : (
            <div className="divider-list">
              {data.income.filter((i) => i.kind === (scope === 'current' ? 'current' : 'expected')).map((i) => (
                <div key={i.id} className="row-between" style={{ padding: '10px 0' }}>
                  <span className="row"><strong>{i.label}</strong><IncomeStatusBadge status={i.status} /><SourceBadge source={i.source} /></span>
                  <span className="row">
                    <span style={{ width: 150 }}><MoneyInput aria-label={`${i.label} per month`} value={i.monthlyAmount} onChange={(v) => debounce(i.id, () => run(() => mutate('PATCH', `/api/income/${i.id}`, { monthlyAmount: v })))} /></span>
                    <Button size="sm" variant="ghost" aria-label={`Delete ${i.label}`} onClick={() => run(() => mutate('DELETE', `/api/income/${i.id}`))}><LuTrash2 aria-hidden="true" /></Button>
                  </span>
                </div>
              ))}
            </div>
          )}
          {scope === 'post_grad' && !isNum(m.expectedIncome) && isNum(m.currentIncome) && <p className="xs muted">Until you add expected income, forecasts use your current income.</p>}
        </div>
        <div className="table-wrap">
          <table className="table stack-mobile">
            <thead><tr><th>Category</th><th className="r">Per month</th><th className="r">Of income</th><th>Status</th><th>Source</th></tr></thead>
            <tbody>
              {renderGroup('Fixed expenses', fixed)}
              {renderGroup('Variable expenses', variable)}
              {renderGroup('Debt payments', debt)}
            </tbody>
          </table>
        </div>
        <div className="grid-2">
          <div className="panel stack stack-sm">
            <h3 className="h4">Debt payments and double counting</h3>
            <label className="check small">
              <input type="checkbox" checked={data.settings.studentLoanPaymentInExpenses} onChange={(e) => run(() => mutate('PUT', '/api/settings/budget', { studentLoanPaymentInExpenses: e.target.checked }))} />
              <span>My “Debt and loan payments” amount already includes student loan payments.</span>
            </label>
            <p className="xs muted">Credit cards: count either the purchases (in their categories) or the card payment — not both. Usually it’s clearest to record purchases and leave the card payment out.</p>
          </div>
          <div className="panel stack stack-sm">
            <Field label="Planned monthly savings" help="Money you set aside on purpose. Subtracted before remaining cash flow.">{(p) => <MoneyInput {...p} value={save} onChange={(v) => debounce('save', () => run(() => mutate('PUT', '/api/settings/budget', { monthlySavingsContribution: v })))} />}</Field>
          </div>
        </div>
        <div className="panel stack">
          <dl className="kv" style={{ fontSize: 16 }}>
            <dt>Income</dt><dd>{money(income, { fallback: '—' })}</dd>
            <dt>Expenses</dt><dd>− {money(totalExp)}</dd>
            {scope === 'post_grad' && !data.settings.studentLoanPaymentInExpenses && <><dt>Estimated loan payment</dt><dd>− {money(loanPay, { fallback: 'not calculable' })}</dd></>}
            {isNum(save) && save > 0 && <><dt>Planned savings</dt><dd>− {money(save)}</dd></>}
            <dt><strong>Remaining each month</strong></dt><dd className={isNum(remaining.value) && remaining.value < 0 ? 'neg' : ''}><strong>{money(remaining.value, { fallback: '—' })}</strong></dd>
          </dl>
          <HowCalculated><p>{remaining.explanation}</p></HowCalculated>
          {notes.length > 0 && <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        </div>
      </div>
    </section>
  );
}

function CashFlowOverview() {
  const { data } = useApp();
  const m = liveMetrics(data);
  const save = data.settings.monthlySavingsContribution ?? 0;
  const loanNow = 0;
  const loanLater = data.settings.studentLoanPaymentInExpenses ? 0 : m.estimatedMonthlyPayment ?? 0;
  const incLater = m.expectedIncome ?? m.currentIncome;
  const rem = (inc: number | null, exp: number | null, loan: number) => (isNum(inc) && isNum(exp) ? fromCents(toCents(inc) - toCents(exp) - toCents(loan) - toCents(save)) : null);
  const rows: [string, number | null, number | null][] = [
    ['Income', m.currentIncome, incLater],
    ['Expenses', m.currentExpenses, m.postGradExpenses],
    ['Student loan payment', loanNow, data.settings.studentLoanPaymentInExpenses ? null : m.estimatedMonthlyPayment],
    ['Planned savings', save || null, save || null],
    ['Remaining', rem(m.currentIncome, m.currentExpenses, loanNow), rem(incLater, m.postGradExpenses, loanLater)],
  ];
  return (
    <section id="cashflow" className="stack" aria-labelledby="cf-h">
      <h2 id="cf-h">Cash-flow overview</h2>
      <div className="table-wrap">
        <table className="table stack-mobile">
          <thead><tr><th>Monthly</th><th className="r">Current budget</th><th className="r">After graduation (forecast)</th></tr></thead>
          <tbody>
            {rows.map(([l, a, b]) => (
              <tr key={l}>
                <td data-label="Monthly"><strong>{l}</strong></td>
                <td data-label="Current" className={`r num ${isNum(a) && a < 0 ? 'neg' : ''}`}>{money(a, { fallback: '—' })}</td>
                <td data-label="After graduation" className={`r num ${isNum(b) && b < 0 ? 'neg' : ''}`}>{l === 'Student loan payment' && data.settings.studentLoanPaymentInExpenses ? 'Included in expenses' : money(b, { fallback: '—' })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="xs muted">Forecast column: {isNum(m.expectedIncome) ? 'your expected income' : 'your current income (no expected income entered)'}, post-graduation expenses you set (or current amounts), and FirstStep’s estimated loan payment. These are assumptions, not predictions.</p>
    </section>
  );
}

function SavingsSection() {
  const { data, mutate } = useApp();
  const { run, pending } = useAction();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('Emergency fund');
  const [target, setTarget] = useState<number | null>(null);
  const [date, setDate] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const m = liveMetrics(data);
  const add = () => {
    if (!target || target <= 0) return setErr('Enter a target above $0.');
    setErr(null);
    run(async () => (await mutate('POST', '/api/goals', { label: label.trim() || 'Savings goal', targetAmount: target, targetDate: date || null }), setOpen(false)), 'Goal saved.');
  };
  const monthly = m.postGradExpenses ?? m.currentExpenses;
  return (
    <section id="savings" className="stack" aria-labelledby="sv-h">
      <div className="row-between">
        <h2 id="sv-h">Savings and goals</h2>
        <div className="row"><AddSavings /><Button size="sm" onClick={() => setOpen(true)}><LuPlus aria-hidden="true" /> Set a goal</Button></div>
      </div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="panel stack">
          <h3 className="h4">Balances</h3>
          {data.savings.length === 0 ? <p className="small muted">No balances recorded.</p> : <div className="divider-list">{data.savings.map((s) => <SavingsRow key={s.id} id={s.id} editing />)}</div>}
          <p className="small"><strong>Available for emergencies:</strong> {money(m.accessibleSavings, { fallback: '—' })}</p>
        </div>
        <div className="panel stack">
          <h3 className="h4">Goals</h3>
          {data.goals.length === 0 ? <p className="small muted">No goals yet.{isNum(monthly) ? ` Three months of your expenses would be about ${money(monthly * 3, { whole: true })} — one common starting point.` : ''}</p> : (
            <div className="divider-list">
              {data.goals.map((g) => {
                const pctDone = Math.min(100, Math.round(((m.accessibleSavings ?? 0) / g.targetAmount) * 100));
                return (
                  <div key={g.id} className="stack stack-sm" style={{ padding: '10px 0' }}>
                    <div className="row-between"><strong>{g.label}</strong><Button size="sm" variant="ghost" aria-label={`Delete goal ${g.label}`} onClick={() => run(() => mutate('DELETE', `/api/goals/${g.id}`))}><LuTrash2 aria-hidden="true" /></Button></div>
                    <div className="bar" aria-hidden="true"><span style={{ width: `${pctDone}%` }} /></div>
                    <span className="small muted">{pctDone}% of {money(g.targetAmount, { whole: true })}{g.targetDate ? ` by ${dateLabel(g.targetDate)}` : ''}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Set a savings goal" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={add} loading={pending}>Save goal</Button></>}>
        <div className="stack">
          {err && <Alert kind="error">{err}</Alert>}
          <Field label="Name">{(p) => <input {...p} className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />}</Field>
          <Field label="Target amount" help={isNum(monthly) ? `Your monthly expenses are about ${money(monthly, { whole: true })}.` : undefined}>{(p) => <MoneyInput {...p} value={target} onChange={setTarget} />}</Field>
          <Field label="Target date" optional>{(p) => <input {...p} type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        </div>
      </Dialog>
    </section>
  );
}
