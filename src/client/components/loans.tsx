import { useMemo, useRef, useState, type DragEvent } from 'react';
import { LuFileText, LuPlus, LuTrash2, LuUpload } from 'react-icons/lu';
import { estimateLoan } from '../../shared/finance';
import { dateLabel, money, pct } from '../../shared/format';
import type { DateStatus, Loan, LoanImport, ParsedLoan } from '../../shared/types';
import { uploadText } from '../lib/api';
import { useAction, useApp, useToast } from '../lib/state';
import { Alert, Button, DateStatusBadge, Dialog, Empty, Field, HowCalculated, MoneyInput, NumberInput, ProgressBar, SourceBadge } from './ui';

// ───────────────────────────── Upload

export function UploadInstructions() {
  return (
    <details className="how" open>
      <summary>How to get your file from StudentAid.gov</summary>
      <div>
        <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
          <li>Sign in at <a href="https://studentaid.gov" target="_blank" rel="noreferrer">StudentAid.gov</a> with your FSA ID.</li>
          <li>Open your aid summary. School guides describe it under <strong>My Aid</strong> in your account menu; the label may change.</li>
          <li>Look for the option to download your aid data. It saves a text file, usually named <strong>MyStudentData.txt</strong>.</li>
          <li>Upload that file here. FirstStep reads only the loan details and ignores your name, address and contact info.</li>
        </ol>
        <p className="xs">We checked Federal Student Aid’s published file layout, but we can’t see inside your account. If the option looks different, use StudentAid.gov’s help center or add loans manually below. Downloaded data may not include your servicer’s latest updates.</p>
      </div>
    </details>
  );
}

export function UploadPanel({ onParsed }: { onParsed: () => void }) {
  const { reload } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'parsing' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setLastFile(file);
    setError(null);
    if (!/\.txt$/i.test(file.name)) return fail('Only .txt files are supported. The StudentAid.gov download is a .txt file.');
    if (file.size > 1_000_000) return fail('That file is larger than 1 MB, which is bigger than a StudentAid.gov aid data file should be.');
    if (file.size === 0) return fail('That file is empty.');
    setPhase('uploading');
    setProgress(0);
    try {
      await uploadText('/api/imports', file, (p) => {
        setProgress(p);
        if (p >= 100) setPhase('parsing');
      });
      setPhase('idle');
      await reload();
      onParsed();
    } catch (e) {
      await reload().catch(() => undefined);
      fail(e instanceof Error ? e.message : 'Upload failed.');
    }
  };
  const fail = (msg: string) => {
    setError(msg);
    setPhase('error');
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    handle(e.dataTransfer.files[0]);
  };
  return (
    <div className="stack">
      <div className={`dropzone ${drag ? 'drag' : ''}`} onDragOver={(e) => (e.preventDefault(), setDrag(true))} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
        <LuUpload size={28} aria-hidden="true" />
        <strong>Drag your MyStudentData.txt file here</strong>
        <span className="small muted">Accepted: .txt from StudentAid.gov · up to 1 MB</span>
        <input ref={input} type="file" accept=".txt,text/plain" className="sr-only" id="loan-file" onChange={(e) => (handle(e.target.files?.[0]), (e.target.value = ''))} />
        <Button variant="secondary" onClick={() => input.current?.click()} disabled={phase === 'uploading' || phase === 'parsing'}>
          <LuFileText aria-hidden="true" /> Browse files
        </Button>
      </div>
      <div aria-live="polite">
        {phase === 'uploading' && (
          <div className="stack stack-sm">
            <span className="small">Uploading {lastFile?.name}… {progress}%</span>
            <ProgressBar value={progress} label="Upload progress" />
          </div>
        )}
        {phase === 'parsing' && <span className="small row"><span className="spinner" aria-hidden="true" /> Reading your loans…</span>}
        {phase === 'error' && error && (
          <Alert kind="error" title="We couldn’t import that file">
            <p>{error}</p>
            <div className="row mt-8">
              {lastFile && <Button size="sm" variant="secondary" onClick={() => handle(lastFile)}>Retry</Button>}
              <Button size="sm" variant="ghost" onClick={() => input.current?.click()}>Choose another file</Button>
            </div>
            <p className="xs mt-8">You can also add your loans manually below.</p>
          </Alert>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────── Import review

interface Draft {
  key: string;
  rawIndex: number | null;
  include: boolean;
  name: string;
  loanType: string | null;
  category: 'federal' | 'private' | 'unknown';
  principal: number | null;
  interestBalance: number | null;
  interestRate: number | null;
  rateType: string | null;
  status: string | null;
  repaymentPlan: string | null;
  servicer: string | null;
  disbursementDate: string | null;
  repaymentBeginDate: string | null;
  nextPaymentDueDate: string | null;
  balanceAsOf: string | null;
  replaceLoanId: string | null;
  original: ParsedLoan | null;
}
const titleCase = (s: string | null) => (s ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s);

function draftFrom(raw: ParsedLoan, i: number, origin: LoanImport['origin']): Draft {
  const type = titleCase(raw.loanTypeDescription);
  const isFederal = origin === 'studentaid_file' || /direct|stafford|plus|perkins|ffel|federal/i.test(raw.loanTypeDescription ?? '');
  return {
    key: `raw-${i}`, rawIndex: i, include: true,
    name: `${type ?? 'Loan'}${raw.loanDate ? ` (${raw.loanDate.slice(0, 4)})` : ''}`,
    loanType: type, category: isFederal ? 'federal' : 'unknown', principal: raw.principal, interestBalance: raw.interestBalance, interestRate: raw.interestRate,
    rateType: raw.rateType, status: titleCase(raw.status), repaymentPlan: raw.repaymentPlan, servicer: raw.servicer, disbursementDate: raw.disbursements[0]?.date ?? raw.loanDate,
    repaymentBeginDate: raw.repaymentBeginDate, nextPaymentDueDate: raw.nextPaymentDueDate, balanceAsOf: raw.principalAsOf, replaceLoanId: null, original: raw,
  };
}
const edited = (d: Draft) =>
  !!d.original && (d.principal !== d.original.principal || d.interestBalance !== d.original.interestBalance || d.interestRate !== d.original.interestRate || (d.servicer ?? null) !== (d.original.servicer ?? null));

export function ImportReview({ imp, onDone }: { imp: LoanImport; onDone: () => void }) {
  const { data, mutate } = useApp();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Draft[]>(() => imp.raw.map((r, i) => draftFrom(r, i, imp.origin)));
  const { run, pending } = useAction();
  const existing = data.loans;
  const set = (key: string, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const addManual = () =>
    setDrafts((ds) => [...ds, { key: `new-${Date.now()}`, rawIndex: null, include: true, name: 'New loan', loanType: null, category: 'unknown', principal: null, interestBalance: null, interestRate: null, rateType: null, status: null, repaymentPlan: null, servicer: null, disbursementDate: null, repaymentBeginDate: null, nextPaymentDueDate: null, balanceAsOf: null, replaceLoanId: null, original: null }]);
  const included = drafts.filter((d) => d.include);
  const nameMissing = included.some((d) => !d.name.trim());

  const confirm = () =>
    run(async () => {
      await mutate('POST', `/api/imports/${imp.id}/confirm`, {
        loans: included.map((d) => ({
          name: d.name.trim(), loanType: d.loanType, category: d.category, principal: d.principal, interestBalance: d.interestBalance, interestRate: d.interestRate, rateType: d.rateType,
          status: d.status, repaymentPlan: d.repaymentPlan, servicer: d.servicer, disbursementDate: d.disbursementDate, repaymentBeginDate: d.repaymentBeginDate, nextPaymentDueDate: d.nextPaymentDueDate,
          balanceAsOf: d.balanceAsOf, rawIndex: d.rawIndex, edited: edited(d), replaceLoanId: d.replaceLoanId,
        })),
      });
      toast(`${included.length} loan${included.length === 1 ? '' : 's'} saved.`);
      onDone();
    });
  const discard = () => run(async () => (await mutate('POST', `/api/imports/${imp.id}/discard`), onDone()), 'Import discarded. Nothing was saved.');

  return (
    <div className="stack stack-lg">
      <div className="stack stack-sm">
        <h2 className="h3">Review your imported loans</h2>
        <p className="muted small">
          From <strong>{imp.fileName}</strong>{imp.fileRequestDate ? `, downloaded ${imp.fileRequestDate.slice(0, 10)}` : ''}. Check each loan, fix anything that’s wrong, remove anything that isn’t yours, then confirm. Nothing is saved until you do.
        </p>
      </div>
      {imp.warnings.length > 0 && (
        <Alert kind="warn" title={`${imp.warnings.length} thing${imp.warnings.length === 1 ? '' : 's'} to check`}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{imp.warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul>
        </Alert>
      )}
      <Alert>Principal and unpaid interest are shown separately. The file’s values may be out of date compared with your servicer’s records.</Alert>
      {drafts.length === 0 && <Empty title="No loans in this file">Add loans manually or discard this import.</Empty>}
      <div className="stack">
        {drafts.map((d, i) => (
          <fieldset key={d.key} className="panel stack" style={{ opacity: d.include ? 1 : 0.55 }}>
            <legend className="sr-only">Loan {i + 1}</legend>
            <div className="row-between">
              <label className="check">
                <input type="checkbox" checked={d.include} onChange={(e) => set(d.key, { include: e.target.checked })} />
                <span><strong>{d.rawIndex === null ? 'Added by you' : `Loan ${i + 1} from file`}</strong></span>
              </label>
              <div className="row">
                {d.rawIndex === null ? <span className="badge badge-manual">Entered by you</span> : edited(d) ? <span className="badge badge-manual">Edited — will be saved as entered by you</span> : <SourceBadge source={imp.origin === 'plaid_liabilities' ? 'connected' : 'imported'} />}
                {d.rawIndex === null && (
                  <Button variant="ghost" size="sm" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))} aria-label={`Remove ${d.name}`}>
                    <LuTrash2 aria-hidden="true" /> Remove
                  </Button>
                )}
              </div>
            </div>
            {d.include && (
              <div className="grid-3">
                <Field label="Name">{(p) => <input {...p} className="input" value={d.name} onChange={(e) => set(d.key, { name: e.target.value })} maxLength={80} />}</Field>
                <Field label="Type">
                  {(p) => (
                    <select {...p} className="select" value={d.category} onChange={(e) => set(d.key, { category: e.target.value as Draft['category'] })}>
                      <option value="federal">Federal</option>
                      <option value="private">Private</option>
                      <option value="unknown">Not sure</option>
                    </select>
                  )}
                </Field>
                <Field label="Outstanding principal" help={d.original && d.original.principal === null ? 'Not in the file' : undefined}>{(p) => <MoneyInput {...p} value={d.principal} onChange={(v) => set(d.key, { principal: v })} />}</Field>
                <Field label="Unpaid interest" help="Kept separate from principal">{(p) => <MoneyInput {...p} value={d.interestBalance} onChange={(v) => set(d.key, { interestBalance: v })} />}</Field>
                <Field label="Interest rate">{(p) => <NumberInput {...p} suffix="%" max={99.99} value={d.interestRate} onChange={(v) => set(d.key, { interestRate: v })} />}</Field>
                <Field label="Status" optional>{(p) => <input {...p} className="input" value={d.status ?? ''} onChange={(e) => set(d.key, { status: e.target.value || null })} />}</Field>
                <Field label="Servicer" optional>{(p) => <input {...p} className="input" value={d.servicer ?? ''} onChange={(e) => set(d.key, { servicer: e.target.value || null })} />}</Field>
                {existing.length > 0 && (
                  <Field label="Save as" help="Choose an existing loan only if this is the same loan.">
                    {(p) => (
                      <select {...p} className="select" value={d.replaceLoanId ?? ''} onChange={(e) => set(d.key, { replaceLoanId: e.target.value || null })}>
                        <option value="">A new loan</option>
                        {existing.map((l) => <option key={l.id} value={l.id}>Update “{l.name}” ({money(l.principal)})</option>)}
                      </select>
                    )}
                  </Field>
                )}
              </div>
            )}
            {d.include && d.replaceLoanId && (() => {
              const l = existing.find((x) => x.id === d.replaceLoanId)!;
              return (
                <Alert kind="warn" title="This will update an existing loan">
                  Current: principal {money(l.principal)}, rate {pct(l.interestRate)} ({l.source}). Imported: principal {money(d.principal)}, rate {pct(d.interestRate)}.
                </Alert>
              );
            })()}
          </fieldset>
        ))}
      </div>
      <div className="row">
        <Button variant="secondary" onClick={addManual}><LuPlus aria-hidden="true" /> Add a missing loan</Button>
      </div>
      {nameMissing && <p className="error-text">Every included loan needs a name.</p>}
      <div className="row">
        <Button onClick={confirm} loading={pending} disabled={nameMissing || included.length === 0}>Confirm {included.length} loan{included.length === 1 ? '' : 's'}</Button>
        <Button variant="ghost" onClick={discard} disabled={pending}>Discard this import</Button>
      </div>
    </div>
  );
}

// ───────────────────────────── Loan form

type LoanForm = Omit<Loan, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'importId' | 'importIndex' | 'source'> & { verified: boolean };
const emptyLoan: LoanForm = {
  name: '', loanType: null, category: 'federal', principal: null, interestBalance: null, balanceAsOf: null, interestRate: null, rateType: 'FIXED', status: null, repaymentPlan: null, servicer: null,
  disbursementDate: null, repaymentBeginDate: null, nextPaymentDueDate: null, gracePeriodEnd: null, gracePeriodEndStatus: 'unknown', firstPaymentDate: null, firstPaymentDateStatus: 'unknown', termMonths: null, notes: null, verified: false,
};

export function LoanFormDialog({ open, onClose, loan }: { open: boolean; onClose: () => void; loan: Loan | null }) {
  const { mutate } = useApp();
  const [f, setF] = useState<LoanForm>(() => (loan ? { ...loan, verified: loan.source === 'verified' } : emptyLoan));
  const [err, setErr] = useState<string | null>(null);
  const { run, pending } = useAction();
  const set = (p: Partial<LoanForm>) => setF((x) => ({ ...x, ...p }));
  const save = () => {
    if (!f.name.trim()) return setErr('Give the loan a name.');
    setErr(null);
    const { verified, ...rest } = f;
    const body = { ...rest, name: f.name.trim(), ...(verified ? { source: 'verified' } : loan?.source === 'verified' ? { source: 'manual' } : {}) };
    run(async () => {
      if (loan) await mutate('PATCH', `/api/loans/${loan.id}`, body);
      else await mutate('POST', '/api/loans', body);
      onClose();
    }, loan ? 'Loan updated.' : 'Loan added.');
  };
  const dateStatus = (k: 'firstPaymentDateStatus' | 'gracePeriodEndStatus') => (
    <select className="select" aria-label="Where this date came from" value={f[k]} onChange={(e) => set({ [k]: e.target.value as DateStatus })}>
      <option value="user_entered">Entered by me</option>
      <option value="confirmed">Confirmed with my servicer</option>
      <option value="estimated">My estimate</option>
      <option value="unknown">Unknown</option>
    </select>
  );
  return (
    <Dialog open={open} onClose={onClose} title={loan ? `Edit ${loan.name}` : 'Add a loan'} wide footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={pending}>{loan ? 'Save changes' : 'Add loan'}</Button></>}>
      <div className="stack">
        {err && <Alert kind="error">{err}</Alert>}
        {loan && (loan.source === 'imported' || loan.source === 'connected') && <Alert>Changing a value will mark this loan as entered by you, so imported and edited data stay distinguishable.</Alert>}
        <div className="grid-2">
          <Field label="Loan name">{(p) => <input {...p} className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} placeholder="e.g. Direct Unsubsidized 2025" />}</Field>
          <Field label="Federal or private?">
            {(p) => (
              <select {...p} className="select" value={f.category} onChange={(e) => set({ category: e.target.value as LoanForm['category'] })}>
                <option value="federal">Federal</option><option value="private">Private</option><option value="unknown">Not sure</option>
              </select>
            )}
          </Field>
          <Field label="Outstanding principal" help="What you still owe, not counting interest.">{(p) => <MoneyInput {...p} value={f.principal} onChange={(v) => set({ principal: v })} />}</Field>
          <Field label="Unpaid interest" optional help="Leave blank if you don’t know.">{(p) => <MoneyInput {...p} value={f.interestBalance} onChange={(v) => set({ interestBalance: v })} />}</Field>
          <Field label="Interest rate">{(p) => <NumberInput {...p} suffix="%" max={99.99} value={f.interestRate} onChange={(v) => set({ interestRate: v })} />}</Field>
          <Field label="Rate type" optional>
            {(p) => (
              <select {...p} className="select" value={f.rateType ?? ''} onChange={(e) => set({ rateType: e.target.value || null })}>
                <option value="">Not sure</option><option value="FIXED">Fixed</option><option value="VARIABLE">Variable</option>
              </select>
            )}
          </Field>
          <Field label="Loan type" optional>{(p) => <input {...p} className="input" value={f.loanType ?? ''} onChange={(e) => set({ loanType: e.target.value || null })} placeholder="e.g. Direct Subsidized" />}</Field>
          <Field label="Servicer or lender" optional>{(p) => <input {...p} className="input" value={f.servicer ?? ''} onChange={(e) => set({ servicer: e.target.value || null })} />}</Field>
          <Field label="Status" optional>{(p) => <input {...p} className="input" value={f.status ?? ''} onChange={(e) => set({ status: e.target.value || null })} placeholder="e.g. In grace period" />}</Field>
          <Field label="Repayment plan" optional>{(p) => <input {...p} className="input" value={f.repaymentPlan ?? ''} onChange={(e) => set({ repaymentPlan: e.target.value || null })} />}</Field>
          <Field label="Repayment term for estimates" optional help="Months. Leave blank to use your default assumption (Settings).">{(p) => <NumberInput {...p} min={1} max={600} value={f.termMonths} onChange={(v) => set({ termMonths: v === null ? null : Math.round(v) })} suffix="mo" />}</Field>
        </div>
        <hr className="rule" />
        <div className="grid-2">
          <div className="stack stack-sm">
            <Field label="First payment date" optional>{(p) => <input {...p} type="date" className="input" value={f.firstPaymentDate ?? ''} onChange={(e) => set({ firstPaymentDate: e.target.value || null, firstPaymentDateStatus: e.target.value ? (f.firstPaymentDateStatus === 'unknown' ? 'user_entered' : f.firstPaymentDateStatus) : 'unknown' })} />}</Field>
            {f.firstPaymentDate && dateStatus('firstPaymentDateStatus')}
          </div>
          <div className="stack stack-sm">
            <Field label="Grace period end" optional>{(p) => <input {...p} type="date" className="input" value={f.gracePeriodEnd ?? ''} onChange={(e) => set({ gracePeriodEnd: e.target.value || null, gracePeriodEndStatus: e.target.value ? (f.gracePeriodEndStatus === 'unknown' ? 'user_entered' : f.gracePeriodEndStatus) : 'unknown' })} />}</Field>
            {f.gracePeriodEnd && dateStatus('gracePeriodEndStatus')}
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={f.verified} onChange={(e) => set({ verified: e.target.checked })} />
          <span>I checked these details against my official servicer account. <span className="muted small">(Marks the loan “Verified by you”.)</span></span>
        </label>
      </div>
    </Dialog>
  );
}

// ───────────────────────────── Loan table & detail

export function LoanTable({ loans, defaultTerm, onSelect }: { loans: Loan[]; defaultTerm: number; onSelect: (l: Loan) => void }) {
  if (!loans.length) return <Empty title="No loans yet">Upload your StudentAid.gov file or add a loan to see balances and estimates.</Empty>;
  return (
    <div className="table-wrap">
      <table className="table stack-mobile">
        <thead>
          <tr><th>Loan</th><th className="r">Principal</th><th className="r">Unpaid interest</th><th className="r">Rate</th><th>Status</th><th className="r">Est. payment</th><th>Source</th><th>Updated</th></tr>
        </thead>
        <tbody>
          {loans.map((l) => {
            const e = estimateLoan(l, defaultTerm);
            return (
              <tr key={l.id} className="clickable" onClick={() => onSelect(l)}>
                <td data-label="Loan"><button className="btn-link" onClick={(ev) => (ev.stopPropagation(), onSelect(l))} style={{ textAlign: 'left', fontWeight: 600 }}>{l.name}</button><div className="xs muted">{l.category === 'federal' ? 'Federal' : l.category === 'private' ? 'Private' : 'Type unknown'}</div></td>
                <td data-label="Principal" className="r num">{l.principal === null ? <span className="badge badge-review">Missing</span> : money(l.principal)}</td>
                <td data-label="Unpaid interest" className="r num">{money(l.interestBalance, { fallback: 'Unknown' })}</td>
                <td data-label="Rate" className="r num">{l.interestRate === null ? <span className="badge badge-review">Missing</span> : pct(l.interestRate)}</td>
                <td data-label="Status">{l.status ?? <span className="muted">—</span>}</td>
                <td data-label="Est. payment" className="r num">{e.ok ? `${money(e.payment)}/mo` : <span className="muted small">Needs {e.missing.join(', ')}</span>}</td>
                <td data-label="Source"><SourceBadge source={l.source} /></td>
                <td data-label="Updated" className="small muted">{dateLabel(l.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LoanDetailDialog({ loan, onClose, onEdit }: { loan: Loan | null; onClose: () => void; onEdit: (l: Loan) => void }) {
  const { data, mutate } = useApp();
  const [confirmDel, setConfirmDel] = useState(false);
  const { run, pending } = useAction();
  const est = useMemo(() => (loan ? estimateLoan(loan, data.settings.defaultTermMonths) : null), [loan, data.settings.defaultTermMonths]);
  if (!loan || !est) return null;
  const imp = data.imports.find((i) => i.id === loan.importId);
  const raw = imp && loan.importIndex !== null ? imp.raw[loan.importIndex] : null;
  const del = () => run(async () => (await mutate('DELETE', `/api/loans/${loan.id}`), onClose()), 'Loan deleted.');
  return (
    <Dialog open={!!loan} onClose={onClose} title={loan.name} wide footer={<><Button variant="danger" onClick={() => (confirmDel ? del() : setConfirmDel(true))} loading={pending}>{confirmDel ? 'Yes, delete loan' : 'Delete'}</Button><Button variant="secondary" onClick={() => onEdit(loan)}>Edit</Button></>}>
      <div className="stack stack-lg">
        <div className="row"><SourceBadge source={loan.source} />{loan.notes && <span className="small muted">{loan.notes}</span>}</div>
        <div className="grid-2">
          <dl className="kv">
            <dt>Outstanding principal</dt><dd>{money(loan.principal, { fallback: 'Missing' })}</dd>
            <dt>Unpaid interest</dt><dd>{money(loan.interestBalance, { fallback: 'Unknown' })}</dd>
            <dt>Interest rate</dt><dd>{loan.interestRate === null ? 'Missing' : `${pct(loan.interestRate)} ${loan.rateType ? loan.rateType.toLowerCase() : ''}`}</dd>
            <dt>Status</dt><dd>{loan.status ?? '—'}</dd>
            <dt>Repayment plan</dt><dd>{loan.repaymentPlan ?? '—'}</dd>
            <dt>Servicer</dt><dd>{loan.servicer ?? '—'}</dd>
            <dt>Balance as of</dt><dd>{dateLabel(loan.balanceAsOf)}</dd>
          </dl>
          <dl className="kv">
            <dt>First payment</dt><dd>{dateLabel(loan.firstPaymentDate)} <DateStatusBadge status={loan.firstPaymentDateStatus} /></dd>
            <dt>Grace period end</dt><dd>{dateLabel(loan.gracePeriodEnd)} <DateStatusBadge status={loan.gracePeriodEndStatus} /></dd>
            <dt>First disbursed</dt><dd>{dateLabel(loan.disbursementDate)}</dd>
            <dt>Next payment due (file)</dt><dd>{dateLabel(loan.nextPaymentDueDate)}</dd>
          </dl>
        </div>
        <div className="panel-muted stack stack-sm">
          <span className="eyebrow">Estimated monthly payment</span>
          <span className="big-num">{est.ok ? money(est.payment) : 'Not calculable'}</span>
          {est.ok ? <span className="small">Total paid ≈ {money(est.totalPaid)}, of which interest ≈ {money(est.totalInterest)}, over {est.termMonths} months.</span> : <span className="small">Needs {est.missing.join(' and ')}.</span>}
          <HowCalculated>
            <p>Inputs: balance {money(est.balanceUsed)}, rate {pct(est.rate)}, term {est.termMonths} months.</p>
            <p>Method: standard amortization, payment = balance × r ÷ (1 − (1 + r)^−n), where r is the yearly rate ÷ 12 and n is months. A 0% loan is balance ÷ months.</p>
            {est.assumptions.map((a) => <p key={a}>{a}</p>)}
          </HowCalculated>
        </div>
        {raw && (
          <div className="stack stack-sm">
            <h3 className="h4">As imported{imp?.fileRequestDate ? ` (${imp.fileRequestDate.slice(0, 10)})` : ''}</h3>
            <p className="small muted">Principal {money(raw.principal)} · unpaid interest {money(raw.interestBalance)} · rate {pct(raw.interestRate)} · status {raw.status ?? '—'}</p>
          </div>
        )}
        {confirmDel && <Alert kind="warn">Deleting removes this loan from your budget and estimates. It can’t be undone.</Alert>}
      </div>
    </Dialog>
  );
}
