import { z } from 'zod';
import { config, plaidConfigured } from './config';
import { decrypt, encrypt } from './crypto';
import { HttpError, Router, zDateOrNull, zId, zMoney, zMoneyOrNull, type Req, type Res } from './http';
import { createLinkToken, exchangePublicToken, getAccounts, getStudentLoans, removeItem, syncTransactions } from './plaid';
import { askCoach } from './coach';
import { seedDemo } from './demo';
import { parseStudentAidFile, validateUpload, MAX_FILE_BYTES } from './studentaid';
import {
  buildSnapshot,
  ensureUser,
  generateAndSavePlan,
  loadState,
  logActivity,
  newId,
  nextOnboardingPath,
  now,
  recomputeFromTransactions,
  refreshNotifications,
  setStep,
  suggestCategory,
} from './services';
import type { AuthProvider, Ctx, SessionUser, Store, Table } from './store/types';
import { USER_TABLES } from './store/types';
import { computeMetrics } from '../shared/plan';
import { computeReadiness, HABITS, HABIT_KEYS, milestoneReached, MILESTONES, weekStartOf, type HabitLog } from '../shared/readiness';
import { GRACE_CHECKLIST, LEARN_MODULE_IDS } from '../shared/learn-ids';
import {
  EXPENSE_KEYS,
  type BudgetSettings,
  type Connection,
  type Engagement,
  type ExpenseCategory,
  type FinancialSummary,
  type IncomeSource,
  type LearningProgress,
  type Loan,
  type LoanImport,
  type Notification,
  type NotificationPrefs,
  type Onboarding,
  type Profile,
  type SavingsAccount,
  type SavingsGoal,
  type Scenario,
  type Task,
  type Transaction,
} from '../shared/types';

// ───────────── rate limiting for credential endpoints
const attempts = new Map<string, { n: number; reset: number }>();
function limit(key: string, max = 10, windowMs = 15 * 60_000) {
  const t = Date.now();
  // Drop expired entries now and then so the map can't grow without bound on a public deploy.
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.reset < t) attempts.delete(k);
  const a = attempts.get(key);
  if (!a || a.reset < t) {
    attempts.set(key, { n: 1, reset: t + windowMs });
    return;
  }
  a.n++;
  if (a.n > max) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
}

// ───────────── schemas
const zEmail = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);
const zPassword = z.string().min(8, 'Use at least 8 characters.').max(128);
const zText = (max = 120) => z.string().trim().max(max);
const zDateStatus = z.enum(['confirmed', 'user_entered', 'estimated', 'unknown']);

const profileSchema = z.object({
  displayName: zText(60).nullable().optional(),
  graduationDate: zDateOrNull.optional(),
  graduationStatus: z.enum(['planning', 'soon', 'graduated']).nullable().optional(),
  school: zText(120).nullable().optional(),
  employmentStatus: z.enum(['student', 'unemployed', 'part_time', 'full_time', 'offer_accepted', 'other']).nullable().optional(),
  expectedEmploymentStart: zDateOrNull.optional(),
});

const loanFields = {
  name: zText(80).min(1, 'Give the loan a name.'),
  loanType: zText(80).nullable().optional(),
  category: z.enum(['federal', 'private', 'unknown']).optional(),
  principal: zMoneyOrNull.optional(),
  interestBalance: zMoneyOrNull.optional(),
  balanceAsOf: zDateOrNull.optional(),
  interestRate: z.number().finite().min(0).lt(100).nullable().optional(),
  rateType: zText(30).nullable().optional(),
  status: zText(80).nullable().optional(),
  repaymentPlan: zText(80).nullable().optional(),
  servicer: zText(80).nullable().optional(),
  disbursementDate: zDateOrNull.optional(),
  repaymentBeginDate: zDateOrNull.optional(),
  nextPaymentDueDate: zDateOrNull.optional(),
  gracePeriodEnd: zDateOrNull.optional(),
  gracePeriodEndStatus: zDateStatus.optional(),
  firstPaymentDate: zDateOrNull.optional(),
  firstPaymentDateStatus: zDateStatus.optional(),
  termMonths: z.number().int().min(1).max(600).nullable().optional(),
  notes: zText(500).nullable().optional(),
};
const loanCreate = z.object({ ...loanFields, source: z.enum(['manual', 'estimated', 'verified']).optional() });
const loanUpdate = z.object({ ...loanFields, name: loanFields.name.optional(), source: z.enum(['manual', 'estimated', 'verified']).optional() });

function normalizeDates<T extends { gracePeriodEnd?: string | null; gracePeriodEndStatus?: string; firstPaymentDate?: string | null; firstPaymentDateStatus?: string }>(v: T, prev?: Loan) {
  const out = { ...v };
  if (out.firstPaymentDate !== undefined) {
    if (!out.firstPaymentDate) out.firstPaymentDateStatus = 'unknown';
    else if (!out.firstPaymentDateStatus || (out.firstPaymentDateStatus === 'unknown' && prev?.firstPaymentDate !== out.firstPaymentDate)) out.firstPaymentDateStatus = 'user_entered';
  }
  if (out.gracePeriodEnd !== undefined) {
    if (!out.gracePeriodEnd) out.gracePeriodEndStatus = 'unknown';
    else if (!out.gracePeriodEndStatus || out.gracePeriodEndStatus === 'unknown') out.gracePeriodEndStatus = 'user_entered';
  }
  return out;
}

export function buildApi(store: Store, auth: AuthProvider) {
  const r = new Router();

  async function session(req: Req, res: Res): Promise<{ ctx: Ctx; user: SessionUser }> {
    const s = await auth.fromCookies(req.cookies);
    if (!s) throw new HttpError(401, 'Please log in.');
    if (s.refreshed) for (const [k, v] of Object.entries(s.refreshed)) res.cookie(k, v);
    return { ctx: { userId: s.user.userId, token: s.user.token }, user: s.user };
  }
  const setAuthCookies = (res: Res, cookies: Record<string, string>) => {
    for (const [k, v] of Object.entries(cookies)) res.cookie(k, v, { maxAge: 14 * 86400 });
  };
  const integrations = () => ({
    plaid: plaidConfigured(),
    plaidEnv: config.plaid.env,
    loanServicer: plaidConfigured() && config.plaid.enableLiabilities,
    email: false,
    demo: config.demoEnabled && !!auth.createDemoUser,
    driver: config.dataDriver,
  });
  const state = async (ctx: Ctx) => ({ ...(await loadState(store, ctx)), integrations: integrations() });
  const owned = async <T extends { id: string; userId: string }>(ctx: Ctx, table: Table, id: string) => {
    const row = await store.get<T & { [k: string]: unknown }>(ctx, table, zId.parse(id));
    if (!row) throw new HttpError(404, 'Not found.'); // same response whether it doesn't exist or belongs to someone else
    return row as T;
  };

  // ───── auth
  r.post('/api/auth/signup', async (req, res) => {
    limit(`signup:${req.ip}`, 10);
    const b = await req.json(z.object({ email: zEmail, password: zPassword, displayName: zText(60).optional() }));
    const { result, needsVerification } = await auth.signUp(b.email, b.password, `${config.appUrl}/login?verified=1`);
    if (!result) return { needsVerification: true };
    setAuthCookies(res, result.cookies);
    const ctx = { userId: result.user.userId, token: result.user.token };
    await ensureUser(store, ctx, result.user.email, { displayName: b.displayName ?? null });
    await logActivity(store, ctx, 'Account created.');
    return { needsVerification, next: '/onboarding/graduation' };
  });

  r.post('/api/auth/login', async (req, res) => {
    const b = await req.json(z.object({ email: zEmail, password: z.string().min(1).max(128) }));
    limit(`login:${req.ip}:${b.email}`, 8);
    const result = await auth.signIn(b.email, b.password);
    setAuthCookies(res, result.cookies);
    const ctx = { userId: result.user.userId, token: result.user.token };
    await ensureUser(store, ctx, result.user.email);
    const o = await store.get<Onboarding>(ctx, 'onboarding', ctx.userId);
    return { next: nextOnboardingPath(o) };
  });

  r.post('/api/auth/logout', async (req, res) => {
    await auth.signOut(req.cookies);
    for (const c of auth.cookieNames) res.clearCookie(c);
    return { ok: true };
  });

  r.get('/api/auth/me', async (req, res) => {
    const s = await auth.fromCookies(req.cookies);
    if (!s) return { user: null, integrations: integrations() };
    if (s.refreshed) setAuthCookies(res, s.refreshed);
    const ctx = { userId: s.user.userId, token: s.user.token };
    await ensureUser(store, ctx, s.user.email);
    const o = await store.get<Onboarding>(ctx, 'onboarding', ctx.userId);
    return { user: { id: s.user.userId, email: s.user.email }, next: nextOnboardingPath(o), integrations: integrations() };
  });

  r.post('/api/auth/reset-request', async (req) => {
    limit(`reset:${req.ip}`, 5);
    const b = await req.json(z.object({ email: zEmail }));
    await auth.requestPasswordReset(b.email, `${config.appUrl}/reset-password`);
    return { ok: true, localDriver: config.dataDriver === 'local' };
  });

  r.post('/api/auth/reset', async (req) => {
    limit(`reset2:${req.ip}`, 10);
    const b = await req.json(z.object({ token: z.string().min(10).max(4096), password: zPassword }));
    await auth.resetPassword(b.token, b.password);
    return { ok: true };
  });

  r.post('/api/demo/start', async (req, res) => {
    if (!config.demoEnabled || !auth.createDemoUser) throw new HttpError(404, 'Demo mode is not available.');
    limit(`demo:${req.ip}`, 20, 60 * 60_000);
    const result = await auth.createDemoUser();
    setAuthCookies(res, result.cookies);
    // Pass the session token too: the Supabase driver writes every row as the signed-in user (Row Level Security).
    await seedDemo(store, { userId: result.user.userId, token: result.user.token }, result.user.email);
    return { next: '/app' };
  });

  r.get('/api/integrations', async () => integrations());

  // ───── state
  r.get('/api/state', async (req, res) => {
    const { ctx, user } = await session(req, res);
    await ensureUser(store, ctx, user.email);
    return state(ctx);
  });

  // ───── profile & onboarding
  r.put('/api/profile', async (req, res) => {
    const { ctx } = await session(req, res);
    const b = await req.json(profileSchema);
    await store.update<Profile>(ctx, 'profiles', ctx.userId, { ...b, updatedAt: now() });
    return state(ctx);
  });

  r.post('/api/onboarding/graduation', async (req, res) => {
    const { ctx } = await session(req, res);
    const b = await req.json(
      profileSchema.extend({
        graduationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose your graduation date.'),
        graduationStatus: z.enum(['planning', 'soon', 'graduated'], { errorMap: () => ({ message: 'Choose your graduation status.' }) }),
        employmentStatus: z.enum(['student', 'unemployed', 'part_time', 'full_time', 'offer_accepted', 'other'], { errorMap: () => ({ message: 'Choose your employment status.' }) }),
      }),
    );
    const today = new Date().toISOString().slice(0, 10);
    if (b.graduationStatus === 'graduated' && b.graduationDate > today) throw new HttpError(422, 'You chose “Already graduated” but the date is in the future. Check one of them.');
    await store.update<Profile>(ctx, 'profiles', ctx.userId, { ...b, updatedAt: now() });
    await setStep(store, ctx, 'graduation', 'completed');
    await logActivity(store, ctx, 'Saved graduation details.');
    return state(ctx);
  });

  r.post('/api/onboarding/step', async (req, res) => {
    const { ctx } = await session(req, res);
    const b = await req.json(z.object({ step: z.enum(['loans', 'connections']), action: z.enum(['open', 'continue', 'skip']) }));
    const o = await store.get<Onboarding>(ctx, 'onboarding', ctx.userId);
    if (!o) throw new HttpError(404, 'Onboarding not found.');
    if (o.steps.graduation !== 'completed') throw new HttpError(409, 'Start with your graduation date.');
    if (b.action === 'open') {
      if (o.steps[b.step] === 'not_started') await setStep(store, ctx, b.step, 'in_progress');
      return state(ctx);
    }
    if (b.step === 'loans' && b.action === 'continue') {
      const loans = await store.list<Loan>(ctx, 'loans');
      const pending = (await store.list<LoanImport>(ctx, 'loan_imports')).filter((i) => i.status === 'parsed');
      if (pending.length) throw new HttpError(409, 'You have an import waiting for review. Confirm or discard it first.');
      if (!loans.length) throw new HttpError(422, 'Add at least one loan, or choose “I’ll add loans later”.');
    }
    if (b.step === 'connections' && b.action === 'continue') {
      const conns = await store.list<Connection>(ctx, 'connections');
      if (!conns.some((c) => c.status === 'connected')) throw new HttpError(422, 'No account is connected yet. Choose “Continue without connecting” to use manual entry.');
    }
    await setStep(store, ctx, b.step, b.action === 'skip' ? 'skipped' : 'completed');
    await logActivity(store, ctx, `${b.step === 'loans' ? 'Loan step' : 'Connection step'} ${b.action === 'skip' ? 'skipped' : 'completed'}.`);
    return state(ctx);
  });

  // ───── loan import
  r.post('/api/imports', async (req, res) => {
    const { ctx } = await session(req, res);
    const fileName = String(req.raw.headers['x-file-name'] ?? '').slice(0, 200);
    let name = 'upload.txt';
    try {
      name = decodeURIComponent(fileName) || name;
    } catch {
      /* keep default */
    }
    const bytes = await req.body();
    const invalid = validateUpload(name, bytes);
    const base: Omit<LoanImport, 'status' | 'errors' | 'warnings' | 'raw' | 'loanCount' | 'fileRequestDate'> = { id: newId(), userId: ctx.userId, origin: 'studentaid_file', fileName: name.replace(/[^\w.\- ]/g, '_'), importedAt: now() };
    if (invalid) {
      const imp: LoanImport = { ...base, status: 'failed', fileRequestDate: null, loanCount: 0, warnings: [], errors: [invalid], raw: [] };
      await store.insert(ctx, 'loan_imports', imp);
      throw new HttpError(422, invalid, { importId: imp.id });
    }
    const parsed = parseStudentAidFile(bytes.toString('utf8'));
    const imp: LoanImport = { ...base, status: parsed.ok ? 'parsed' : 'failed', fileRequestDate: parsed.fileRequestDate, loanCount: parsed.loans.length, warnings: parsed.warnings, errors: parsed.errors, raw: parsed.loans };
    await store.insert(ctx, 'loan_imports', imp);
    await logActivity(store, ctx, parsed.ok ? `Uploaded loan file (${parsed.loans.length} loans found).` : 'Loan file upload could not be read.');
    if (!parsed.ok) throw new HttpError(422, parsed.errors[0], { importId: imp.id });
    return { import: imp, totals: parsed.totals };
  });

  const draftSchema = z.object({
    ...loanFields,
    rawIndex: z.number().int().min(0).nullable(),
    edited: z.boolean(),
    replaceLoanId: zId.nullable().optional(),
  });
  r.post('/api/imports/:id/confirm', async (req, res) => {
    const { ctx } = await session(req, res);
    const imp = await owned<LoanImport>(ctx, 'loan_imports', req.params.id);
    if (imp.status !== 'parsed') throw new HttpError(409, 'This import was already handled.');
    const b = await req.json(z.object({ loans: z.array(draftSchema).max(350) }));
    const t = now();
    const importedSource: Loan['source'] = imp.origin === 'plaid_liabilities' ? 'connected' : 'imported';
    for (const d of b.loans) {
      const { rawIndex, edited, replaceLoanId, ...fields } = d;
      if (rawIndex !== null && rawIndex >= imp.raw.length) throw new HttpError(422, 'Unknown imported loan.');
      const values = normalizeDates(fields);
      const source: Loan['source'] = rawIndex === null ? 'manual' : edited ? 'manual' : importedSource;
      const notes = rawIndex !== null && edited ? `Edited after import on ${t.slice(0, 10)}.` : values.notes ?? null;
      if (replaceLoanId) {
        // The user explicitly chose to update an existing loan with this imported record.
        await owned<Loan>(ctx, 'loans', replaceLoanId);
        await store.update<Loan>(ctx, 'loans', replaceLoanId, { ...values, source, importId: imp.id, importIndex: rawIndex, notes, updatedAt: t });
      } else {
        await store.insert<Loan>(ctx, 'loans', {
          id: newId(), userId: ctx.userId, loanType: null, category: 'federal', principal: null, interestBalance: null, balanceAsOf: null, interestRate: null, rateType: null, status: null,
          repaymentPlan: null, servicer: null, disbursementDate: null, repaymentBeginDate: null, nextPaymentDueDate: null, gracePeriodEnd: null, gracePeriodEndStatus: 'unknown',
          firstPaymentDate: null, firstPaymentDateStatus: 'unknown', termMonths: null, ...values, notes, source, importId: imp.id, importIndex: rawIndex, createdAt: t, updatedAt: t,
        } as Loan);
      }
    }
    await store.update<LoanImport>(ctx, 'loan_imports', imp.id, { status: 'confirmed' });
    await logActivity(store, ctx, `Confirmed ${b.loans.length} loan(s) from ${imp.origin === 'plaid_liabilities' ? 'a connected servicer' : 'a StudentAid.gov file'}.`);
    return state(ctx);
  });

  r.post('/api/imports/:id/discard', async (req, res) => {
    const { ctx } = await session(req, res);
    const imp = await owned<LoanImport>(ctx, 'loan_imports', req.params.id);
    if (imp.status === 'parsed') await store.update<LoanImport>(ctx, 'loan_imports', imp.id, { status: 'discarded', raw: [] });
    return state(ctx);
  });

  // ───── loans
  r.post('/api/loans', async (req, res) => {
    const { ctx } = await session(req, res);
    const b = normalizeDates(await req.json(loanCreate));
    const t = now();
    await store.insert<Loan>(ctx, 'loans', {
      id: newId(), userId: ctx.userId, loanType: null, category: 'unknown', principal: null, interestBalance: null, balanceAsOf: null, interestRate: null, rateType: null, status: null,
      repaymentPlan: null, servicer: null, disbursementDate: null, repaymentBeginDate: null, nextPaymentDueDate: null, gracePeriodEnd: null, gracePeriodEndStatus: 'unknown',
      firstPaymentDate: null, firstPaymentDateStatus: 'unknown', termMonths: null, notes: null, importId: null, importIndex: null, ...b, source: b.source ?? 'manual', createdAt: t, updatedAt: t,
    } as Loan);
    await logActivity(store, ctx, `Added loan “${b.name}”.`);
    return state(ctx);
  });
  r.patch('/api/loans/:id', async (req, res) => {
    const { ctx } = await session(req, res);
    const prev = await owned<Loan>(ctx, 'loans', req.params.id);
    const b = normalizeDates(await req.json(loanUpdate), prev);
    const valueKeys = Object.keys(b).filter((k) => k !== 'source' && k !== 'notes' && !k.endsWith('Status'));
    const changedValues = valueKeys.some((k) => JSON.stringify((b as Record<string, unknown>)[k]) !== JSON.stringify((prev as unknown as Record<string, unknown>)[k]));
    // Editing an imported/connected value turns it into a manual value unless the user marks it verified.
    const source = b.source ?? (changedValues && (prev.source === 'imported' || prev.source === 'connected') ? 'manual' : prev.source);
    await store.update<Loan>(ctx, 'loans', prev.id, { ...b, source, updatedAt: now() });
    return state(ctx);
  });
  r.del('/api/loans/:id', async (req, res) => {
    const { ctx } = await session(req, res);
    const prev = await owned<Loan>(ctx, 'loans', req.params.id);
    await store.remove(ctx, 'loans', prev.id);
    await logActivity(store, ctx, `Deleted loan “${prev.name}”.`);
    return state(ctx);
  });

  // ───── income
  const incomeSchema = z.object({ label: zText(80).min(1), kind: z.enum(['current', 'expected']), monthlyAmount: zMoneyOrNull, status: z.enum(['confirmed', 'estimated', 'variable', 'not_available']) });
  r.post('/api/income', async (req, res) => {
    const { ctx } = await session(req, res);
    const b = await req.json(incomeSchema);
    await store.insert<IncomeSource>(ctx, 'income_sources', { id: newId(), userId: ctx.userId, ...b, source: 'manual', createdAt: now(), updatedAt: now() });
    return state(ctx);
  });
  r.patch('/api/income/:id', async (req, res) => {
    const { ctx } = await session(req, res);
    const prev = await owned<IncomeSource>(ctx, 'income_sources', req.params.id);
    const b = await req.json(incomeSchema.partial());
    const source = b.monthlyAmount !== undefined && b.monthlyAmount !== prev.monthlyAmount ? 'manual' : prev.source;
    await store.update<IncomeSource>(ctx, 'income_sources', prev.id, { ...b, source, updatedAt: now() });
    return state(ctx);
  });
  r.del('/api/income/:id', async (req, res) => {
    const { ctx } = await session(req, res);
    await owned<IncomeSource>(ctx, 'income_sources', req.params.id);
    await store.remove(ctx, 'income_sources', req.params.id);
    return state(ctx);
  });

  // ───── expenses (upsert by key + scope)
  r.put('/api/expenses', async (req, res) => {
    const { ctx } = await session(req, res);
    const b = await req.json(z.object({ key: z.enum(EXPENSE_KEYS), scope: z.enum(['current', 'post_grad']), monthlyAmount: zMoneyOrNull.optional(), status: z.enum(['confirmed', 'estimated', 'needs_review']).optional() }));
    const cats = await store.list<ExpenseCategory>(ctx, 'expense_categories');
    const ex = cats.find((c) => c.key === b.key && c.scope === b.scope);
    const t = now();
    if (ex) {
      const amountChanged = b.monthlyAmount !== undefined && b.monthlyAmount !== ex.monthlyAmount;
      await store.update<ExpenseCategory>(ctx, 'expense_categories', ex.id, {
        ...(b.monthlyAmount !== undefined ? { monthlyAmount: b.monthlyAmount } : {}),
        status: b.status ?? (amountChanged && ex.status === 'needs_review' ? 'estimated' : ex.status),
        source: amountChanged ? 'manual' : ex.source,
        updatedAt: t,
      });
    } else {
      await store.insert<ExpenseCategory>(ctx, 'expense_categories', { id: newId(), userId: ctx.userId, key: b.key, scope: b.scope, monthlyAmount: b.monthlyAmount ?? null, status: b.status ?? 'estimated', source: 'manual', observedTotal: null, observedMonths: null, createdAt: t, updatedAt: t });
    }
    return state(ctx);
  });

  // ───── savings & goals & settings
  const savingsSchema = z.object({ label: zText(80).min(1), balance: zMoneyOrNull, accessibleForEmergencies: z.boolean(), excluded: z.boolean().optional() });
  r.post('/api/savings', async (req, res) => {
    const { ctx } = await session(req, res);
    const b = await req.json(savingsSchema);
    await store.insert<SavingsAccount>(ctx, 'savings_accounts', { id: newId(), userId: ctx.userId, excluded: false, ...b, source: 'manual', connectionAccountId: null, createdAt: now(), updatedAt: now() });
    return state(ctx);
  });
  r.patch('/api/savings/:id', async (req, res) => {
    const { ctx } = await session(req, res);
    const prev = await owned<SavingsAccount>(ctx, 'savings_accounts', req.params.id);
    const b = await req.json(savingsSchema.partial());
    const source = b.balance !== undefined && b.balance !== prev.balance ? 'manual' : prev.source;
    await store.update<SavingsAccount>(ctx, 'savings_accounts', prev.id, { ...b, source, updatedAt: now() });
    return state(ctx);
  });
  r.del('/api/savings/:id', async (req, res) => {
    const { ctx } = await session(req, res);
    await owned<SavingsAccount>(ctx, 'savings_accounts', req.params.id);
    await store.remove(ctx, 'savings_accounts', req.params.id);
    return state(ctx);
  });
  const goalSchema = z.object({ label: zText(80).min(1), targetAmount: zMoney.refine((n) => n > 0, 'Target must be more than $0.'), targetDate: zDateOrNull });
  r.post('/api/goals', async (req, res) => {
    const { ctx } = await session(req, res);
    const b = await req.json(goalSchema);
    await store.insert<SavingsGoal>(ctx, 'savings_goals', { id: newId(), userId: ctx.userId, ...b, createdAt: now(), updatedAt: now() });
    await refreshNotifications(store, ctx);
    return state(ctx);
  });
  r.patch('/api/goals/:id', async (req, res) => {
    const { ctx } = await session(req, res);
    await owned<SavingsGoal>(ctx, 'savings_goals', req.params.id);
    const b = await req.json(goalSchema.partial());
    await store.update<SavingsGoal>(ctx, 'savings_goals', req.params.id, { ...b, updatedAt: now() });
    return state(ctx);
  });
  r.del('/api/goals/:id', async (req, res) => {
    const { ctx } = await session(req, res);
    await owned<SavingsGoal>(ctx, 'savings_goals', req.params.id);
    await store.remove(ctx, 'savings_goals', req.params.id);
    return state(ctx);
  });
  r.put('/api/settings/budget', async (req, res) => {
    const { ctx } = await session(req, res);
    const b = await req.json(z.object({ monthlySavingsContribution: zMoneyOrNull.optional(), studentLoanPaymentInExpenses: z.boolean().optional(), defaultTermMonths: z.number().int().min(12).max(600).optional() }));
    await store.update<BudgetSettings>(ctx, 'budget_settings', ctx.userId, { ...b, updatedAt: now() });
    return state(ctx);
  });

  // ───── transactions
  r.patch('/api/transactions/:id', async (req, res) => {
    const { ctx } = await session(req, res);
    await owned<Transaction>(ctx, 'transactions', req.params.id);
    const b = await req.json(z.object({ category: z.enum([...EXPENSE_KEYS, 'income', 'transfer', 'uncategorized']).optional(), excluded: z.boolean().optional(), oneTime: z.boolean().optional() }));
    const patch: Partial<Transaction> = { ...b, reviewed: true };
    if (b.category === 'transfer') patch.excluded = true; // transfers between your own accounts are not income or spending
    await store.update<Transaction>(ctx, 'transactions', req.params.id, patch);
    await recomputeFromTransactions(store, ctx);
    return state(ctx);
  });
  r.post('/api/transactions/mark-reviewed', async (req, res) => {
    const { ctx } = await session(req, res);
    const b = await req.json(z.object({ ids: z.array(zId).max(2000) }));
    for (const id of b.ids) await store.update<Transaction>(ctx, 'transactions', id, { reviewed: true });
    return state(ctx);
  });

  // ───── summary & plan
  r.post('/api/summary/confirm', async (req, res) => {
    const { ctx } = await session(req, res);
    const b = await req.json(z.object({ studentLoanPaymentInExpenses: z.boolean(), reviewed: z.literal(true, { errorMap: () => ({ message: 'Please confirm you reviewed the summary.' }) }) }));
    const o = await store.get<Onboarding>(ctx, 'onboarding', ctx.userId);
    if (!o || o.steps.graduation !== 'completed') throw new HttpError(409, 'Start with your graduation date.');
    const pending = (await store.list<LoanImport>(ctx, 'loan_imports')).filter((i) => i.status === 'parsed');
    if (pending.length) throw new HttpError(409, 'You have imported loans waiting for review. Confirm or discard them first.');
    await store.update<BudgetSettings>(ctx, 'budget_settings', ctx.userId, { studentLoanPaymentInExpenses: b.studentLoanPaymentInExpenses, updatedAt: now() });
    const s = await loadState(store, ctx);
    const anything = s.loans.length || s.income.some((i) => i.monthlyAmount !== null) || s.expenses.some((e) => e.monthlyAmount !== null);
    if (!anything) throw new HttpError(422, 'Add at least one loan, an income amount or an expense before building your plan.');
    const summary: FinancialSummary = { id: newId(), userId: ctx.userId, confirmedAt: now(), snapshot: buildSnapshot(s) };
    await store.insert(ctx, 'financial_summaries', summary);
    // Steps before the summary that were never touched are recorded as skipped, not completed.
    for (const k of ['loans', 'connections'] as const) if (o.steps[k] === 'not_started' || o.steps[k] === 'in_progress') await setStep(store, ctx, k, 'skipped');
    await setStep(store, ctx, 'summary', 'completed');
    await logActivity(store, ctx, 'Reviewed and confirmed the financial summary.');
    let planError: string | null = null;
    try {
      await generateAndSavePlan(store, ctx, summary.id);
      await setStep(store, ctx, 'plan', 'completed');
      await logActivity(store, ctx, 'Generated personalized plan.');
    } catch (e) {
      planError = e instanceof Error ? e.message : 'Plan generation failed.';
      await setStep(store, ctx, 'plan', 'needs_attention');
    }
    return { ...(await state(ctx)), planError };
  });

  r.post('/api/plan/generate', async (req, res) => {
    const { ctx } = await session(req, res);
    const s = await loadState(store, ctx);
    if (!s.summary) throw new HttpError(409, 'Review and confirm your financial summary before generating a plan.');
    try {
      await generateAndSavePlan(store, ctx, s.summary.id);
    } catch (e) {
      await setStep(store, ctx, 'plan', 'needs_attention');
      throw new HttpError(500, `We couldn’t build your plan: ${e instanceof Error ? e.message : 'unknown error'}. Your confirmed data is saved; try again.`);
    }
    await setStep(store, ctx, 'plan', 'completed');
    await logActivity(store, ctx, 'Regenerated plan from confirmed data.');
    return state(ctx);
  });

  // ───── tasks
  r.patch('/api/tasks/:id', async (req, res) => {
    const { ctx } = await session(req, res);
    const t = await owned<Task>(ctx, 'tasks', req.params.id);
    const b = await req.json(z.object({ status: z.enum(['open', 'done']).optional(), dueDate: zDateOrNull.optional() }));
    await store.update<Task>(ctx, 'tasks', t.id, { ...b, completedAt: b.status === 'done' ? now() : b.status === 'open' ? null : t.completedAt });
    if (b.status === 'done') await logActivity(store, ctx, `Completed “${t.title}”.`);
    await refreshNotifications(store, ctx);
    return state(ctx);
  });

  r.put('/api/checklist/:key', async (req, res) => {
    const { ctx } = await session(req, res);
    const item = GRACE_CHECKLIST.find((c) => c.key === req.params.key);
    if (!item) throw new HttpError(404, 'Unknown checklist item.');
    const b = await req.json(z.object({ done: z.boolean() }));
    const ex = (await store.list<Task>(ctx, 'tasks')).find((t) => t.key === item.key);
    const fields = { status: (b.done ? 'done' : 'open') as Task['status'], completedAt: b.done ? now() : null };
    if (ex) await store.update<Task>(ctx, 'tasks', ex.id, fields);
    else await store.insert<Task>(ctx, 'tasks', { id: newId(), userId: ctx.userId, planId: null, key: item.key, stage: 'prepare', title: item.title, reason: 'Grace-period checklist', priority: 'low', dueDate: null, link: item.link, createdAt: now(), ...fields });
    return state(ctx);
  });

  // ───── readiness: weekly habits & celebration state
  const readinessFor = async (ctx: Ctx) => {
    const s = await loadState(store, ctx);
    const est = s.profile && s.settings ? computeMetrics({ profile: s.profile, loans: s.loans, income: s.income, expenses: s.expenses, savings: s.savings, goals: s.goals, settings: s.settings }).estimatedMonthlyPayment : null;
    return { s, r: computeReadiness({ ...s, summary: s.summary, habits: s.habits, estimatedMonthlyPayment: est }) };
  };

  r.put('/api/habits/:key', async (req, res) => {
    const { ctx } = await session(req, res);
    const key = req.params.key as HabitLog['habitKey'];
    if (!HABIT_KEYS.includes(key)) throw new HttpError(404, 'Unknown habit.');
    const b = await req.json(z.object({ done: z.boolean(), today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }));
    // The client sends its local date so weeks follow the user's calendar; it must be within a day or two of the server's.
    const drift = Math.abs(new Date(`${b.today}T12:00:00Z`).getTime() - Date.now()) / 86400000;
    if (!(drift <= 2)) throw new HttpError(422, 'Your device date looks off. Check your clock and try again.');
    const habit = HABITS.find((h) => h.key === key)!;
    if (habit.needs === 'loans' && !(await store.list(ctx, 'loans')).length) throw new HttpError(409, 'Add a loan first — there are no loan details to review yet.');
    if (habit.needs === 'plan' && !(await store.list(ctx, 'plans')).length) throw new HttpError(409, 'Build your plan first — there’s no repayment plan to check yet.');
    const weekStart = weekStartOf(b.today);
    const logs = await store.list<HabitLog & { id: string; userId: string }>(ctx, 'habit_logs');
    const existing = logs.find((l) => l.habitKey === key && l.weekStart === weekStart);
    if (b.done && !existing) {
      // One completion per habit per week — repeating it can't add points.
      await store.insert<HabitLog>(ctx, 'habit_logs', { id: newId(), userId: ctx.userId, habitKey: key, weekStart, completedAt: now() });
      await logActivity(store, ctx, `Completed a weekly habit: ${habit.label.toLowerCase()}.`);
    } else if (!b.done && existing) {
      await store.remove(ctx, 'habit_logs', existing.id);
    }
    return state(ctx);
  });

  r.post('/api/engagement/seen', async (req, res) => {
    const { ctx, user } = await session(req, res);
    await ensureUser(store, ctx, user.email);
    const e = (await store.get<Engagement>(ctx, 'engagement', ctx.userId))!;
    const t = now();
    // A new visit starts after 6 hours away; repeated page loads within a visit don't count as new visits.
    const newVisit = !e.lastSeenAt || Date.now() - new Date(e.lastSeenAt).getTime() > 6 * 3600_000;
    await store.update<Engagement>(ctx, 'engagement', ctx.userId, { lastSeenAt: t, previousSeenAt: newVisit ? e.lastSeenAt : e.previousSeenAt, updatedAt: t });
    return state(ctx);
  });

  r.post('/api/engagement/celebrate', async (req, res) => {
    const { ctx } = await session(req, res);
    const b = await req.json(z.object({ milestone: z.number().int().refine((m) => (MILESTONES as readonly number[]).includes(m), 'Unknown milestone.') }));
    const { s, r: result } = await readinessFor(ctx);
    // Verify against the server-side score: a milestone can only be recorded once it is actually reached.
    const allowed = Math.min(b.milestone, milestoneReached(result.score));
    const current = s.engagement?.celebratedMilestone ?? 0;
    if (allowed > current) {
      await store.update<Engagement>(ctx, 'engagement', ctx.userId, { celebratedMilestone: allowed, updatedAt: now() });
      await logActivity(store, ctx, `Reached ${allowed}% financial readiness.`);
    }
    return { ...(await state(ctx)), score: result.score };
  });

  r.post('/api/engagement/dismiss', async (req, res) => {
    const { ctx } = await session(req, res);
    const b = await req.json(z.object({ key: z.string().min(1).max(200) }));
    const e = (await store.get<Engagement>(ctx, 'engagement', ctx.userId))!;
    if (!e.dismissed.includes(b.key)) await store.update<Engagement>(ctx, 'engagement', ctx.userId, { dismissed: [...e.dismissed, b.key].slice(-80), updatedAt: now() });
    return state(ctx);
  });

  // ───── scenarios (hypothetical; never touch baseline tables)
  const scenarioSchema = z.object({ name: zText(80).min(1, 'Name your scenario.'), type: z.enum(['lifestyle', 'delayed_employment', 'unexpected', 'practice_payment', 'repayment_compare']), inputs: z.record(z.unknown()).refine((o) => JSON.stringify(o).length < 20_000, 'Scenario is too large.') });
  r.post('/api/scenarios', async (req, res) => {
    const { ctx } = await session(req, res);
    const b = await req.json(scenarioSchema);
    const sc: Scenario = { id: newId(), userId: ctx.userId, ...b, createdAt: now(), updatedAt: now() };
    await store.insert(ctx, 'scenarios', sc);
    await logActivity(store, ctx, `Saved Money Lab scenario “${b.name}”.`);
    return { ...(await state(ctx)), saved: sc.id };
  });
  r.patch('/api/scenarios/:id', async (req, res) => {
    const { ctx } = await session(req, res);
    await owned<Scenario>(ctx, 'scenarios', req.params.id);
    const b = await req.json(scenarioSchema.partial().omit({ type: true }));
    await store.update<Scenario>(ctx, 'scenarios', req.params.id, { ...b, updatedAt: now() });
    return state(ctx);
  });
  r.post('/api/scenarios/:id/duplicate', async (req, res) => {
    const { ctx } = await session(req, res);
    const sc = await owned<Scenario>(ctx, 'scenarios', req.params.id);
    const copy: Scenario = { ...sc, id: newId(), name: `${sc.name} (copy)`.slice(0, 80), createdAt: now(), updatedAt: now() };
    await store.insert(ctx, 'scenarios', copy);
    return { ...(await state(ctx)), saved: copy.id };
  });
  r.del('/api/scenarios/:id', async (req, res) => {
    const { ctx } = await session(req, res);
    await owned<Scenario>(ctx, 'scenarios', req.params.id);
    await store.remove(ctx, 'scenarios', req.params.id);
    return state(ctx);
  });

  // ───── learning
  r.put('/api/learning/:moduleId', async (req, res) => {
    const { ctx } = await session(req, res);
    const moduleId = req.params.moduleId;
    if (!LEARN_MODULE_IDS.includes(moduleId)) throw new HttpError(404, 'Unknown module.');
    const b = await req.json(z.object({ completed: z.boolean().optional(), quizCorrect: z.boolean().optional() }));
    const all = await store.list<LearningProgress>(ctx, 'learning_progress');
    const ex = all.find((p) => p.moduleId === moduleId);
    const t = now();
    if (ex) {
      await store.update<LearningProgress>(ctx, 'learning_progress', ex.id, {
        completed: b.completed ?? ex.completed, quizCorrect: b.quizCorrect ?? ex.quizCorrect, attempts: ex.attempts + (b.quizCorrect !== undefined ? 1 : 0),
        completedAt: b.completed ? ex.completedAt ?? t : ex.completedAt, updatedAt: t,
      });
    } else {
      await store.insert<LearningProgress>(ctx, 'learning_progress', { id: newId(), userId: ctx.userId, moduleId, completed: !!b.completed, quizCorrect: b.quizCorrect ?? null, attempts: b.quizCorrect !== undefined ? 1 : 0, completedAt: b.completed ? t : null, updatedAt: t });
    }
    if (b.completed) await logActivity(store, ctx, `Completed a Learn module.`);
    return state(ctx);
  });

  // ───── notifications
  r.post('/api/notifications/refresh', async (req, res) => {
    const { ctx } = await session(req, res);
    await refreshNotifications(store, ctx);
    return state(ctx);
  });
  r.post('/api/notifications/:id/read', async (req, res) => {
    const { ctx } = await session(req, res);
    await owned<Notification>(ctx, 'notifications', req.params.id);
    await store.update<Notification>(ctx, 'notifications', req.params.id, { readAt: now() });
    return state(ctx);
  });
  r.post('/api/notifications/read-all', async (req, res) => {
    const { ctx } = await session(req, res);
    for (const n of await store.list<Notification>(ctx, 'notifications')) if (!n.readAt) await store.update<Notification>(ctx, 'notifications', n.id, { readAt: now() });
    return state(ctx);
  });
  r.put('/api/notifications/prefs', async (req, res) => {
    const { ctx } = await session(req, res);
    const b = await req.json(z.object({ tasks: z.boolean(), dates: z.boolean(), onboarding: z.boolean(), savings: z.boolean(), review: z.boolean(), emailOptIn: z.boolean() }).partial());
    if (b.emailOptIn && !config.email.provider) throw new HttpError(409, 'Email reminders aren’t available because no email provider is configured. In-app reminders still work.');
    await store.update<NotificationPrefs>(ctx, 'notification_prefs', ctx.userId, { ...b, updatedAt: now() });
    return state(ctx);
  });

  // ───── connections (Plaid)
  r.post('/api/plaid/link-token', async (req, res) => {
    const { ctx } = await session(req, res);
    const b = await req.json(z.object({ kind: z.enum(['bank', 'loan_servicer']) }));
    return { linkToken: await createLinkToken(ctx.userId, b.kind) };
  });

  async function syncConnection(ctx: Ctx, conn: Connection) {
    const cipher = await store.getSecret(ctx, conn.id);
    if (!cipher) throw new HttpError(409, 'This connection needs to be reconnected.');
    const token = decrypt(cipher);
    if (conn.kind === 'bank') {
      const accounts = await getAccounts(token);
      const prevIncluded = new Map(conn.accounts.map((a) => [a.accountId, a.included]));
      const mapped = accounts.map((a) => ({ accountId: a.account_id, name: a.name, mask: a.mask, type: a.type, subtype: a.subtype, balance: a.balances.available ?? a.balances.current, included: prevIncluded.get(a.account_id) ?? a.type === 'depository' }));
      const savings = await store.list<SavingsAccount>(ctx, 'savings_accounts');
      for (const a of mapped.filter((a) => a.type === 'depository')) {
        const ex = savings.find((s) => s.connectionAccountId === a.accountId);
        if (ex) await store.update<SavingsAccount>(ctx, 'savings_accounts', ex.id, { balance: a.balance, updatedAt: now() });
        else
          await store.insert<SavingsAccount>(ctx, 'savings_accounts', {
            id: newId(), userId: ctx.userId, label: `${a.name}${a.mask ? ` ••${a.mask}` : ''}`, balance: a.balance,
            // Not every balance is emergency money. Only savings-type accounts start as accessible; the user decides.
            accessibleForEmergencies: a.subtype === 'savings', excluded: !a.included, source: 'connected', connectionAccountId: a.accountId, createdAt: now(), updatedAt: now(),
          });
      }
      const txs = await syncTransactions(token);
      const existing = new Set((await store.list<Transaction>(ctx, 'transactions')).map((t) => t.id));
      const included = new Set(mapped.filter((a) => a.included).map((a) => a.accountId));
      for (const t of txs) {
        if (existing.has(t.transaction_id)) continue;
        const desc = (t.merchant_name || t.name || 'Transaction').slice(0, 140);
        const sug = suggestCategory(desc, t.amount, t.personal_finance_category?.detailed ?? t.personal_finance_category?.primary);
        await store.insert<Transaction>(ctx, 'transactions', {
          id: t.transaction_id, userId: ctx.userId, connectionId: conn.id, accountId: t.account_id, date: t.date, description: desc, amount: t.amount, suggestedCategory: sug,
          category: sug ?? 'uncategorized', excluded: sug === 'transfer' || !included.has(t.account_id), oneTime: false, reviewed: false, source: 'connected', createdAt: now(),
        });
      }
      await store.update<Connection>(ctx, 'connections', conn.id, { accounts: mapped, status: 'connected', lastSyncedAt: now(), error: null, updatedAt: now() });
      await recomputeFromTransactions(store, ctx);
    } else {
      const { loans } = await getStudentLoans(token);
      const imp: LoanImport = { id: newId(), userId: ctx.userId, origin: 'plaid_liabilities', fileName: `Connected servicer: ${conn.institutionName ?? 'institution'}`, importedAt: now(), status: 'parsed', fileRequestDate: null, loanCount: loans.length, warnings: loans.length ? [] : [{ loanIndex: null, field: null, message: 'The connected institution returned no student loans.' }], errors: [], raw: loans };
      await store.insert(ctx, 'loan_imports', imp);
      await store.update<Connection>(ctx, 'connections', conn.id, { status: 'connected', lastSyncedAt: now(), error: null, updatedAt: now() });
      return imp.id;
    }
    return null;
  }

  r.post('/api/plaid/exchange', async (req, res) => {
    const { ctx } = await session(req, res);
    const b = await req.json(z.object({ publicToken: z.string().min(5).max(500), kind: z.enum(['bank', 'loan_servicer']), institutionName: zText(120).nullable().optional() }));
    if (b.kind === 'loan_servicer' && !config.plaid.enableLiabilities) throw new HttpError(409, 'Direct loan servicer connection is not available on this server.');
    const conn: Connection = { id: newId(), userId: ctx.userId, provider: 'plaid', kind: b.kind, status: 'connecting', institutionName: b.institutionName ?? null, itemId: null, accounts: [], lastSyncedAt: null, error: null, createdAt: now(), updatedAt: now() };
    await store.insert(ctx, 'connections', conn);
    try {
      const { accessToken, itemId } = await exchangePublicToken(b.publicToken);
      await store.putSecret(ctx, conn.id, encrypt(accessToken));
      await store.update<Connection>(ctx, 'connections', conn.id, { itemId });
      const importId = await syncConnection(ctx, { ...conn, itemId });
      await logActivity(store, ctx, `Connected ${b.kind === 'bank' ? 'a bank account' : 'a loan servicer'}${b.institutionName ? ` (${b.institutionName})` : ''}.`);
      return { ...(await state(ctx)), importId };
    } catch (e) {
      await store.update<Connection>(ctx, 'connections', conn.id, { status: 'needs_attention', error: e instanceof Error ? e.message : 'Connection failed.', updatedAt: now() });
      throw e;
    }
  });

  r.post('/api/connections/:id/sync', async (req, res) => {
    const { ctx } = await session(req, res);
    const conn = await owned<Connection>(ctx, 'connections', req.params.id);
    if (conn.status === 'disconnected') throw new HttpError(409, 'This connection was disconnected.');
    try {
      const importId = await syncConnection(ctx, conn);
      return { ...(await state(ctx)), importId };
    } catch (e) {
      await store.update<Connection>(ctx, 'connections', conn.id, { status: 'needs_attention', error: e instanceof Error ? e.message : 'Sync failed.', updatedAt: now() });
      throw e;
    }
  });

  r.patch('/api/connections/:id/accounts', async (req, res) => {
    const { ctx } = await session(req, res);
    const conn = await owned<Connection>(ctx, 'connections', req.params.id);
    const b = await req.json(z.object({ accountId: z.string().min(1).max(100), included: z.boolean() }));
    const accounts = conn.accounts.map((a) => (a.accountId === b.accountId ? { ...a, included: b.included } : a));
    await store.update<Connection>(ctx, 'connections', conn.id, { accounts, updatedAt: now() });
    for (const t of (await store.list<Transaction>(ctx, 'transactions')).filter((t) => t.accountId === b.accountId))
      await store.update<Transaction>(ctx, 'transactions', t.id, { excluded: !b.included || t.category === 'transfer' });
    for (const s of (await store.list<SavingsAccount>(ctx, 'savings_accounts')).filter((s) => s.connectionAccountId === b.accountId))
      await store.update<SavingsAccount>(ctx, 'savings_accounts', s.id, { excluded: !b.included });
    await recomputeFromTransactions(store, ctx);
    return state(ctx);
  });

  r.del('/api/connections/:id', async (req, res) => {
    const { ctx } = await session(req, res);
    const conn = await owned<Connection>(ctx, 'connections', req.params.id);
    const deleteData = req.query.get('deleteData') === 'true';
    const cipher = await store.getSecret(ctx, conn.id);
    let revoked = false;
    if (cipher) {
      try {
        await removeItem(decrypt(cipher));
        revoked = true;
      } catch {
        /* still delete our copy of the token below */
      }
      await store.deleteSecret(ctx, conn.id);
    }
    await store.update<Connection>(ctx, 'connections', conn.id, { status: 'disconnected', updatedAt: now(), error: null });
    if (deleteData) {
      for (const t of (await store.list<Transaction>(ctx, 'transactions')).filter((t) => t.connectionId === conn.id)) await store.remove(ctx, 'transactions', t.id);
      const accts = new Set(conn.accounts.map((a) => a.accountId));
      for (const s of (await store.list<SavingsAccount>(ctx, 'savings_accounts')).filter((s) => s.connectionAccountId && accts.has(s.connectionAccountId))) await store.remove(ctx, 'savings_accounts', s.id);
      await recomputeFromTransactions(store, ctx);
    }
    await logActivity(store, ctx, `Disconnected ${conn.institutionName ?? 'an account'}${deleteData ? ' and deleted its imported data' : ''}.`);
    return { ...(await state(ctx)), revoked };
  });

  // ───── coach
  r.post('/api/coach', async (req, res) => {
    const { ctx } = await session(req, res);
    limit(`coach:${ctx.userId}`, 40, 60 * 60_000);
    const b = await req.json(
      z.object({
        question: z.string().trim().min(2).max(600),
        scenario: z.object({ type: z.string().max(40), summary: z.string().max(600) }).nullable().optional(),
        history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) })).max(20).optional(),
      }),
    );
    const s = await loadState(store, ctx);
    const metrics = s.settings && s.profile ? computeMetrics({ profile: s.profile, loans: s.loans, income: s.income, expenses: s.expenses, savings: s.savings, goals: s.goals, settings: s.settings }) : null;
    return askCoach(b.question, { metrics, loanCount: s.loans.length, ratesKnown: s.loans.filter((l) => l.interestRate !== null).length, scenario: b.scenario ?? null }, b.history ?? []);
  });

  // ───── account
  r.get('/api/account/export', async (req, res) => {
    const { ctx } = await session(req, res);
    const s = await loadState(store, ctx);
    res.headers['Content-Disposition'] = `attachment; filename="firststep-export-${new Date().toISOString().slice(0, 10)}.json"`;
    return { exportedAt: now(), note: 'Your FirstStep data. Provider access tokens are never included.', ...s };
  });

  r.post('/api/account/delete', async (req, res) => {
    const { ctx, user } = await session(req, res);
    const b = await req.json(z.object({ confirm: z.literal('DELETE', { errorMap: () => ({ message: 'Type DELETE to confirm.' }) }), password: z.string().max(128) }));
    limit(`delete:${ctx.userId}`, 5);
    if (!(await auth.verifyPassword(ctx.userId, user.email, b.password))) throw new HttpError(401, 'Password is incorrect.');
    for (const c of await store.list<Connection>(ctx, 'connections')) {
      const cipher = await store.getSecret(ctx, c.id);
      if (cipher) {
        try {
          await removeItem(decrypt(cipher));
        } catch {
          /* continue deleting */
        }
        await store.deleteSecret(ctx, c.id);
      }
    }
    for (const t of [...USER_TABLES].reverse()) await store.removeAll(ctx, t);
    await auth.deleteUser(ctx.userId);
    for (const c of auth.cookieNames) res.clearCookie(c);
    return { ok: true };
  });

  return r;
}

export const UPLOAD_LIMIT = MAX_FILE_BYTES + 1024;
