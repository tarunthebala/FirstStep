import { useMemo, useState } from 'react';
import { LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';
import { accessibleSavings, cashFlow, expenseTotal, incomeTotal, isNum, loanTotals } from '../../shared/finance';
import { dateLabel, money, pct } from '../../shared/format';
import { EXPENSE_KEYS, EXPENSE_LABELS, type CategoryStatus, type ExpenseKey, type IncomeSource, type Loan, type Transaction } from '../../shared/types';
import { useAction, useApp, useKeyedDebounce } from '../lib/state';
import type { AppState } from '../lib/state';
import { LoanFormDialog } from './loans';
import { Alert, Button, CategoryStatusBadge, DateStatusBadge, Dialog, Field, IncomeStatusBadge, MoneyInput, SourceBadge } from './ui';

/** Compares imported values with current ones. Never changes either. */
export function discrepancies(d: AppState): string[] {
  const out: string[] = [];
  for (const l of d.loans) {
    const imp = d.imports.find((i) => i.id === l.importId);
    const raw = imp && l.importIndex !== null ? imp.raw[l.importIndex] : null;
    if (!raw) continue;
    const src = imp!.origin === 'plaid_liabilities' ? 'the connected servicer' : 'your StudentAid.gov file';
    if (isNum(raw.principal) && isNum(l.principal) && Math.abs(raw.principal - l.principal) >= 0.01) out.push(`${l.name}: principal is ${money(l.principal)} here but ${money(raw.principal)} in ${src}.`);
    if (isNum(raw.interestRate) && isNum(l.interestRate) && Math.abs(raw.interestRate - l.interestRate) >= 0.001) out.push(`${l.name}: rate is ${pct(l.interestRate)} here but ${pct(raw.interestRate)} in ${src}.`);
  }
  const paying = d.transactions.some((t) => t.category === 'debt_payments' && !t.excluded && /student loan|nelnet|mohela|aidvantage|edfinancial|navient|sallie/i.test(t.description));
  if (paying && d.loans.length && d.loans.every((l) => /school|grace/i.test(l.status ?? ''))) out.push('Your bank transactions show student loan payments, but your loan records say they’re in school or grace. Check which loans you’re paying.');
  return out;
}

export function SummaryEditor({ onConfirmed, confirmLabel = 'Confirm and Build My Plan' }: { onConfirmed: (planError: string | null) => void; confirmLabel?: string }) {
  const { data, mutate } = useApp();
  const [editing, setEditing] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [inExpenses, setInExpenses] = useState(data.settings.studentLoanPaymentInExpenses);
  const [txFilter, setTxFilter] = useState<null | ExpenseKey | 'uncategorized' | 'deposits'>(null);
  const [editLoan, setEditLoan] = useState<Loan | null>(null);
  const [addingLoan, setAddingLoan] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { run } = useAction();
  const debounce = useKeyedDebounce();

  const cur = data.expenses.filter((e) => e.scope === 'current');
  const post = data.expenses.filter((e) => e.scope === 'post_grad');
  const curIncome = incomeTotal(data.income, 'current');
  const expIncome = incomeTotal(data.income, 'expected');
  const curExp = expenseTotal(data.expenses, 'current');
  const cf = cashFlow({ income: curIncome, expenses: curExp, loanPayment: null, loanPaymentInExpenses: false });
  const saved = accessibleSavings(data.savings);
  const totals = loanTotals(data.loans);
  const disc = useMemo(() => discrepancies(data), [data]);
  const pendingImports = data.imports.filter((i) => i.status === 'parsed');
  const unreviewed = data.transactions.filter((t) => !t.reviewed && !t.excluded);
  const uncategorizedDeposits = data.transactions.filter((t) => t.amount < 0 && t.category === 'uncategorized' && !t.excluded);
  const notEmployed = data.profile.employmentStatus === 'student' || data.profile.employmentStatus === 'unemployed';

  const missing: string[] = [];
  if (!data.loans.length) missing.push('No student loans recorded. Your plan won’t include payment estimates.');
  if (!isNum(curIncome) && !isNum(expIncome)) missing.push('No income recorded. Cash flow can’t be calculated.');
  if (!cur.some((c) => isNum(c.monthlyAmount))) missing.push('No expenses recorded.');
  if (!data.savings.some((s) => isNum(s.balance))) missing.push('No savings balance recorded.');
  if (!data.connections.some((c) => c.status === 'connected')) missing.push('No account connected — that’s fine; everything here comes from what you entered or uploaded.');

  const confirm = async () => {
    if (!reviewed) return setErr('Please tick the box to confirm you’ve reviewed this summary.');
    if (pendingImports.length) return setErr('You have an import waiting for review. Confirm or discard it first.');
    setErr(null);
    setPhase('Saving your confirmed details…');
    const t1 = setTimeout(() => setPhase('Calculating your starting point…'), 450);
    const t2 = setTimeout(() => setPhase('Building your action plan…'), 900);
    const r = await run(() => mutate<{ planError: string | null }>('POST', '/api/summary/confirm', { studentLoanPaymentInExpenses: inExpenses, reviewed: true }));
    clearTimeout(t1);
    clearTimeout(t2);
    setPhase(null);
    if (r) onConfirmed(r.planError);
  };

  const setCat = (key: ExpenseKey, scope: 'current' | 'post_grad', patch: { monthlyAmount?: number | null; status?: CategoryStatus }) => {
    const save = () => run(() => mutate('PUT', '/api/expenses', { key, scope, ...patch }));
    if (patch.monthlyAmount !== undefined) debounce(`${key}:${scope}`, save);
    else save();
  };

  if (phase)
    return (
      <div className="panel stack" style={{ minHeight: 260, placeContent: 'center', textAlign: 'center' }} role="status" aria-live="polite">
        <span className="spinner" style={{ margin: '0 auto', width: 28, height: 28 }} aria-hidden="true" />
        <p className="h4">{phase}</p>
        <p className="small muted">Using only the information you just confirmed.</p>
      </div>
    );

  return (
    <div className="stack stack-lg">
      <div className="grid-4">
        <Totals label="Current monthly income" value={curIncome} note={notEmployed && !isNum(curIncome) ? 'None assumed' : undefined} />
        <Totals label="Expected income after graduation" value={expIncome} />
        <Totals label="Current monthly expenses" value={curExp} />
        <Totals label="Current cash flow" value={cf.value} note={cf.value === null ? `Needs ${cf.missing.join(' and ')}` : undefined} signed />
      </div>

      {pendingImports.length > 0 && <Alert kind="warn" title="Imported loans are waiting for review">Go back to the Loans step to confirm or discard them before building your plan.</Alert>}
      {disc.length > 0 && (
        <Alert kind="warn" title="Some sources don’t agree">
          <ul style={{ margin: 0, paddingLeft: 18 }}>{disc.map((x) => <li key={x}>{x}</li>)}</ul>
          <p className="xs mt-8">FirstStep hasn’t overwritten either value. Edit the loan if one is wrong.</p>
        </Alert>
      )}

      {/* Income */}
      <section className="panel stack" aria-labelledby="inc-h">
        <div className="panel-head">
          <h2 id="inc-h" className="h3">Income</h2>
          {editing && <AddIncome />}
        </div>
        {notEmployed && !isNum(curIncome) && <p className="small muted">You told us you’re not currently employed, so FirstStep doesn’t assume any current income. Add expected post-graduation income below if you have an idea of it.</p>}
        {data.income.length === 0 ? <p className="small muted">No income recorded yet. {editing ? '' : 'Choose “Edit My Details” to add it.'}</p> : (
          <div className="divider-list">
            {data.income.map((i) => <IncomeRow key={i.id} i={i} editing={editing} />)}
          </div>
        )}
        {uncategorizedDeposits.length > 0 && (
          <p className="small">
            {uncategorizedDeposits.length} deposit{uncategorizedDeposits.length === 1 ? '' : 's'} couldn’t be confidently categorized and {uncategorizedDeposits.length === 1 ? 'isn’t' : 'aren’t'} counted as income. <button className="btn-link" onClick={() => setTxFilter('deposits')}>Review deposits</button>
          </p>
        )}
        <p className="xs muted">Transfers between your own accounts are never counted as income.</p>
      </section>

      {/* Expenses */}
      <section className="panel stack" aria-labelledby="exp-h">
        <div className="panel-head">
          <h2 id="exp-h" className="h3">Monthly expenses</h2>
          {data.transactions.length > 0 && (
            <div className="row">
              {unreviewed.length > 0 && <span className="badge badge-review">{unreviewed.length} transaction{unreviewed.length === 1 ? '' : 's'} to check</span>}
              <Button size="sm" variant="secondary" onClick={() => setTxFilter('uncategorized')}>Review transactions</Button>
            </div>
          )}
        </div>
        <p className="xs muted">Amounts are estimated monthly figures. Where transactions exist, “Seen” shows actual totals for the period they cover — one month isn’t always typical.</p>
        <div className="table-wrap">
          <table className="table stack-mobile">
            <thead><tr><th>Category</th><th className="r">Per month</th><th>Source</th><th>Status</th><th>Seen in transactions</th></tr></thead>
            <tbody>
              {EXPENSE_KEYS.map((key) => {
                const c = cur.find((x) => x.key === key);
                if (!c) return null;
                const count = data.transactions.filter((t) => t.category === key && !t.excluded).length;
                return (
                  <tr key={key}>
                    <td data-label="Category"><strong>{EXPENSE_LABELS[key]}</strong></td>
                    <td data-label="Per month" className="r num">
                      {editing ? <div style={{ maxWidth: 150, marginLeft: 'auto' }}><MoneyInput aria-label={`${EXPENSE_LABELS[key]} per month`} value={c.monthlyAmount} onChange={(v) => setCat(key, 'current', { monthlyAmount: v })} /></div> : money(c.monthlyAmount, { fallback: 'Not set' })}
                    </td>
                    <td data-label="Source">{isNum(c.monthlyAmount) ? <SourceBadge source={c.source} /> : <span className="muted small">—</span>}</td>
                    <td data-label="Status">
                      <select className="select" style={{ minHeight: 34, padding: '4px 8px', fontSize: 14, width: 'auto' }} aria-label={`${EXPENSE_LABELS[key]} status`} value={c.status} onChange={(e) => setCat(key, 'current', { status: e.target.value as CategoryStatus })}>
                        <option value="confirmed">Confirmed</option><option value="estimated">Estimated</option><option value="needs_review">Needs review</option>
                      </select>
                    </td>
                    <td data-label="Seen" className="small">
                      {c.observedTotal !== null ? <>{money(c.observedTotal)} over {c.observedMonths} mo{count ? <> · <button className="btn-link" onClick={() => setTxFilter(key)}>{count} transaction{count === 1 ? '' : 's'}</button></> : null}</> : <span className="muted">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <label className="check">
          <input type="checkbox" checked={inExpenses} onChange={(e) => setInExpenses(e.target.checked)} />
          <span>My “Debt and loan payments” amount already includes student loan payments. <span className="muted small">(Prevents counting them twice.)</span></span>
        </label>
        <details className="how">
          <summary>Expected expenses after graduation (optional)</summary>
          <div>
            <p>Set amounts that will change after you graduate, like rent or insurance. Anything left blank uses your current amount.</p>
            <div className="grid-3">
              {EXPENSE_KEYS.filter((k) => k !== 'debt_payments').map((key) => {
                const c = post.find((x) => x.key === key);
                return (
                  <Field key={key} label={EXPENSE_LABELS[key]}>{(p) => <MoneyInput {...p} value={c?.monthlyAmount ?? null} placeholder={money(cur.find((x) => x.key === key)?.monthlyAmount ?? null, { whole: true, fallback: '' })} onChange={(v) => setCat(key, 'post_grad', { monthlyAmount: v })} />}</Field>
                );
              })}
            </div>
          </div>
        </details>
      </section>

      {/* Savings */}
      <section className="panel stack" aria-labelledby="sav-h">
        <div className="panel-head">
          <h2 id="sav-h" className="h3">Savings and balances</h2>
          {editing && <AddSavings />}
        </div>
        <p className="xs muted">Balances are shown apart from spending. Not every balance is emergency money — mark only what you could actually use.</p>
        {data.savings.length === 0 ? <p className="small muted">No balances recorded.</p> : (
          <div className="divider-list">{data.savings.map((s) => <SavingsRow key={s.id} id={s.id} editing={editing} />)}</div>
        )}
        <p className="small"><strong>Accessible for emergencies:</strong> {money(saved, { fallback: 'None recorded' })}</p>
      </section>

      {/* Loans */}
      <section className="panel stack" aria-labelledby="loan-h">
        <div className="panel-head">
          <h2 id="loan-h" className="h3">Student loans</h2>
          <Button size="sm" variant="secondary" onClick={() => setAddingLoan(true)}><LuPlus aria-hidden="true" /> Add loan</Button>
        </div>
        {data.loans.length === 0 ? <p className="small muted">No loans recorded.</p> : (
          <div className="divider-list">
            {data.loans.map((l) => (
              <div key={l.id} className="row-between" style={{ padding: '12px 0', alignItems: 'flex-start' }}>
                <div className="stack stack-sm" style={{ flex: 1, minWidth: 220 }}>
                  <div className="row"><strong>{l.name}</strong><SourceBadge source={l.source} /></div>
                  <p className="small muted">
                    {[l.principal !== null && `Principal ${money(l.principal)}`, l.interestBalance !== null && `unpaid interest ${money(l.interestBalance)}`, l.interestRate !== null && `${pct(l.interestRate)}`, l.loanType, l.status, l.repaymentPlan].filter(Boolean).join(' · ') || 'No details yet'}
                  </p>
                  {(l.gracePeriodEnd || l.firstPaymentDate) && (
                    <p className="small row">
                      {l.gracePeriodEnd && <>Grace ends {dateLabel(l.gracePeriodEnd)} <DateStatusBadge status={l.gracePeriodEndStatus} /></>}
                      {l.firstPaymentDate && <>First payment {dateLabel(l.firstPaymentDate)} <DateStatusBadge status={l.firstPaymentDateStatus} /></>}
                    </p>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditLoan(l)} aria-label={`Edit ${l.name}`}><LuPencil aria-hidden="true" /> Edit</Button>
              </div>
            ))}
          </div>
        )}
        <p className="small"><strong>Total recorded:</strong> {money(totals.total, { fallback: '—' })} {totals.interest ? <span className="muted">(principal {money(totals.principal)} + unpaid interest {money(totals.interest)})</span> : null}</p>
      </section>

      {missing.length > 0 && (
        <Alert kind="info" title="What’s missing">
          <ul style={{ margin: 0, paddingLeft: 18 }}>{missing.map((m) => <li key={m}>{m}</li>)}</ul>
        </Alert>
      )}

      <div className="panel stack">
        <label className="check">
          <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
          <span>I’ve reviewed this summary and corrected anything I know is wrong. I understand FirstStep hasn’t independently verified imported or suggested values.</span>
        </label>
        {err && <p className="error-text" role="alert">{err}</p>}
        <div className="row">
          <Button size="lg" onClick={confirm} arrow>{confirmLabel}</Button>
          <Button size="lg" variant="secondary" onClick={() => setEditing((e) => !e)} aria-pressed={editing}>{editing ? 'Done editing' : 'Edit My Details'}</Button>
        </div>
      </div>

      <TransactionsDialog filter={txFilter} onClose={() => setTxFilter(null)} />
      {(editLoan || addingLoan) && <LoanFormDialog key={editLoan?.id ?? 'new'} open loan={editLoan} onClose={() => (setEditLoan(null), setAddingLoan(false))} />}
    </div>
  );
}

function Totals({ label, value, note, signed }: { label: string; value: number | null; note?: string; signed?: boolean }) {
  return (
    <div className="stat">
      <span className="label">{label}</span>
      <span className={`big-num ${signed && value !== null && value < 0 ? 'neg' : ''}`} style={{ fontSize: 26 }}>{money(value, { fallback: 'Not set' })}</span>
      {note && <span className="xs muted">{note}</span>}
    </div>
  );
}

function IncomeRow({ i, editing }: { i: IncomeSource; editing: boolean }) {
  const { mutate } = useApp();
  const { run } = useAction();
  const debounce = useKeyedDebounce();
  return (
    <div className="row-between" style={{ padding: '12px 0' }}>
      <div className="stack stack-sm" style={{ minWidth: 200 }}>
        <strong>{i.label}</strong>
        <div className="row"><span className="xs muted">{i.kind === 'current' ? 'Current' : 'Expected after graduation'}</span><IncomeStatusBadge status={i.status} /><SourceBadge source={i.source} /></div>
      </div>
      {editing ? (
        <div className="row">
          <div style={{ width: 150 }}><MoneyInput aria-label={`${i.label} per month`} value={i.monthlyAmount} onChange={(v) => debounce(i.id, () => run(() => mutate('PATCH', `/api/income/${i.id}`, { monthlyAmount: v })))} /></div>
          <select className="select" style={{ width: 'auto' }} aria-label={`${i.label} status`} value={i.status} onChange={(e) => run(() => mutate('PATCH', `/api/income/${i.id}`, { status: e.target.value }))}>
            <option value="confirmed">Confirmed</option><option value="estimated">Estimated</option><option value="variable">Varies</option><option value="not_available">Not yet available</option>
          </select>
          <Button size="sm" variant="ghost" aria-label={`Delete ${i.label}`} onClick={() => run(() => mutate('DELETE', `/api/income/${i.id}`))}><LuTrash2 aria-hidden="true" /></Button>
        </div>
      ) : (
        <span className="num" style={{ fontWeight: 600 }}>{money(i.monthlyAmount, { fallback: 'Not set' })}/mo</span>
      )}
    </div>
  );
}

export function AddIncome({ defaultKind = 'expected' }: { defaultKind?: 'current' | 'expected' }) {
  const { mutate } = useApp();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<'current' | 'expected'>(defaultKind);
  const [amount, setAmount] = useState<number | null>(null);
  const [status, setStatus] = useState<IncomeSource['status']>('estimated');
  const { run, pending } = useAction();
  const save = () => run(async () => (await mutate('POST', '/api/income', { label: label.trim() || (kind === 'current' ? 'Current income' : 'Expected take-home pay'), kind, monthlyAmount: amount, status }), setOpen(false), setLabel(''), setAmount(null)), 'Income added.');
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><LuPlus aria-hidden="true" /> Add income</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add income" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} loading={pending}>Add</Button></>}>
        <div className="stack">
          <Field label="Description">{(p) => <input {...p} className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Campus job, Expected salary" maxLength={80} />}</Field>
          <fieldset>
            <legend>When</legend>
            <div className="radio-cards">
              <label className="radio-card"><input type="radio" name="kind" checked={kind === 'current'} onChange={() => setKind('current')} /><span>Current income</span></label>
              <label className="radio-card"><input type="radio" name="kind" checked={kind === 'expected'} onChange={() => setKind('expected')} /><span>Expected after graduation</span></label>
            </div>
          </fieldset>
          <Field label="Monthly take-home amount" help="After taxes and deductions. Leave blank if you don’t know yet.">{(p) => <MoneyInput {...p} value={amount} onChange={setAmount} />}</Field>
          <Field label="How sure are you?">
            {(p) => (
              <select {...p} className="select" value={status} onChange={(e) => setStatus(e.target.value as IncomeSource['status'])}>
                <option value="confirmed">Confirmed (pay stub or offer letter)</option><option value="estimated">Estimated</option><option value="variable">It varies month to month</option><option value="not_available">Not available yet</option>
              </select>
            )}
          </Field>
        </div>
      </Dialog>
    </>
  );
}

export function SavingsRow({ id, editing }: { id: string; editing: boolean }) {
  const { data, mutate } = useApp();
  const { run } = useAction();
  const debounce = useKeyedDebounce();
  const s = data.savings.find((x) => x.id === id)!;
  return (
    <div className="row-between" style={{ padding: '12px 0', opacity: s.excluded ? 0.6 : 1 }}>
      <div className="stack stack-sm" style={{ minWidth: 200 }}>
        <div className="row"><strong>{s.label}</strong><SourceBadge source={s.source} />{s.excluded && <span className="badge badge-unknown">Excluded</span>}</div>
        <div className="row small">
          <label className="check"><input type="checkbox" checked={s.accessibleForEmergencies} onChange={(e) => run(() => mutate('PATCH', `/api/savings/${s.id}`, { accessibleForEmergencies: e.target.checked }))} /> Available for emergencies</label>
          <label className="check"><input type="checkbox" checked={s.excluded} onChange={(e) => run(() => mutate('PATCH', `/api/savings/${s.id}`, { excluded: e.target.checked }))} /> Leave out of FirstStep</label>
        </div>
      </div>
      {editing && s.source !== 'connected' ? (
        <div className="row">
          <div style={{ width: 150 }}><MoneyInput aria-label={`${s.label} balance`} value={s.balance} onChange={(v) => debounce(s.id, () => run(() => mutate('PATCH', `/api/savings/${s.id}`, { balance: v })))} /></div>
          <Button size="sm" variant="ghost" aria-label={`Delete ${s.label}`} onClick={() => run(() => mutate('DELETE', `/api/savings/${s.id}`))}><LuTrash2 aria-hidden="true" /></Button>
        </div>
      ) : (
        <span className="num" style={{ fontWeight: 600 }}>{money(s.balance, { fallback: 'Unknown' })}</span>
      )}
    </div>
  );
}

export function AddSavings() {
  const { mutate } = useApp();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [accessible, setAccessible] = useState(true);
  const { run, pending } = useAction();
  const save = () => run(async () => (await mutate('POST', '/api/savings', { label: label.trim() || 'Savings', balance, accessibleForEmergencies: accessible }), setOpen(false), setLabel(''), setBalance(null)), 'Balance added.');
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><LuPlus aria-hidden="true" /> Add balance</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add a savings balance" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} loading={pending}>Add</Button></>}>
        <div className="stack">
          <Field label="Name">{(p) => <input {...p} className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Savings account" maxLength={80} />}</Field>
          <Field label="Balance">{(p) => <MoneyInput {...p} value={balance} onChange={setBalance} />}</Field>
          <label className="check"><input type="checkbox" checked={accessible} onChange={(e) => setAccessible(e.target.checked)} /> I could use this money in an emergency</label>
        </div>
      </Dialog>
    </>
  );
}

const CAT_OPTIONS: { v: Transaction['category']; l: string }[] = [
  ...EXPENSE_KEYS.map((k) => ({ v: k as Transaction['category'], l: EXPENSE_LABELS[k] })),
  { v: 'income', l: 'Income' },
  { v: 'transfer', l: 'Transfer between my accounts' },
  { v: 'uncategorized', l: 'Uncategorized' },
];

export function TransactionsDialog({ filter, onClose }: { filter: null | ExpenseKey | 'uncategorized' | 'deposits' | 'all'; onClose: () => void }) {
  const { data, mutate } = useApp();
  const { run, pending } = useAction();
  const [view, setView] = useState<'filter' | 'all'>('filter');
  if (!filter) return null;
  const list = data.transactions.filter((t) =>
    view === 'all' || filter === 'all' ? true : filter === 'deposits' ? t.amount < 0 : filter === 'uncategorized' ? t.category === 'uncategorized' || !t.reviewed : t.category === filter,
  );
  const title = filter === 'deposits' ? 'Deposits' : filter === 'uncategorized' ? 'Transactions to check' : filter === 'all' ? 'All transactions' : `${EXPENSE_LABELS[filter as ExpenseKey]} transactions`;
  return (
    <Dialog open onClose={onClose} title={title} wide footer={<><Button variant="ghost" onClick={() => setView(view === 'all' ? 'filter' : 'all')}>{view === 'all' ? 'Show filtered' : 'Show all transactions'}</Button><Button variant="secondary" loading={pending} onClick={() => run(() => mutate('POST', '/api/transactions/mark-reviewed', { ids: list.map((t) => t.id) }), 'Marked as reviewed.')} disabled={!list.length}>Mark these reviewed</Button><Button onClick={onClose}>Done</Button></>}>
      <div className="stack">
        <p className="small muted">Suggested categories aren’t always right. Fix the category, exclude reimbursements or anything that isn’t really your spending, and mark one-time costs so they don’t inflate your monthly estimate.</p>
        {list.length === 0 ? <p className="small">Nothing to show.</p> : (
          <div className="table-wrap">
            <table className="table stack-mobile">
              <thead><tr><th>Date</th><th>Description</th><th className="r">Amount</th><th>Category</th><th>Exclude</th><th>One-time</th></tr></thead>
              <tbody>
                {list.slice(0, 300).map((t) => (
                  <tr key={t.id} style={{ opacity: t.excluded ? 0.6 : 1 }}>
                    <td data-label="Date" className="small">{dateLabel(t.date)}</td>
                    <td data-label="Description">{t.description} {!t.reviewed && <span className="badge badge-review">Check</span>} <SourceBadge source={t.source} /></td>
                    <td data-label="Amount" className={`r num ${t.amount < 0 ? 'pos' : ''}`}>{t.amount < 0 ? `+${money(-t.amount)}` : money(t.amount)}</td>
                    <td data-label="Category">
                      <select className="select" style={{ minHeight: 34, padding: '4px 8px', fontSize: 14 }} aria-label={`Category for ${t.description}`} value={t.category} onChange={(e) => run(() => mutate('PATCH', `/api/transactions/${t.id}`, { category: e.target.value }))}>
                        {CAT_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                      </select>
                    </td>
                    <td data-label="Exclude"><input type="checkbox" aria-label={`Exclude ${t.description}`} checked={t.excluded} onChange={(e) => run(() => mutate('PATCH', `/api/transactions/${t.id}`, { excluded: e.target.checked }))} /></td>
                    <td data-label="One-time"><input type="checkbox" aria-label={`${t.description} is one-time`} checked={t.oneTime} onChange={(e) => run(() => mutate('PATCH', `/api/transactions/${t.id}`, { oneTime: e.target.checked }))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  );
}
