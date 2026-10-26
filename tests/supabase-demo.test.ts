/**
 * Supabase demo accounts, tested against an in-memory stand-in for Supabase Auth (no network, no real project).
 * Checks: credentials are random per account and never reused, only old demo accounts are cleaned up,
 * and the demo address pattern can't be claimed by a real sign-up.
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { SupabaseAuth, isDemoEmail } from '../src/server/store/supabase';

// Every key and password in this file is random per run; nothing here is a real or reusable credential.
const rnd = () => randomBytes(18).toString('base64url');
const KEYS = { anon: rnd(), service: rnd() };

const URL_ = 'https://project.supabase.test';
type U = { id: string; email: string; password: string; created_at: string; user_metadata: Record<string, unknown> };
let users: U[] = [];
let deleted: string[] = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  users = [];
  deleted = [];
  let n = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.pathname === '/auth/v1/admin/users' && method === 'POST') {
      const rec = { id: `u${++n}`, email: body.email, password: body.password, created_at: new Date().toISOString(), user_metadata: body.user_metadata ?? {} };
      users.push(rec);
      return json(200, rec);
    }
    if (u.pathname === '/auth/v1/admin/users' && method === 'GET') return json(200, { users });
    if (u.pathname.startsWith('/auth/v1/admin/users/') && method === 'DELETE') {
      const id = u.pathname.split('/').pop()!;
      deleted.push(id);
      users = users.filter((x) => x.id !== id);
      return json(200, {});
    }
    if (u.pathname === '/auth/v1/token') {
      const rec = users.find((x) => x.email === body.email && x.password === body.password);
      return rec ? json(200, { access_token: `at-${rec.id}`, refresh_token: `rt-${rec.id}`, user: { id: rec.id, email: rec.email } }) : json(400, { error_description: 'Invalid login credentials' });
    }
    return json(404, { message: 'not found' });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const auth = () => new SupabaseAuth({ url: URL_, anonKey: KEYS.anon, serviceRoleKey: KEYS.service });

test('each demo account gets its own random email and password, and is signed in', async () => {
  const a = await auth().createDemoUser();
  const b = await auth().createDemoUser();
  assert.ok(isDemoEmail(a.user.email) && isDemoEmail(b.user.email));
  assert.notEqual(a.user.email, b.user.email);
  assert.notEqual(users[0].password, users[1].password);
  assert.ok(users[0].password.length >= 40, 'password is long and random');
  assert.equal(a.cookies.fs_at, `at-${a.user.userId}`);
  assert.equal(users[0].user_metadata.firststep_demo, true);
});

test('cleanup removes only demo accounts older than a day', async () => {
  const old = new Date(Date.now() - 2 * 86400_000).toISOString();
  users.push({ id: 'old-demo', email: 'firststep-demo-' + 'a'.repeat(32) + '@example.com', password: rnd(), created_at: old, user_metadata: { firststep_demo: true } });
  users.push({ id: 'old-real', email: 'student@school.edu', password: rnd(), created_at: old, user_metadata: {} });
  users.push({ id: 'fake-flag', email: 'student2@school.edu', password: rnd(), created_at: old, user_metadata: { firststep_demo: true } });
  await auth().createDemoUser();
  assert.deepEqual(deleted, ['old-demo']);
  assert.ok(users.some((u) => u.id === 'old-real') && users.some((u) => u.id === 'fake-flag'));
});

test('a real sign-up cannot use the demo address pattern', async () => {
  await assert.rejects(auth().signUp('firststep-demo-' + 'b'.repeat(32) + '@example.com', rnd(), 'http://x'), /own email/);
});

test('demo accounts can be deleted without a password; real accounts still need theirs', async () => {
  const a = auth();
  assert.equal(await a.verifyPassword('u1', 'firststep-demo-' + 'c'.repeat(32) + '@example.com', ''), true);
  assert.equal(await a.verifyPassword('u2', 'student@school.edu', rnd()), false);
});

test('demo mode refuses to run without the server-only service key', async () => {
  await assert.rejects(new SupabaseAuth({ url: URL_, anonKey: KEYS.anon }).createDemoUser(), /SUPABASE_SERVICE_ROLE_KEY/);
});
