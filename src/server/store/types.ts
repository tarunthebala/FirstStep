/**
 * Storage abstraction. Every call is scoped by the caller's context (userId from a verified session,
 * plus the user's access token for Supabase). Drivers must never return rows owned by another user.
 * Route handlers only ever get `userId` from the session — never from the request body or URL.
 */
export const USER_TABLES = [
  'profiles',
  'onboarding',
  'loan_imports',
  'loans',
  'income_sources',
  'expense_categories',
  'savings_accounts',
  'savings_goals',
  'budget_settings',
  'transactions',
  'connections',
  'financial_summaries',
  'plans',
  'tasks',
  'scenarios',
  'learning_progress',
  'notifications',
  'notification_prefs',
  'activity',
  'habit_logs',
  'engagement',
] as const;
export type Table = (typeof USER_TABLES)[number];

/** Tables with exactly one row per user, keyed by id = userId. */
export const SINGLETON_TABLES: Table[] = ['profiles', 'onboarding', 'budget_settings', 'notification_prefs', 'engagement'];

export interface Ctx {
  userId: string;
  token?: string;
}

export interface Row {
  id: string;
  userId: string;
}

export interface Store {
  list<T extends Row>(ctx: Ctx, table: Table): Promise<T[]>;
  get<T extends Row>(ctx: Ctx, table: Table, id: string): Promise<T | null>;
  insert<T extends Row>(ctx: Ctx, table: Table, row: T): Promise<T>;
  update<T extends Row>(ctx: Ctx, table: Table, id: string, patch: Partial<T>): Promise<T | null>;
  remove(ctx: Ctx, table: Table, id: string): Promise<boolean>;
  removeAll(ctx: Ctx, table: Table): Promise<void>;
  /** Provider access tokens. Server-only; never exposed through list/get. */
  putSecret(ctx: Ctx, connectionId: string, ciphertext: string): Promise<void>;
  getSecret(ctx: Ctx, connectionId: string): Promise<string | null>;
  deleteSecret(ctx: Ctx, connectionId: string): Promise<void>;
}

export interface SessionUser {
  userId: string;
  email: string;
  token?: string;
}

export interface AuthResult {
  user: SessionUser;
  /** Cookie values to set; drivers decide what goes in them. */
  cookies: Record<string, string>;
}

export interface AuthProvider {
  signUp(email: string, password: string, redirectTo: string): Promise<{ result: AuthResult | null; needsVerification: boolean }>;
  signIn(email: string, password: string): Promise<AuthResult>;
  fromCookies(cookies: Record<string, string>): Promise<{ user: SessionUser; refreshed?: Record<string, string> } | null>;
  signOut(cookies: Record<string, string>): Promise<void>;
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  resetPassword(tokenOrCookies: string, newPassword: string): Promise<void>;
  verifyPassword(userId: string, email: string, password: string): Promise<boolean>;
  deleteUser(userId: string): Promise<void>;
  /** Throwaway demo accounts with fictional data. Both drivers generate random credentials per account. */
  createDemoUser?(): Promise<AuthResult>;
  cookieNames: string[];
}
