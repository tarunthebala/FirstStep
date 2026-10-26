import { useState } from 'react';
import { LuBuilding2, LuLandmark, LuRefreshCw, LuUnlink } from 'react-icons/lu';
import { dateTimeLabel, money } from '../../shared/format';
import type { Connection } from '../../shared/types';
import { api } from '../lib/api';
import { useAction, useApp } from '../lib/state';
import { Alert, Button, ConnectionBadge, Dialog } from './ui';

declare global {
  interface Window {
    Plaid?: { create: (o: { token: string; onSuccess: (publicToken: string, meta: { institution?: { name?: string } | null }) => void; onExit: (err: { display_message?: string; error_message?: string } | null) => void }) => { open: () => void } };
  }
}

function loadPlaid(): Promise<void> {
  if (window.Plaid) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Couldn’t load the secure connection window. Check your connection or try again later.'));
    document.head.appendChild(s);
  });
}

export function ConnectPanel({ onServicerImport }: { onServicerImport?: (importId: string) => void }) {
  const { data, mutate } = useApp();
  const ints = data.integrations;
  const [busy, setBusy] = useState<null | 'bank' | 'loan_servicer'>(null);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<Connection | null>(null);
  const { run, pending } = useAction();

  const start = async (kind: 'bank' | 'loan_servicer') => {
    setError(null);
    setBusy(kind);
    try {
      const { linkToken } = await api<{ linkToken: string }>('POST', '/api/plaid/link-token', { kind });
      await loadPlaid();
      const handler = window.Plaid!.create({
        token: linkToken,
        onSuccess: async (publicToken, meta) => {
          try {
            const r = await mutate<{ importId: string | null }>('POST', '/api/plaid/exchange', { publicToken, kind, institutionName: meta.institution?.name ?? null });
            if (r.importId && onServicerImport) onServicerImport(r.importId);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Connection failed.');
          } finally {
            setBusy(null);
          }
        },
        onExit: (err) => {
          if (err) setError(err.display_message || err.error_message || 'The connection was not completed.');
          setBusy(null);
        },
      });
      handler.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed.');
      setBusy(null);
    }
  };

  const conns = data.connections.filter((c) => c.status !== 'disconnected');
  const bank = conns.filter((c) => c.kind === 'bank');
  const servicer = conns.filter((c) => c.kind === 'loan_servicer');

  return (
    <div className="stack stack-lg">
      {!ints.plaid && (
        <Alert kind="info" title="Account connections aren’t available here">
          This FirstStep server isn’t configured with a connection provider, so nothing can be connected. That’s fine — continue with the information you enter yourself. Your plan will note anything that’s missing.
        </Alert>
      )}
      {ints.plaid && ints.plaidEnv === 'sandbox' && <Alert kind="warn" title="Sandbox mode">Connections use Plaid’s sandbox with test institutions. No real bank data is involved.</Alert>}
      {error && <Alert kind="error" title="Connection problem" onDismiss={() => setError(null)}>{error} You can try again, or continue with manual entry.</Alert>}

      <div className="grid-2">
        <section className="panel stack" aria-labelledby="bank-h">
          <div className="row"><LuLandmark size={22} aria-hidden="true" /><h3 id="bank-h" className="h3">Bank account</h3></div>
          <p className="small muted">Helps organize your spending. With your permission, FirstStep reads account names, balances and recent transactions (up to 90 days) to suggest budget categories. You sign in through Plaid — FirstStep never sees your bank password, and it can’t move money.</p>
          <div className="row">
            <Button onClick={() => start('bank')} loading={busy === 'bank'} disabled={!ints.plaid || !!busy}>Connect Bank Account</Button>
            {!ints.plaid && <span className="xs muted">Not configured on this server</span>}
          </div>
          {bank.map((c) => <ConnectionCard key={c.id} c={c} onDisconnect={() => setDisconnecting(c)} />)}
        </section>

        <section className="panel stack" aria-labelledby="svc-h">
          <div className="row"><LuBuilding2 size={22} aria-hidden="true" /><h3 id="svc-h" className="h3">Student loan servicer</h3></div>
          {ints.loanServicer ? (
            <>
              <p className="small muted">Some servicers can share read-only loan details (balance, rate, status, next due date) through Plaid. Not every federal or private servicer is supported. FirstStep can’t make payments. Anything retrieved goes to a review screen before it’s saved.</p>
              <Button onClick={() => start('loan_servicer')} loading={busy === 'loan_servicer'} disabled={!!busy}>Connect Loan Servicer</Button>
            </>
          ) : (
            <>
              <p className="small muted">Direct loan-servicer connection isn’t available here. Plaid doesn’t support every student loan servicer, and this server hasn’t enabled it.</p>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
                <li>Your StudentAid.gov import (if you uploaded one) stays in place.</li>
                <li>You can add or update loans manually any time.</li>
                <li>Check balances, rates, your repayment plan and payment dates in your official servicer account. Not sure who that is? See <a href="https://studentaid.gov/manage-loans/repayment/servicers" target="_blank" rel="noreferrer">StudentAid.gov’s servicer page</a>.</li>
              </ul>
            </>
          )}
          {servicer.map((c) => <ConnectionCard key={c.id} c={c} onDisconnect={() => setDisconnecting(c)} onImport={onServicerImport} />)}
        </section>
      </div>

      <Dialog
        open={!!disconnecting}
        onClose={() => setDisconnecting(null)}
        title={`Disconnect ${disconnecting?.institutionName ?? 'this account'}?`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDisconnecting(null)}>Cancel</Button>
            <Button variant="secondary" loading={pending} onClick={() => run(async () => (await mutate('DELETE', `/api/connections/${disconnecting!.id}`), setDisconnecting(null)), 'Disconnected. Imported data kept.')}>Disconnect, keep data</Button>
            <Button variant="danger" loading={pending} onClick={() => run(async () => (await mutate('DELETE', `/api/connections/${disconnecting!.id}?deleteData=true`), setDisconnecting(null)), 'Disconnected and imported data deleted.')}>Disconnect and delete data</Button>
          </>
        }
      >
        <div className="stack small">
          <p>Disconnecting asks Plaid to revoke FirstStep’s access and deletes FirstStep’s stored access credential. FirstStep won’t receive new data from this account.</p>
          <p><strong>Keep data:</strong> transactions and balances already imported stay so your budget doesn’t change. You can delete them later.</p>
          <p><strong>Delete data:</strong> removes this connection’s transactions and account balances from FirstStep. Budget amounts you confirmed yourself are not changed.</p>
        </div>
      </Dialog>
    </div>
  );
}

function ConnectionCard({ c, onDisconnect, onImport }: { c: Connection; onDisconnect: () => void; onImport?: (id: string) => void }) {
  const { mutate } = useApp();
  const { run, pending } = useAction();
  return (
    <div className="panel-muted stack stack-sm">
      <div className="row-between">
        <strong>{c.institutionName ?? 'Connected institution'}</strong>
        <ConnectionBadge status={c.status} />
      </div>
      {c.error && <p className="small neg">{c.error}</p>}
      {c.lastSyncedAt && <p className="xs muted">Last updated {dateTimeLabel(c.lastSyncedAt)}</p>}
      {c.kind === 'bank' && c.accounts.length > 0 && (
        <fieldset className="stack stack-sm">
          <legend className="small">Accounts to include</legend>
          {c.accounts.map((a) => (
            <label key={a.accountId} className="check small">
              <input type="checkbox" checked={a.included} onChange={(e) => run(() => mutate('PATCH', `/api/connections/${c.id}/accounts`, { accountId: a.accountId, included: e.target.checked }))} />
              <span>{a.name}{a.mask ? ` ••${a.mask}` : ''} · {a.subtype ?? a.type} · {money(a.balance)}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="row">
        <Button size="sm" variant="secondary" loading={pending} onClick={() => run(async () => { const r = await mutate<{ importId: string | null }>('POST', `/api/connections/${c.id}/sync`); if (r.importId && onImport) onImport(r.importId); }, 'Updated.')}>
          <LuRefreshCw aria-hidden="true" /> {c.status === 'needs_attention' ? 'Retry' : 'Refresh'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDisconnect}><LuUnlink aria-hidden="true" /> Disconnect</Button>
      </div>
    </div>
  );
}
