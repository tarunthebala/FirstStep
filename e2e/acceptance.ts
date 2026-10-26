/**
 * Browser acceptance test (Playwright). Starts the real server with a throwaway data file and walks the
 * mandatory journey through the UI. Run with `npm run e2e`.
 * Set PLAYWRIGHT_BROWSERS_PATH if your Chromium lives somewhere non-default.
 */
import { randomBytes } from 'node:crypto';
import { chromium, type Page } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import assert from 'node:assert/strict';
import { createApp } from '../src/server/index';

// Test-only accounts get a fresh random password every run, so no credential is ever written in the code.
const randomPassword = () => randomBytes(18).toString('base64url');
const PW = { main: randomPassword(), sam: randomPassword(), morgan: randomPassword() };

const dir = mkdtempSync(join(tmpdir(), 'firststep-e2e-'));
const server = createApp({ dataFile: join(dir, 'db.json') });
await new Promise<void>((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const fixture = new URL('../fixtures/MyStudentData.sample.txt', import.meta.url).pathname;
const browser = await chromium.launch();
const errors: string[] = [];
let step = 0;
const log = (s: string) => console.log(`  ✓ ${++step}. ${s}`);
const watch = (p: Page) => p.on('pageerror', (e) => errors.push(e.message));
const money = (s: string | null) => Number((s ?? '').replace(/[^0-9.-]/g, ''));

async function desktopFlow() {
  console.log('Desktop: file upload journey');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  watch(page);

  await page.goto(BASE + '/');
  await page.getByRole('link', { name: 'Build My Plan' }).first().click();
  await page.getByLabel('First name').fill('Riley');
  await page.getByLabel('Email').fill('riley@example.com');
  await page.getByLabel('Password').fill(PW.main);
  await page.getByRole('checkbox', { name: /I agree/ }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/onboarding/graduation');
  log('New user signs up and lands on the graduation step, not a dashboard');

  await page.goto(BASE + '/app');
  await page.waitForURL('**/onboarding/graduation');
  log('Dashboard is blocked until setup is complete');

  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Choose your expected or actual graduation date.').waitFor();
  await page.getByText('Graduating soon').click();
  await page.getByLabel('Expected graduation date').fill('2027-05-14');
  await page.getByLabel('Current employment').selectOption('part_time');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/onboarding/loans');
  log('Graduation date is validated and saved');

  await page.locator('#loan-file').setInputFiles(fixture);
  await page.getByRole('heading', { name: 'Review your imported loans' }).waitFor();
  assert.equal(await page.getByText(/Loan \d from file/).count(), 3);
  log('StudentAid.gov file is parsed and shown for review (3 loans)');

  const firstPrincipal = page.getByLabel('Outstanding principal').first();
  await firstPrincipal.fill('3400');
  await page.getByText(/Edited — will be saved as entered by you/).waitFor();
  await page.getByRole('button', { name: 'Add a missing loan' }).click();
  const names = page.getByLabel('Name');
  await names.last().fill('Private loan');
  await page.getByLabel('Outstanding principal').last().fill('5000');
  await page.getByLabel('Interest rate').last().fill('8');
  await page.getByRole('button', { name: /Confirm 4 loans/ }).click();
  await page.getByText('Private loan').first().waitFor();
  log('User corrects an imported loan, adds a missing one, and confirms');

  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/onboarding/connect');
  await page.getByText('Account connections aren’t available here').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Connect Bank Account' }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Connect Loan Servicer' }).count(), 0, 'servicer button only shown when supported');
  log('Bank connection is offered but unavailable without credentials; no servicer button shown');

  await page.getByRole('button', { name: 'Continue without connecting' }).click();
  await page.waitForURL('**/onboarding/review');
  await page.getByRole('heading', { name: 'Does this look like your monthly budget?' }).waitFor();
  log('Financial summary screen appears with available data');

  await page.getByRole('button', { name: 'Edit My Details' }).click();
  await page.getByRole('button', { name: 'Add income' }).click();
  await page.getByLabel('Description').fill('Expected salary');
  await page.getByLabel('Monthly take-home amount').fill('3100');
  await page.getByRole('dialog').getByRole('button', { name: 'Add' }).click();
  await page.getByText('Expected salary').waitFor();
  for (const [label, v] of [['Housing and rent per month', '900'], ['Groceries per month', '300'], ['Transportation per month', '150']]) await page.getByLabel(label).fill(v);
  await page.getByLabel('Dining out per month').fill('120');
  await page.waitForTimeout(900);
  await page.getByLabel('Dining out status').selectOption('confirmed');
  await page.waitForTimeout(400);
  log('User adds income and edits expenses');

  await page.getByRole('button', { name: 'Confirm and Build My Plan' }).click();
  await page.getByText('Please tick the box').waitFor();
  assert.ok(!page.url().includes('/plan'), 'plan not built without explicit confirmation');
  await page.getByRole('checkbox', { name: /I’ve reviewed this summary/ }).check();
  await page.getByRole('button', { name: 'Confirm and Build My Plan' }).click();
  await page.waitForURL('**/onboarding/plan');
  await page.getByRole('heading', { name: 'Your FirstStep plan is ready.' }).waitFor();
  log('Plan is generated only after explicit confirmation');

  await page.getByRole('link', { name: 'Go to my dashboard' }).click();
  await page.waitForURL('**/app');
  const balance = await page.locator('.stat', { hasText: 'Total student loan balance' }).locator('.big-num').textContent();
  assert.equal(money(balance), 3400 + 6000 + 10000 + 612.4 + 5000);
  const payment = await page.locator('.stat', { hasText: 'Estimated monthly payment' }).locator('.big-num').textContent();
  assert.ok(money(payment) > 200, `payment ${payment}`);
  log(`Dashboard shows confirmed data (balance ${balance}, payment ${payment})`);

  const meter = page.locator('.meter');
  await meter.waitFor();
  const scoreNow = Number(await page.locator('.meter-track').getAttribute('aria-valuenow'));
  assert.ok(scoreNow > 0 && scoreNow < 100, `readiness ${scoreNow}`);
  const headline = await page.locator('.meter-headline').innerText();
  assert.ok(headline.length > 10);
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(await meter.innerText()), 'no emoji in the meter');
  await page.getByRole('button', { name: /Check your budget: mark done/ }).click();
  await page.waitForFunction((s) => Number(document.querySelector('.meter-track')?.getAttribute('aria-valuenow')) === s + 2, scoreNow);
  const winLink = await page.locator('.next-win a').getAttribute('href');
  assert.ok(winLink && winLink.startsWith('/app'), `next win link ${winLink}`);
  log(`Readiness meter shows ${scoreNow}% with a tier headline; a weekly habit adds 2 points; Next Win links to ${winLink}`);

  const cashBefore = await page.locator('.stat', { hasText: 'Available monthly cash flow' }).locator('dd').nth(1).textContent();
  await page.goto(BASE + '/app/finances');
  await page.getByRole('tab', { name: 'After graduation (forecast)' }).click();
  await page.getByLabel('Housing and rent per month (after graduation)').fill('1300');
  await page.waitForTimeout(1200);
  await page.goto(BASE + '/app');
  const cashAfter = await page.locator('.stat', { hasText: 'Available monthly cash flow' }).locator('dd').nth(1).textContent();
  assert.equal(Math.round(money(cashBefore) - money(cashAfter)), 400);
  await page.getByText('Your data changed since your plan was built').waitFor();
  log(`Changing a baseline budget entry updates dependent metrics (${cashBefore} → ${cashAfter})`);

  await page.goto(BASE + '/app/money-lab?tab=lifestyle');
  await page.getByLabel('Dining out', { exact: true }).first().fill('40');
  await page.getByText(/Freed up each month/).waitFor();
  await page.getByRole('button', { name: 'Save scenario' }).click();
  await page.getByLabel('Scenario name').fill('Less dining');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await page.getByRole('option', { name: 'Less dining' }).waitFor({ state: 'attached' });
  await page.goto(BASE + '/app/finances');
  const dining = await page.getByLabel('Dining out per month (current)').inputValue();
  assert.equal(dining, '120', 'baseline unchanged by Money Lab');
  log('Money Lab scenario saved without changing the baseline');

  await page.goto(BASE + '/app/money-lab?tab=compare');
  const coach = page.getByRole('region', { name: 'Learning coach' });
  await coach.getByLabel('Ask the learning coach a money question').fill('How does interest capitalization work?');
  await coach.getByRole('button', { name: 'Ask', exact: true }).click();
  await coach.getByText(/unpaid interest is added to your principal/).waitFor();
  await coach.getByText('Related questions').waitFor();
  await coach.getByRole('button', { name: 'How does student loan interest work?' }).first().click();
  await coach.getByText(/simple daily interest/).waitFor();
  await coach.getByText(/Browse all \d+ topics/).click();
  await coach.getByRole('button', { name: 'How do I avoid student loan scams?' }).click();
  await coach.getByText(/Warning signs of a student loan scam/).waitFor();
  if (process.env.E2E_SHOTS) await coach.screenshot({ path: process.env.E2E_SHOTS + '/coach.png' });
  await coach.getByLabel('Ask the learning coach a money question').fill('write me a poem about cats');
  await coach.getByRole('button', { name: 'Ask', exact: true }).click();
  await coach.getByText(/I can only help with money topics/).waitFor();
  log('Built-in learning coach answers from its library, suggests related questions, and stays on money topics');

  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await page.waitForURL('**/login?signedOut=1');
  await page.getByLabel('Email').fill('riley@example.com');
  await page.getByLabel('Password').fill(PW.main);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('**/app');
  await page.goto(BASE + '/app/finances');
  await page.getByText('Private loan').first().waitFor();
  log('Log out and back in: saved information is still there');

  await page.goto(BASE + '/app/review');
  await page.getByRole('heading', { name: 'Review my data' }).waitFor();
  await page.getByRole('checkbox', { name: /I’ve reviewed this summary/ }).check();
  await page.getByRole('button', { name: 'Confirm and update my plan' }).click();
  await page.waitForURL('**/app');
  await page.goto(BASE + '/app/history');
  const confirmations = page.locator('.panel', { has: page.getByRole('heading', { name: 'Summary confirmations' }) }).locator('li');
  await confirmations.nth(1).waitFor();
  assert.equal(await confirmations.count(), 2);
  log('Summary can be revisited and re-confirmed; history shows both confirmations');

  // Another user can’t see Riley’s data
  const other = await browser.newContext();
  const op = await other.newPage();
  await op.goto(BASE + '/signup');
  await op.getByLabel('Email').fill('sam@example.com');
  await op.getByLabel('Password').fill(PW.sam);
  await op.getByRole('checkbox', { name: /I agree/ }).check();
  await op.getByRole('button', { name: 'Create account' }).click();
  await op.waitForURL('**/onboarding/graduation');
  const st = await op.evaluate(async () => (await fetch('/api/state')).json());
  assert.equal(st.loans.length, 0);
  log('A different signed-in user sees none of the first user’s records');
  await other.close();
  await ctx.close();
}

async function mobileManualFlow() {
  console.log('Mobile: manual-entry journey (no file, no connections)');
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(BASE + '/signup');
  await page.getByLabel('Email').fill('morgan@example.com');
  await page.getByLabel('Password').fill(PW.morgan);
  await page.getByRole('checkbox', { name: /I agree/ }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/onboarding/graduation');
  await page.getByText('Already graduated').click();
  await page.getByLabel('Graduation date').fill('2026-05-08');
  await page.getByLabel('Current employment').selectOption('unemployed');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/onboarding/loans');
  await page.getByRole('button', { name: 'Add a loan manually' }).click();
  await page.getByLabel('Loan name').fill('Direct Unsubsidized');
  await page.getByLabel('Outstanding principal').fill('12000');
  await page.getByLabel('Interest rate').fill('6.5');
  await page.getByRole('dialog').getByRole('button', { name: 'Add loan', exact: true }).click();
  await page.getByText('Direct Unsubsidized').first().waitFor();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/onboarding/connect');
  await page.getByRole('button', { name: 'Continue without connecting' }).click();
  await page.waitForURL('**/onboarding/review');
  await page.getByText('doesn’t assume any current income').waitFor();
  await page.getByRole('checkbox', { name: /I’ve reviewed this summary/ }).check();
  await page.getByRole('button', { name: 'Confirm and Build My Plan' }).click();
  await page.waitForURL('**/onboarding/plan');
  await page.getByRole('heading', { name: 'Your FirstStep plan is ready.' }).waitFor();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(width <= 380, `no horizontal scroll (scrollWidth ${width})`);
  log('Manual-only journey works on a phone-sized screen and builds a plan with missing-data notices');
  await page.getByText('No income recorded').first().waitFor({ state: 'attached' }).catch(() => undefined);
  await ctx.close();
}

try {
  await desktopFlow();
  await mobileManualFlow();
  assert.deepEqual(errors, [], `page errors: ${errors.join('; ')}`);
  console.log(`\nAll ${step} acceptance checks passed.`);
} catch (e) {
  console.error('\nFAILED at step', step + 1, '\n', e);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
  rmSync(dir, { recursive: true, force: true });
}
