/**
 * Local development driver: one JSON file on disk, written atomically.
 * Suitable for development and demos on a single machine. Use the Supabase driver in production.
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { HttpError } from '../http';
import type { AuthProvider, AuthResult, Ctx, Row, Store, Table } from './types';

interface UserRec {
  id: string;
  email: string;
  salt: string;
  hash: string;
  createdAt: string;
  isDemo: boolean;
}
interface SessionRec {
  tokenHash: string;
  userId: string;
  expiresAt: number;
}
interface ResetRec {
  tokenHash: string;
  userId: string;
  expiresAt: number;
}
interface DB {
  users: UserRec[];
  sessions: SessionRec[];
  resets: ResetRec[];
  secrets: { userId: string; connectionId: string; ciphertext: string }[];
  tables: Partial<Record<Table, Row[]>>;
}

const SESSION_DAYS = 14;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export class LocalDB {
  private db: DB;
  private queue: Promise<void> = Promise.resolve();
  constructor(private file: string) {
    if (existsSync(file)) this.db = JSON.parse(readFileSync(file, 'utf8')) as DB;
    else this.db = { users: [], sessions: [], resets: [], secrets: [], tables: {} };
    this.db.tables ??= {};
    this.db.secrets ??= [];
  }
  get data() {
    return this.db;
  }
  /** Serialized, atomic write. */
  persist(): Promise<void> {
    const write = async () => {
      mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
      const json = JSON.stringify(this.db);
      const tmp = `${this.file}.${process.pid}.tmp`;
      writeFileSync(tmp, json, { mode: 0o600 });
      // Windows (especially OneDrive-synced folders) can briefly lock the target file, making rename fail
      // with EPERM/EBUSY/EACCES. Retry a few times, then fall back to writing the file directly.
      for (let attempt = 0; ; attempt++) {
        try {
          renameSync(tmp, this.file);
          break;
        } catch (e) {
          const code = (e as NodeJS.ErrnoException).code;
          if (!['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '')) throw e;
          if (attempt >= 5) {
            writeFileSync(this.file, json, { mode: 0o600 });
            try {
              rmSync(tmp, { force: true });
            } catch {
              /* best effort */
            }
            break;
          }
          await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
        }
      }
      try {
        chmodSync(this.file, 0o600);
      } catch {
        /* best effort */
      }
    };
    const run = this.queue.then(write);
    // Never let one failed write poison every later write.
    this.queue = run.catch((e) => console.error('[local store] Could not save data:', e instanceof Error ? e.message : e));
    return run;
  }
  rows(table: Table): Row[] {
    return (this.db.tables[table] ??= []);
  }
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class LocalStore implements Store {
  constructor(private ldb: LocalDB) {}
  async list<T extends Row>(ctx: Ctx, table: Table): Promise<T[]> {
    return clone(this.ldb.rows(table).filter((r) => r.userId === ctx.userId)) as T[];
  }
  async get<T extends Row>(ctx: Ctx, table: Table, id: string): Promise<T | null> {
    const r = this.ldb.rows(table).find((r) => r.id === id && r.userId === ctx.userId);
    return r ? (clone(r) as T) : null;
  }
  async insert<T extends Row>(ctx: Ctx, table: Table, row: T): Promise<T> {
    if (row.userId !== ctx.userId) throw new HttpError(403, 'Cannot write another user’s data.');
    const rows = this.ldb.rows(table);
    if (rows.some((r) => r.id === row.id)) throw new HttpError(409, 'Duplicate record.');
    rows.push(clone(row));
    await this.ldb.persist();
    return clone(row);
  }
  async update<T extends Row>(ctx: Ctx, table: Table, id: string, patch: Partial<T>): Promise<T | null> {
    const r = this.ldb.rows(table).find((r) => r.id === id && r.userId === ctx.userId);
    if (!r) return null;
    const { id: _i, userId: _u, ...rest } = patch as Row & Record<string, unknown>;
    Object.assign(r, clone(rest));
    await this.ldb.persist();
    return clone(r) as T;
  }
  async remove(ctx: Ctx, table: Table, id: string): Promise<boolean> {
    const rows = this.ldb.rows(table);
    const i = rows.findIndex((r) => r.id === id && r.userId === ctx.userId);
    if (i < 0) return false;
    rows.splice(i, 1);
    await this.ldb.persist();
    return true;
  }
  async removeAll(ctx: Ctx, table: Table): Promise<void> {
    const rows = this.ldb.rows(table);
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i].userId === ctx.userId) rows.splice(i, 1);
    await this.ldb.persist();
  }
  async putSecret(ctx: Ctx, connectionId: string, ciphertext: string) {
    const s = this.ldb.data.secrets;
    const existing = s.find((x) => x.userId === ctx.userId && x.connectionId === connectionId);
    if (existing) existing.ciphertext = ciphertext;
    else s.push({ userId: ctx.userId, connectionId, ciphertext });
    await this.ldb.persist();
  }
  async getSecret(ctx: Ctx, connectionId: string) {
    return this.ldb.data.secrets.find((x) => x.userId === ctx.userId && x.connectionId === connectionId)?.ciphertext ?? null;
  }
  async deleteSecret(ctx: Ctx, connectionId: string) {
    const s = this.ldb.data.secrets;
    const i = s.findIndex((x) => x.userId === ctx.userId && x.connectionId === connectionId);
    if (i >= 0) s.splice(i, 1);
    await this.ldb.persist();
  }
}

function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return { salt, hash };
}

export class LocalAuth implements AuthProvider {
  cookieNames = ['fs_session'];
  constructor(private ldb: LocalDB) {}

  private issue(user: UserRec): AuthResult {
    const token = randomBytes(32).toString('base64url');
    const db = this.ldb.data;
    const now = Date.now();
    db.sessions = db.sessions.filter((s) => s.expiresAt > now);
    db.sessions.push({ tokenHash: sha(token), userId: user.id, expiresAt: now + SESSION_DAYS * 86400000 });
    void this.ldb.persist();
    return { user: { userId: user.id, email: user.email }, cookies: { fs_session: token } };
  }

  async signUp(email: string, password: string) {
    const db = this.ldb.data;
    const norm = email.trim().toLowerCase();
    if (db.users.some((u) => u.email === norm)) throw new HttpError(409, 'An account with this email already exists. Try logging in instead.');
    const { salt, hash } = hashPassword(password);
    const user: UserRec = { id: randomUUID(), email: norm, salt, hash, createdAt: new Date().toISOString(), isDemo: false };
    db.users.push(user);
    await this.ldb.persist();
    // The local driver has no email provider, so there is no verification step.
    return { result: this.issue(user), needsVerification: false };
  }

  async signIn(email: string, password: string) {
    const user = this.ldb.data.users.find((u) => u.email === email.trim().toLowerCase());
    // Always run scrypt to keep timing similar whether or not the account exists.
    const { hash } = hashPassword(password, user?.salt ?? 'x'.repeat(32));
    if (!user || !timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'))) throw new HttpError(401, 'That email and password don’t match an account.');
    return this.issue(user);
  }

  async fromCookies(cookies: Record<string, string>) {
    const t = cookies.fs_session;
    if (!t) return null;
    const s = this.ldb.data.sessions.find((x) => x.tokenHash === sha(t));
    if (!s || s.expiresAt < Date.now()) return null;
    const u = this.ldb.data.users.find((x) => x.id === s.userId);
    return u ? { user: { userId: u.id, email: u.email } } : null;
  }

  async signOut(cookies: Record<string, string>) {
    const t = cookies.fs_session;
    if (!t) return;
    this.ldb.data.sessions = this.ldb.data.sessions.filter((s) => s.tokenHash !== sha(t));
    await this.ldb.persist();
  }

  async requestPasswordReset(email: string, redirectTo: string) {
    const user = this.ldb.data.users.find((u) => u.email === email.trim().toLowerCase());
    if (!user || user.isDemo) return; // same response whether or not the account exists
    const token = randomBytes(32).toString('base64url');
    this.ldb.data.resets.push({ tokenHash: sha(token), userId: user.id, expiresAt: Date.now() + 3600_000 });
    await this.ldb.persist();
    // No email provider in the local driver. Print the link for the developer running the server.
    // eslint-disable-next-line no-console
    console.info(`[local auth] Password reset link (development only, valid 1 hour): ${redirectTo}?token=${token}`);
  }

  async resetPassword(token: string, newPassword: string) {
    const db = this.ldb.data;
    const r = db.resets.find((x) => x.tokenHash === sha(token) && x.expiresAt > Date.now());
    if (!r) throw new HttpError(400, 'This reset link is invalid or has expired. Request a new one.');
    const user = db.users.find((u) => u.id === r.userId);
    if (!user) throw new HttpError(400, 'Account not found.');
    Object.assign(user, hashPassword(newPassword));
    db.resets = db.resets.filter((x) => x !== r);
    db.sessions = db.sessions.filter((s) => s.userId !== user.id); // sign out everywhere
    await this.ldb.persist();
  }

  async verifyPassword(userId: string, _email: string, password: string) {
    const user = this.ldb.data.users.find((u) => u.id === userId);
    if (!user) return false;
    if (user.isDemo) return true;
    const { hash } = hashPassword(password, user.salt);
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
  }

  async deleteUser(userId: string) {
    const db = this.ldb.data;
    db.users = db.users.filter((u) => u.id !== userId);
    db.sessions = db.sessions.filter((s) => s.userId !== userId);
    db.resets = db.resets.filter((s) => s.userId !== userId);
    db.secrets = db.secrets.filter((s) => s.userId !== userId);
    await this.ldb.persist();
  }

  async createDemoUser() {
    // Demo accounts are throwaway: remove ones older than a day so a public demo doesn't grow the data file forever.
    const db = this.ldb.data;
    const cutoff = Date.now() - 86400000;
    const stale = new Set(db.users.filter((u) => u.isDemo && new Date(u.createdAt).getTime() < cutoff).map((u) => u.id));
    if (stale.size) {
      db.users = db.users.filter((u) => !stale.has(u.id));
      db.sessions = db.sessions.filter((s) => !stale.has(s.userId));
      db.secrets = db.secrets.filter((s) => !stale.has(s.userId));
      for (const k of Object.keys(db.tables) as Table[]) db.tables[k] = (db.tables[k] ?? []).filter((r) => !stale.has(r.userId));
    }
    const id = randomUUID();
    const user: UserRec = { id, email: `demo-${id.slice(0, 8)}@demo.firststep.local`, ...hashPassword(randomBytes(24).toString('hex')), createdAt: new Date().toISOString(), isDemo: true };
    this.ldb.data.users.push(user);
    await this.ldb.persist();
    return this.issue(user);
  }
}
