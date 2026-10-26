import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { prefersReducedMotion, Spring, SPRING } from './spring';
import type { HabitLog } from '../../shared/readiness';
import type {
  Activity, Engagement, BudgetSettings, Connection, ExpenseCategory, FinancialSummary, IncomeSource, LearningProgress, Loan, LoanImport,
  Notification, NotificationPrefs, Onboarding, Plan, Profile, SavingsAccount, SavingsGoal, Scenario, Task, Transaction,
} from '../../shared/types';

export interface Integrations {
  plaid: boolean;
  plaidEnv: string;
  loanServicer: boolean;
  email: boolean;
  demo: boolean;
  driver: string;
}
export interface AppState {
  profile: Profile;
  onboarding: Onboarding;
  loans: Loan[];
  imports: LoanImport[];
  income: IncomeSource[];
  expenses: ExpenseCategory[];
  savings: SavingsAccount[];
  goals: SavingsGoal[];
  settings: BudgetSettings;
  transactions: Transaction[];
  connections: Connection[];
  summary: FinancialSummary | null;
  summaryHistory: { id: string; confirmedAt: string }[];
  plan: Plan | null;
  planHistory: { id: string; generatedAt: string; status: string }[];
  tasks: Task[];
  scenarios: Scenario[];
  learning: LearningProgress[];
  notifications: Notification[];
  prefs: NotificationPrefs;
  activity: Activity[];
  habits: HabitLog[];
  engagement: Engagement | null;
  integrations: Integrations;
}

interface Session {
  status: 'loading' | 'anon' | 'authed';
  user: { id: string; email: string } | null;
  next: string | null;
  integrations: Integrations | null;
  data: AppState | null;
  refreshSession: () => Promise<{ next: string | null }>;
  reload: () => Promise<void>;
  /** Run a mutation that returns full state; replaces local state with the server's. */
  mutate: <T extends Partial<AppState> & Record<string, any>>(method: string, path: string, body?: unknown) => Promise<T>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Session['status']>('loading');
  const [user, setUser] = useState<Session['user']>(null);
  const [next, setNext] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  const [data, setData] = useState<AppState | null>(null);

  const reload = useCallback(async () => {
    const s = await api<AppState>('GET', '/api/state');
    setData(s);
    setIntegrations(s.integrations);
  }, []);

  const refreshSession = useCallback(async () => {
    const me = await api<{ user: Session['user']; next?: string; integrations: Integrations }>('GET', '/api/auth/me');
    setIntegrations(me.integrations);
    if (!me.user) {
      setUser(null);
      setData(null);
      setStatus('anon');
      return { next: null };
    }
    setUser(me.user);
    setNext(me.next ?? null);
    await reload();
    setStatus('authed');
    return { next: me.next ?? null };
  }, [reload]);

  useEffect(() => {
    refreshSession().catch(() => setStatus('anon'));
  }, [refreshSession]);

  const mutate = useCallback(async (method: string, path: string, body?: unknown) => {
    try {
      const res = await api<any>(method, path, body);
      if (res && res.profile && res.onboarding) setData(res as AppState);
      return res;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setStatus('anon');
        setUser(null);
        setData(null);
      }
      throw e;
    }
  }, []);

  const signOut = useCallback(async () => {
    await api('POST', '/api/auth/logout').catch(() => undefined);
    setUser(null);
    setData(null);
    setStatus('anon');
  }, []);

  const value = useMemo(() => ({ status, user, next, integrations, data, refreshSession, reload, mutate, signOut }), [status, user, next, integrations, data, refreshSession, reload, mutate, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const c = useContext(Ctx);
  if (!c) throw new Error('SessionProvider missing');
  return c;
}

/** For authenticated screens: state is guaranteed loaded by the route guard. */
export function useApp() {
  const s = useSession();
  return { ...s, data: s.data as AppState };
}

// ───── toasts: rise from the bottom on a spring and leave along the same path
type Toast = { id: number; text: string; kind: 'info' | 'error'; leaving: boolean };
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => undefined);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, text, kind, leaving: false }]);
    setTimeout(() => setItems((x) => x.map((t) => (t.id === id ? { ...t, leaving: true } : t))), kind === 'error' ? 7000 : 3500);
  }, []);
  const remove = useCallback((id: number) => setItems((x) => x.filter((t) => t.id !== id)), []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {items.map((t) => <ToastItem key={t.id} t={t} onGone={remove} />)}
      </div>
    </ToastCtx.Provider>
  );
}
function ToastItem({ t, onGone }: { t: Toast; onGone: (id: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const spring = useRef<Spring | null>(null);
  useEffect(() => {
    const apply = (p: number) => {
      if (!el.current) return;
      el.current.style.opacity = String(Math.max(0, Math.min(1, p)));
      el.current.style.transform = prefersReducedMotion() ? '' : `translate3d(0, ${(1 - p) * 24}px, 0) scale(${0.96 + 0.04 * p})`;
    };
    spring.current = new Spring(0, apply);
    spring.current.set(0);
    spring.current.to(1, SPRING.default);
    return () => spring.current?.stop();
  }, []);
  useEffect(() => {
    if (t.leaving) spring.current?.to(0, SPRING.default, { onRest: () => onGone(t.id) });
  }, [t.leaving, t.id, onGone]);
  return (
    <div ref={el} className={`toast ${t.kind === 'error' ? 'error' : ''}`} style={{ opacity: 0 }} onClick={() => spring.current?.to(0, SPRING.default, { onRest: () => onGone(t.id) })}>
      {t.text}
    </div>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Wrap an async action: shows errors as toasts and returns a pending flag. */
export function useAction() {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, okMessage?: string): Promise<T | undefined> => {
      setPending(true);
      setError(null);
      try {
        const r = await fn();
        if (okMessage) toast(okMessage);
        return r;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Something went wrong.';
        setError(msg);
        toast(msg, 'error');
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [toast],
  );
  return { run, pending, error, setError };
}

/** Debounce saves per field so fast typing sends one request per pause, in order. */
export function useKeyedDebounce(ms = 450) {
  const timers = useRef(new Map<string, number>());
  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);
  return useCallback((key: string, fn: () => void) => {
    const m = timers.current;
    clearTimeout(m.get(key));
    m.set(key, window.setTimeout(() => (m.delete(key), fn()), ms));
  }, [ms]);
}
