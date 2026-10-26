/**
 * Plaid REST client (server-side only). Uses documented endpoints:
 *   /link/token/create, /item/public_token/exchange, /accounts/get, /transactions/sync, /liabilities/get, /item/remove
 *
 * Bank connections request the `transactions` product. The loan-servicer option requests `liabilities`,
 * which returns read-only student loan details for institutions Plaid supports. Plaid does not publish a
 * list of covered student loan servicers, and nothing here initiates payments. The servicer option is
 * offered only when PLAID_ENABLE_LIABILITIES=true.
 *
 * Not tested against live Plaid credentials in the build environment.
 */
import { config, plaidConfigured } from './config';
import { HttpError } from './http';
import type { ParsedLoan } from '../shared/types';

const base = () => (config.plaid.env === 'production' ? 'https://production.plaid.com' : 'https://sandbox.plaid.com');

async function plaid<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!plaidConfigured()) throw new HttpError(503, 'Account connections are not configured on this server. You can enter your information manually.');
  const res = await fetch(base() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: config.plaid.clientId, secret: config.plaid.secret, ...body }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // Plaid error objects include error_code / display_message. Never echo tokens.
    const msg = (data.display_message as string) || (data.error_message as string) || 'The connection provider returned an error.';
    const code = (data.error_code as string) || 'UNKNOWN';
    throw new HttpError(code === 'ITEM_LOGIN_REQUIRED' ? 409 : 502, `${msg} (${code})`, { code });
  }
  return data as T;
}

export async function createLinkToken(userId: string, kind: 'bank' | 'loan_servicer') {
  if (kind === 'loan_servicer' && !config.plaid.enableLiabilities) throw new HttpError(409, 'Direct loan servicer connection is not available on this server.');
  const body: Record<string, unknown> = {
    user: { client_user_id: userId },
    client_name: 'FirstStep',
    products: kind === 'bank' ? ['transactions'] : ['liabilities'],
    country_codes: ['US'],
    language: 'en',
  };
  if (kind === 'bank') body.transactions = { days_requested: 90 };
  if (config.plaid.redirectUri) body.redirect_uri = config.plaid.redirectUri;
  const r = await plaid<{ link_token: string; expiration: string }>('/link/token/create', body);
  return r.link_token;
}

export async function exchangePublicToken(publicToken: string) {
  const r = await plaid<{ access_token: string; item_id: string }>('/item/public_token/exchange', { public_token: publicToken });
  return { accessToken: r.access_token, itemId: r.item_id };
}

interface PlaidAccount {
  account_id: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  balances: { available: number | null; current: number | null };
}
export async function getAccounts(accessToken: string) {
  const r = await plaid<{ accounts: PlaidAccount[] }>('/accounts/get', { access_token: accessToken });
  return r.accounts;
}

export interface PlaidTx {
  transaction_id: string;
  account_id: string;
  date: string;
  name: string;
  merchant_name: string | null;
  amount: number;
  pending: boolean;
  personal_finance_category?: { primary: string; detailed: string } | null;
}
export async function syncTransactions(accessToken: string) {
  const added: PlaidTx[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const r = await plaid<{ added: PlaidTx[]; has_more: boolean; next_cursor: string }>('/transactions/sync', { access_token: accessToken, cursor, count: 500 });
    added.push(...r.added);
    cursor = r.next_cursor;
    if (!r.has_more) break;
  }
  return added.filter((t) => !t.pending);
}

interface PlaidStudentLoan {
  account_id: string;
  loan_name: string | null;
  interest_rate_percentage: number | null;
  outstanding_interest_amount: number | null;
  origination_date: string | null;
  next_payment_due_date: string | null;
  loan_status: { type: string | null } | null;
  repayment_plan: { description: string | null; type: string | null } | null;
  disbursement_dates: string[] | null;
}
export async function getStudentLoans(accessToken: string): Promise<{ loans: ParsedLoan[]; institution: string | null }> {
  const r = await plaid<{ accounts: PlaidAccount[]; liabilities: { student: PlaidStudentLoan[] | null }; item: { institution_id: string | null } }>('/liabilities/get', { access_token: accessToken });
  const accounts = new Map(r.accounts.map((a) => [a.account_id, a]));
  const loans = (r.liabilities.student ?? []).map((s): ParsedLoan => {
    const acct = accounts.get(s.account_id);
    const current = acct?.balances.current ?? null;
    const interest = s.outstanding_interest_amount;
    return {
      loanTypeCode: null,
      loanTypeDescription: s.loan_name ?? acct?.name ?? 'Student loan',
      schoolName: null,
      loanDate: s.origination_date,
      loanAmount: null,
      disbursedAmount: null,
      // Plaid reports the account's current balance; principal is only derived when unpaid interest is also reported.
      principal: current !== null && interest !== null ? Math.round((current - interest) * 100) / 100 : null,
      principalAsOf: null,
      interestBalance: interest,
      interestAsOf: null,
      interestRate: s.interest_rate_percentage,
      rateType: null,
      repaymentPlan: s.repayment_plan?.description ?? s.repayment_plan?.type ?? null,
      repaymentBeginDate: null,
      nextPaymentDueDate: s.next_payment_due_date,
      status: s.loan_status?.type ?? null,
      servicer: null,
      disbursements: (s.disbursement_dates ?? []).map((d) => ({ date: d, amount: null })),
    };
  });
  return { loans, institution: r.item?.institution_id ?? null };
}

export async function removeItem(accessToken: string) {
  await plaid('/item/remove', { access_token: accessToken });
}
