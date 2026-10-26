/**
 * Supabase driver (production). Talks to Supabase Auth (GoTrue) and the Data API (PostgREST) over fetch,
 * so no SDK is required.
 *
 * Every data request is sent with the signed-in user's JWT, so Postgres Row Level Security
 * (supabase/migrations/0001_schema.sql) enforces ownership in the database, and the driver also
 * filters by user_id explicitly. The service-role key is used only for (a) the connection_secrets
 * table, which has RLS enabled and no policies, and (b) deleting an auth user during account deletion.
 *
 * NOTE: this driver was written against Supabase's documented REST endpoints but could not be run
 * against a live project in the build environment. Test it against your project before relying on it.
 */
import { randomBytes } from 'node:crypto';
import { HttpError } from '../http';
import type { AuthProvider, AuthResult, Ctx, Row, Store, Table } from './types';

const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (s: string) => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
function toDb(row: Record<string, unknown>) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) o[snake(k)] = v;
  return o;
}
function fromDb<T>(row: Record<string, unknown>): T {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) o[camel(k)] = v;
  return o as T;
}

export interface SupabaseCfg {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
}

async function call(url: string, init: RequestInit & { headers: Record<string, string> }) {
  const res = await fetch(url, init);
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (body && (body.msg || body.message || body.error_description || body.error)) || `Request failed (${res.status})`;
    throw new HttpError(res.status === 401 || res.status === 403 ? res.status : 502, String(msg));
  }
  return body;
}

export class SupabaseStore implements Store {
  constructor(private cfg: SupabaseCfg) {}
  private headers(ctx: Ctx) {
    if (!ctx.token) throw new HttpError(401, 'Not signed in.');
    return { apikey: this.cfg.anonKey, Authorization: `Bearer ${ctx.token}`, 'Content-Type': 'application/json' };
  }
  private u(table: string, q: string) {
    return `${this.cfg.url}/rest/v1/${table}?${q}`;
  }
  async list<T extends Row>(ctx: Ctx, table: Table) {
    const rows = await call(this.u(table, `user_id=eq.${ctx.userId}&select=*`), { headers: this.headers(ctx) });
    return (rows as Record<string, unknown>[]).map((r) => fromDb<T>(r));
  }
  async get<T extends Row>(ctx: Ctx, table: Table, id: string) {
    const rows = await call(this.u(table, `id=eq.${encodeURIComponent(id)}&user_id=eq.${ctx.userId}&select=*`), { headers: this.headers(ctx) });
    return rows?.[0] ? fromDb<T>(rows[0]) : null;
  }
  async insert<T extends Row>(ctx: Ctx, table: Table, row: T) {
    if (row.userId !== ctx.userId) throw new HttpError(403, 'Cannot write another user’s data.');
    const rows = await call(this.u(table, 'select=*'), { method: 'POST', headers: { ...this.headers(ctx), Prefer: 'return=representation' }, body: JSON.stringify(toDb(row as unknown as Record<string, unknown>)) });
    return fromDb<T>(rows[0]);
  }
  async update<T extends Row>(ctx: Ctx, table: Table, id: string, patch: Partial<T>) {
    const { id: _i, userId: _u, ...rest } = patch as Row & Record<string, unknown>;
    const rows = await call(this.u(table, `id=eq.${encodeURIComponent(id)}&user_id=eq.${ctx.userId}&select=*`), {
      method: 'PATCH',
      headers: { ...this.headers(ctx), Prefer: 'return=representation' },
      body: JSON.stringify(toDb(rest)),
    });
    return rows?.[0] ? fromDb<T>(rows[0]) : null;
  }
  async remove(ctx: Ctx, table: Table, id: string) {
    const rows = await call(this.u(table, `id=eq.${encodeURIComponent(id)}&user_id=eq.${ctx.userId}`), { method: 'DELETE', headers: { ...this.headers(ctx), Prefer: 'return=representation' } });
    return Array.isArray(rows) && rows.length > 0;
  }
  async removeAll(ctx: Ctx, table: Table) {
    await call(this.u(table, `user_id=eq.${ctx.userId}`), { method: 'DELETE', headers: this.headers(ctx) });
  }
  private service() {
    if (!this.cfg.serviceRoleKey) throw new HttpError(503, 'SUPABASE_SERVICE_ROLE_KEY is required to store connection credentials.');
    return { apikey: this.cfg.serviceRoleKey, Authorization: `Bearer ${this.cfg.serviceRoleKey}`, 'Content-Type': 'application/json' };
  }
  async putSecret(ctx: Ctx, connectionId: string, ciphertext: string) {
    await call(this.u('connection_secrets', 'on_conflict=connection_id'), {
      method: 'POST',
      headers: { ...this.service(), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ connection_id: connectionId, user_id: ctx.userId, ciphertext }),
    });
  }
  async getSecret(ctx: Ctx, connectionId: string) {
    const rows = await call(this.u('connection_secrets', `connection_id=eq.${connectionId}&user_id=eq.${ctx.userId}&select=ciphertext`), { headers: this.service() });
    return rows?.[0]?.ciphertext ?? null;
  }
  async deleteSecret(ctx: Ctx, connectionId: string) {
    await call(this.u('connection_secrets', `connection_id=eq.${connectionId}&user_id=eq.${ctx.userId}`), { method: 'DELETE', headers: this.service() });
  }
}

/**
 * Demo accounts: each one gets a random address on the reserved example.com domain and a random password
 * that is generated for that account only, used once to sign in, and never stored, logged or shown.
 * No demo credentials exist in code or configuration.
 */
const DEMO_EMAIL = /^firststep-demo-[a-f0-9]{32}@example\.com$/;
export const isDemoEmail = (email: string) => DEMO_EMAIL.test(email.trim().toLowerCase());
const DEMO_MAX_AGE_MS = 24 * 3600_000;

export class SupabaseAuth implements AuthProvider {
  cookieNames = ['fs_at', 'fs_rt'];
  constructor(private cfg: SupabaseCfg) {}
  private h(extra: Record<string, string> = {}) {
    return { apikey: this.cfg.anonKey, 'Content-Type': 'application/json', ...extra };
  }
  private admin() {
    if (!this.cfg.serviceRoleKey) throw new HttpError(503, 'Demo mode needs SUPABASE_SERVICE_ROLE_KEY on the server.');
    return { apikey: this.cfg.serviceRoleKey, Authorization: `Bearer ${this.cfg.serviceRoleKey}`, 'Content-Type': 'application/json' };
  }

  /** Creates a throwaway demo account and signs it in. Older demo accounts are cleaned up first. */
  async createDemoUser() {
    const headers = this.admin();
    await this.pruneDemoUsers().catch(() => undefined); // cleanup is best-effort; never block the demo
    const email = `firststep-demo-${randomBytes(16).toString('hex')}@example.com`;
    const password = randomBytes(32).toString('base64url');
    await call(`${this.cfg.url}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { firststep_demo: true } }),
    });
    const body = await call(`${this.cfg.url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: this.h(), body: JSON.stringify({ email, password }) });
    return this.toResult(body);
  }

  /** Deletes demo accounts older than a day. Their rows go with them (every table cascades on auth.users). */
  private async pruneDemoUsers() {
    const headers = this.admin();
    const cutoff = Date.now() - DEMO_MAX_AGE_MS;
    for (let page = 1; page <= 10; page++) {
      const body = await call(`${this.cfg.url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers });
      const users: { id: string; email?: string; created_at?: string; user_metadata?: Record<string, unknown> }[] = body?.users ?? [];
      for (const u of users) {
        const demo = u.user_metadata?.firststep_demo === true && !!u.email && isDemoEmail(u.email);
        if (demo && u.created_at && new Date(u.created_at).getTime() < cutoff) {
          await call(`${this.cfg.url}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers });
        }
      }
      if (users.length < 200) break;
    }
  }
  private toResult(s: { access_token: string; refresh_token: string; user: { id: string; email: string } }): AuthResult {
    return { user: { userId: s.user.id, email: s.user.email, token: s.access_token }, cookies: { fs_at: s.access_token, fs_rt: s.refresh_token } };
  }
  async signUp(email: string, password: string, redirectTo: string) {
    // The demo address pattern is reserved so a real account can never be mistaken for (or cleaned up as) a demo.
    if (isDemoEmail(email)) throw new HttpError(422, 'Please use your own email address.');
    const body = await call(`${this.cfg.url}/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo)}`, { method: 'POST', headers: this.h(), body: JSON.stringify({ email, password }) });
    if (body?.access_token) return { result: this.toResult(body), needsVerification: false };
    return { result: null, needsVerification: true };
  }
  async signIn(email: string, password: string) {
    try {
      const body = await call(`${this.cfg.url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: this.h(), body: JSON.stringify({ email, password }) });
      return this.toResult(body);
    } catch (e) {
      if (e instanceof HttpError && /confirm/i.test(e.message)) throw new HttpError(401, 'Please confirm your email address first, then log in.');
      throw new HttpError(401, 'That email and password don’t match an account.');
    }
  }
  async fromCookies(cookies: Record<string, string>) {
    const at = cookies.fs_at;
    if (at) {
      try {
        const u = await call(`${this.cfg.url}/auth/v1/user`, { headers: this.h({ Authorization: `Bearer ${at}` }) });
        return { user: { userId: u.id, email: u.email, token: at } };
      } catch {
        /* fall through to refresh */
      }
    }
    if (cookies.fs_rt) {
      try {
        const s = await call(`${this.cfg.url}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: this.h(), body: JSON.stringify({ refresh_token: cookies.fs_rt }) });
        const r = this.toResult(s);
        return { user: r.user, refreshed: r.cookies };
      } catch {
        return null;
      }
    }
    return null;
  }
  async signOut(cookies: Record<string, string>) {
    if (!cookies.fs_at) return;
    try {
      await call(`${this.cfg.url}/auth/v1/logout`, { method: 'POST', headers: this.h({ Authorization: `Bearer ${cookies.fs_at}` }) });
    } catch {
      /* cookie is cleared regardless */
    }
  }
  async requestPasswordReset(email: string, redirectTo: string) {
    if (isDemoEmail(email)) return; // demo accounts have no inbox; same response as any other address
    try {
      await call(`${this.cfg.url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, { method: 'POST', headers: this.h(), body: JSON.stringify({ email }) });
    } catch {
      /* same response whether or not the account exists */
    }
  }
  /** `token` is the recovery access token Supabase puts in the reset link. */
  async resetPassword(token: string, newPassword: string) {
    await call(`${this.cfg.url}/auth/v1/user`, { method: 'PUT', headers: this.h({ Authorization: `Bearer ${token}` }), body: JSON.stringify({ password: newPassword }) });
  }
  async verifyPassword(_userId: string, email: string, password: string) {
    // Nobody knows a demo account's password (it is random and discarded), so the signed-in demo
    // session itself is the proof for deleting that throwaway account. This matches the local driver.
    if (isDemoEmail(email)) return true;
    try {
      await this.signIn(email, password);
      return true;
    } catch {
      return false;
    }
  }
  async deleteUser(userId: string) {
    if (!this.cfg.serviceRoleKey) throw new HttpError(503, 'Account deletion needs SUPABASE_SERVICE_ROLE_KEY on the server.');
    await call(`${this.cfg.url}/auth/v1/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { apikey: this.cfg.serviceRoleKey, Authorization: `Bearer ${this.cfg.serviceRoleKey}`, 'Content-Type': 'application/json' },
    });
  }
}
