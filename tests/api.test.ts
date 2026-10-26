/**
 * Backend acceptance tests: runs the real HTTP server (local driver, temp data file) and walks the
 * mandatory onboarding journey, data-integrity rules and cross-user authorization.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/server/index';

// Test-only accounts get a fresh random password every run, so no credential is ever written in the code.
const randomPassword = () => randomBytes(18).toString('base64url');
const PW = { alice: randomPassword(), bob: randomPassword(), mallory: randomPassword(), fresh: randomPassword(), wrong: randomPassword() };

let server: Server;
let base = '';
const dir = mkdtempSync(join(tmpdir(), 'firststep-test-'));
const sample = readFileSync(new URL('../fixtures/MyStudentData.sample.txt', import.meta.url));

class Client {
  cookie = '';
  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { 'x-firststep': '1', ...headers };
    if (this.cookie) h.cookie = this.cookie;
    let payload: BodyInit | undefined;
    if (body instanceof Buffer) payload = body;
    else if (body !== undefined) {
      h['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(base + path, { method, headers: h, body: payload });
    const set = res.headers.getSetCookie();
    for (const c of set) {
      const [pair] = c.split(';');
      const [name] = pair.split('=');
      const rest = this.cookie.split('; ').filter((x) => x && !x.startsWith(name + '='));
      if (!c.includes('Max-Age=0')) rest.push(pair);
      this.cookie = rest.join('; ');
    }
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  }
}

before(async () => {
  server = createApp({ dataFile: join(dir, 'db.json') });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

const alice = new Client();
const mallory = new Client();
let aliceLoanId = '';

test('1. sign up starts onboarding, not the dashboard', async () => {
  const r = await alice.call('POST', '/api/auth/signup', { email: 'alice@example.com', password: PW.alice, displayName: 'Alice' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.next, '/onboarding/graduation');
  const me = await alice.call('GET', '/api/auth/me');
  assert.equal(me.json.next, '/onboarding/graduation');
});

test('CSRF header is required for mutations', async () => {
  const res = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { cookie: alice.cookie } });
  assert.equal(res.status, 403);
});

test('plan cannot be generated before the summary is confirmed', async () => {
  const r = await alice.call('POST', '/api/plan/generate');
  assert.equal(r.status, 409);
});

test('2. graduation date is validated and saved', async () => {
  const bad = await alice.call('POST', '/api/onboarding/graduation', { graduationStatus: 'soon', employmentStatus: 'student' });
  assert.equal(bad.status, 422);
  const contradictory = await alice.call('POST', '/api/onboarding/graduation', { graduationDate: '2099-05-01', graduationStatus: 'graduated', employmentStatus: 'student' });
  assert.equal(contradictory.status, 422);
  const ok = await alice.call('POST', '/api/onboarding/graduation', { graduationDate: '2027-05-15', graduationStatus: 'soon', employmentStatus: 'part_time', school: 'Fictional State' });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(ok.json.profile.graduationDate, '2027-05-15');
  assert.equal(ok.json.onboarding.steps.graduation, 'completed');
  assert.equal(ok.json.onboarding.steps.loans, 'in_progress');
});

test('loan step cannot be completed with no loans', async () => {
  const r = await alice.call('POST', '/api/onboarding/step', { step: 'loans', action: 'continue' });
  assert.equal(r.status, 422);
});

test('bad uploads are rejected and recorded', async () => {
  const r = await alice.call('POST', '/api/imports', Buffer.from('hello world, not a loan file'), { 'content-type': 'text/plain', 'x-file-name': 'notes.txt' });
  assert.equal(r.status, 422);
  const pdf = await alice.call('POST', '/api/imports', Buffer.from('%PDF'), { 'content-type': 'text/plain', 'x-file-name': 'loans.pdf' });
  assert.equal(pdf.status, 422);
});

let importId = '';
test('3–4. a valid StudentAid.gov file is parsed for review, nothing saved yet', async () => {
  const r = await alice.call('POST', '/api/imports', sample, { 'content-type': 'text/plain', 'x-file-name': 'MyStudentData.txt' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  importId = r.json.import.id;
  assert.equal(r.json.import.raw.length, 3);
  const st = await alice.call('GET', '/api/state');
  assert.equal(st.json.loans.length, 0, 'loans are not saved before the user confirms the import');
});

test('5. user corrects one imported loan, adds one manually, confirms', async () => {
  const st = await alice.call('GET', '/api/state');
  const raw = st.json.imports.find((i: { id: string }) => i.id === importId).raw;
  const drafts = raw.map((l: { loanTypeDescription: string; principal: number; interestBalance: number; interestRate: number }, i: number) => ({
    name: l.loanTypeDescription, principal: i === 0 ? 3400 : l.principal, interestBalance: l.interestBalance, interestRate: l.interestRate, category: 'federal', rawIndex: i, edited: i === 0,
  }));
  drafts.push({ name: 'Private loan', principal: 5000, interestRate: 8, category: 'private', rawIndex: null, edited: false });
  const r = await alice.call('POST', `/api/imports/${importId}/confirm`, { loans: drafts });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.loans.length, 4);
  const sources = r.json.loans.map((l: { source: string }) => l.source).sort();
  assert.deepEqual(sources, ['imported', 'imported', 'manual', 'manual']);
  aliceLoanId = r.json.loans[0].id;
  const again = await alice.call('POST', `/api/imports/${importId}/confirm`, { loans: [] });
  assert.equal(again.status, 409, 'an import can only be confirmed once');
  const cont = await alice.call('POST', '/api/onboarding/step', { step: 'loans', action: 'continue' });
  assert.equal(cont.json.onboarding.steps.loans, 'completed');
});

test('6–7. bank connection without Plaid credentials is unavailable, skip works', async () => {
  const st = await alice.call('GET', '/api/state');
  assert.equal(st.json.integrations.plaid, false);
  assert.equal(st.json.integrations.loanServicer, false);
  const lt = await alice.call('POST', '/api/plaid/link-token', { kind: 'bank' });
  assert.equal(lt.status, 503);
  const cont = await alice.call('POST', '/api/onboarding/step', { step: 'connections', action: 'continue' });
  assert.equal(cont.status, 422, 'cannot mark connected when nothing is connected');
  const skip = await alice.call('POST', '/api/onboarding/step', { step: 'connections', action: 'skip' });
  assert.equal(skip.json.onboarding.steps.connections, 'skipped');
});

test('8–9. manual income/expenses and an expense edit', async () => {
  await alice.call('POST', '/api/income', { label: 'Expected job', kind: 'expected', monthlyAmount: 3200, status: 'estimated' });
  await alice.call('POST', '/api/income', { label: 'Campus job', kind: 'current', monthlyAmount: 800, status: 'variable' });
  for (const [key, amt] of [['housing', 600], ['groceries', 250], ['transportation', 100]] as const) await alice.call('PUT', '/api/expenses', { key, scope: 'current', monthlyAmount: amt });
  const r = await alice.call('PUT', '/api/expenses', { key: 'dining', scope: 'current', monthlyAmount: 150, status: 'confirmed' });
  const dining = r.json.expenses.find((e: { key: string; scope: string }) => e.key === 'dining' && e.scope === 'current');
  assert.equal(dining.monthlyAmount, 150);
  assert.equal(dining.status, 'confirmed');
  assert.equal(r.json.plan, null, 'no plan exists yet');
});

test('10–12. confirming the summary saves it and generates the plan', async () => {
  const noAck = await alice.call('POST', '/api/summary/confirm', { studentLoanPaymentInExpenses: false });
  assert.equal(noAck.status, 422);
  const r = await alice.call('POST', '/api/summary/confirm', { studentLoanPaymentInExpenses: false, reviewed: true });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.planError, null);
  assert.ok(r.json.summary.confirmedAt);
  assert.equal(r.json.summary.snapshot.currentExpenses, 1100);
  assert.ok(r.json.plan);
  assert.equal(r.json.plan.summaryId, r.json.summary.id);
  assert.ok(r.json.plan.metrics.estimatedMonthlyPayment > 0);
  assert.equal(r.json.onboarding.steps.plan, 'completed');
  assert.ok(r.json.onboarding.completedAt);
  assert.ok(r.json.tasks.length > 3);
  assert.ok(r.json.tasks.some((t: { key: string; priority: string }) => t.key === 'confirm_first_payment' && t.priority === 'high'));
});

test('14. changing the baseline is saved and keeps the confirmed summary untouched', async () => {
  const before = (await alice.call('GET', '/api/state')).json;
  const r = await alice.call('PUT', '/api/expenses', { key: 'housing', scope: 'current', monthlyAmount: 700 });
  assert.equal(r.json.expenses.find((e: { key: string; scope: string }) => e.key === 'housing' && e.scope === 'current').monthlyAmount, 700);
  assert.equal(r.json.summary.snapshot.currentExpenses, before.summary.snapshot.currentExpenses, 'summary snapshot is a record of what was confirmed');
});

test('15. Money Lab scenarios are stored apart from the baseline', async () => {
  const before = (await alice.call('GET', '/api/state')).json;
  const r = await alice.call('POST', '/api/scenarios', { name: 'Cut dining', type: 'lifestyle', inputs: { adjusted: { dining: 50 } } });
  assert.equal(r.status, 200);
  assert.equal(r.json.scenarios.length, 1);
  assert.deepEqual(r.json.expenses, before.expenses, 'baseline expenses unchanged by saving a scenario');
  const dup = await alice.call('POST', `/api/scenarios/${r.json.saved}/duplicate`);
  assert.equal(dup.json.scenarios.length, 2);
  const ren = await alice.call('PATCH', `/api/scenarios/${dup.json.saved}`, { name: 'Renamed' });
  assert.ok(ren.json.scenarios.some((s: { name: string }) => s.name === 'Renamed'));
});

test('editing an imported value marks it manual; user can mark verified', async () => {
  const st = (await alice.call('GET', '/api/state')).json;
  const imported = st.loans.find((l: { source: string }) => l.source === 'imported');
  const r = await alice.call('PATCH', `/api/loans/${imported.id}`, { interestRate: 6.0 });
  assert.equal(r.json.loans.find((l: { id: string }) => l.id === imported.id).source, 'manual');
  const v = await alice.call('PATCH', `/api/loans/${imported.id}`, { source: 'verified', firstPaymentDate: '2027-12-01' });
  const loan = v.json.loans.find((l: { id: string }) => l.id === imported.id);
  assert.equal(loan.source, 'verified');
  assert.equal(loan.firstPaymentDateStatus, 'user_entered');
});

test('16. log out and back in: data persists and lands on the app', async () => {
  await alice.call('POST', '/api/auth/logout');
  const me = await alice.call('GET', '/api/auth/me');
  assert.equal(me.json.user, null);
  const denied = await alice.call('GET', '/api/state');
  assert.equal(denied.status, 401);
  const bad = await alice.call('POST', '/api/auth/login', { email: 'alice@example.com', password: PW.wrong });
  assert.equal(bad.status, 401);
  const r = await alice.call('POST', '/api/auth/login', { email: 'alice@example.com', password: PW.alice });
  assert.equal(r.json.next, '/app');
  const st = (await alice.call('GET', '/api/state')).json;
  assert.equal(st.loans.length, 4);
  assert.equal(st.scenarios.length, 2);
});

test('17. the summary can be revisited and re-confirmed, regenerating the plan', async () => {
  const first = (await alice.call('GET', '/api/state')).json.summary;
  const r = await alice.call('POST', '/api/summary/confirm', { studentLoanPaymentInExpenses: false, reviewed: true });
  assert.notEqual(r.json.summary.id, first.id);
  assert.equal(r.json.summaryHistory.length, 2);
  assert.equal(r.json.summary.snapshot.currentExpenses, 1200);
});

test('incomplete onboarding resumes at the right step after login', async () => {
  const bob = new Client();
  await bob.call('POST', '/api/auth/signup', { email: 'bob@example.com', password: PW.bob });
  await bob.call('POST', '/api/onboarding/graduation', { graduationDate: '2026-05-01', graduationStatus: 'graduated', employmentStatus: 'unemployed' });
  await bob.call('POST', '/api/auth/logout');
  const r = await bob.call('POST', '/api/auth/login', { email: 'bob@example.com', password: PW.bob });
  assert.equal(r.json.next, '/onboarding/loans');
});

test('18. another user cannot read or change Alice’s records', async () => {
  await mallory.call('POST', '/api/auth/signup', { email: 'mallory@example.com', password: PW.mallory });
  const st = (await mallory.call('GET', '/api/state')).json;
  assert.equal(st.loans.length, 0);
  assert.equal(st.scenarios.length, 0);
  const edit = await mallory.call('PATCH', `/api/loans/${aliceLoanId}`, { principal: 1 });
  assert.equal(edit.status, 404);
  const del = await mallory.call('DELETE', `/api/loans/${aliceLoanId}`);
  assert.equal(del.status, 404);
  const confirm = await mallory.call('POST', `/api/imports/${importId}/confirm`, { loans: [] });
  assert.equal(confirm.status, 404);
  const aliceState = (await alice.call('GET', '/api/state')).json;
  assert.ok(aliceState.loans.some((l: { id: string; principal: number }) => l.id === aliceLoanId && l.principal !== 1));
});

test('learning progress and task completion persist', async () => {
  const st = (await alice.call('GET', '/api/state')).json;
  const task = st.tasks.find((t: { status: string }) => t.status === 'open');
  const r = await alice.call('PATCH', `/api/tasks/${task.id}`, { status: 'done' });
  assert.equal(r.json.tasks.find((t: { id: string }) => t.id === task.id).status, 'done');
  const l = await alice.call('PUT', '/api/learning/understanding-interest', { completed: true, quizCorrect: true });
  assert.equal(l.json.learning[0].completed, true);
  const unknown = await alice.call('PUT', '/api/learning/not-a-module', { completed: true });
  assert.equal(unknown.status, 404);
});

test('built-in coach answers without an AI key', async () => {
  const r = await alice.call('POST', '/api/coach', { question: 'What is capitalization?' });
  assert.equal(r.json.source, 'built_in');
  assert.match(r.json.answer, /Capitalization/);
});

test('demo mode creates a separate, clearly fictional account', async () => {
  const demo = new Client();
  const r = await demo.call('POST', '/api/demo/start');
  assert.equal(r.json.next, '/app');
  const st = (await demo.call('GET', '/api/state')).json;
  assert.equal(st.profile.isDemo, true);
  assert.ok(st.loans.every((l: { source: string }) => l.source === 'demo'));
  assert.ok(st.plan);
  assert.ok(!st.income.some((i: { source: string }) => i.source === 'connected'), 'demo data is never labeled as connected');
});

test('export and account deletion', async () => {
  const ex = await mallory.call('GET', '/api/account/export');
  assert.ok(ex.json.exportedAt);
  const wrong = await mallory.call('POST', '/api/account/delete', { confirm: 'DELETE', password: PW.wrong });
  assert.equal(wrong.status, 401);
  const ok = await mallory.call('POST', '/api/account/delete', { confirm: 'DELETE', password: PW.mallory });
  assert.equal(ok.status, 200);
  const after = await mallory.call('GET', '/api/state');
  assert.equal(after.status, 401);
  const relog = await mallory.call('POST', '/api/auth/login', { email: 'mallory@example.com', password: PW.mallory });
  assert.equal(relog.status, 401);
});

// ───── readiness meter: habits & milestones
const localToday = () => new Date().toISOString().slice(0, 10);

test('weekly habits: one completion per habit per week, undo works, persisted', async () => {
  const today = localToday();
  let r = await alice.call('PUT', '/api/habits/check_budget', { done: true, today });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  r = await alice.call('PUT', '/api/habits/check_budget', { done: true, today });
  assert.equal(r.json.habits.filter((h: { habitKey: string }) => h.habitKey === 'check_budget').length, 1, 'duplicate check-off ignored');
  r = await alice.call('PUT', '/api/habits/check_budget', { done: false, today });
  assert.equal(r.json.habits.length, 0);
  await alice.call('PUT', '/api/habits/check_budget', { done: true, today });
  await alice.call('PUT', '/api/habits/review_spending', { done: true, today });
  await alice.call('POST', '/api/auth/logout');
  await alice.call('POST', '/api/auth/login', { email: 'alice@example.com', password: PW.alice });
  const st = (await alice.call('GET', '/api/state')).json;
  assert.equal(st.habits.length, 2, 'habits survive logout/login');
});

test('habits are validated: unknown keys, bad dates, and not-yet-applicable habits are rejected', async () => {
  assert.equal((await alice.call('PUT', '/api/habits/eat_vegetables', { done: true, today: localToday() })).status, 404);
  assert.equal((await alice.call('PUT', '/api/habits/check_budget', { done: true, today: '2020-01-01' })).status, 422);
  const fresh = new Client();
  await fresh.call('POST', '/api/auth/signup', { email: 'fresh@example.com', password: PW.fresh });
  assert.equal((await fresh.call('PUT', '/api/habits/review_loans', { done: true, today: localToday() })).status, 409);
  assert.equal((await fresh.call('PUT', '/api/habits/check_repayment', { done: true, today: localToday() })).status, 409);
  assert.equal((await fresh.call('PUT', '/api/habits/check_budget', { done: true, today: localToday() })).status, 200);
  assert.equal((await alice.call('GET', '/api/state')).json.habits.length, 2, 'another user’s habits never show up');
});

test('milestones are verified against the server-side score and never go down', async () => {
  const st = (await alice.call('GET', '/api/state')).json;
  assert.equal(st.engagement.celebratedMilestone, 0);
  const r = await alice.call('POST', '/api/engagement/celebrate', { milestone: 100 });
  assert.ok(r.json.score < 100, `alice score ${r.json.score}`);
  const recorded = r.json.engagement.celebratedMilestone;
  assert.ok(recorded <= r.json.score, 'cannot record a milestone above the real score');
  assert.ok([0, 25, 50, 75].includes(recorded));
  const again = await alice.call('POST', '/api/engagement/celebrate', { milestone: 25 });
  assert.equal(again.json.engagement.celebratedMilestone, recorded, 'never decreases');
  assert.equal((await alice.call('POST', '/api/engagement/celebrate', { milestone: 33 })).status, 422);
});

test('visits: repeated loads in one visit keep the previous-visit marker; dismissals persist', async () => {
  const a = (await alice.call('POST', '/api/engagement/seen')).json.engagement;
  const b = (await alice.call('POST', '/api/engagement/seen')).json.engagement;
  assert.ok(b.lastSeenAt >= a.lastSeenAt);
  assert.equal(b.previousSeenAt, a.previousSeenAt, 'a reload is not a new visit');
  const d = await alice.call('POST', '/api/engagement/dismiss', { key: 'habits3:2026-10-19' });
  await alice.call('POST', '/api/engagement/dismiss', { key: 'habits3:2026-10-19' });
  assert.deepEqual((await alice.call('GET', '/api/state')).json.engagement.dismissed, ['habits3:2026-10-19']);
  assert.equal(d.status, 200);
});
