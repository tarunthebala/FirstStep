import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDate, parseMoney, parsePercent, parseStudentAidFile, validateUpload } from '../src/server/studentaid';

const sample = readFileSync(new URL('../fixtures/MyStudentData.sample.txt', import.meta.url), 'utf8');

test('value parsers', () => {
  assert.equal(parseMoney('$1,234.56'), 1234.56);
  assert.equal(parseMoney(''), null);
  assert.equal(parsePercent('6.53%'), 6.53);
  assert.equal(parsePercent('00005.50%'), 5.5);
  assert.equal(parseDate('08/15/2023'), '2023-08-15');
  assert.equal(parseDate('02/30/2023'), null);
  assert.equal(parseDate(''), null);
});

test('parses loans from the official layout', () => {
  const r = parseStudentAidFile(sample);
  assert.equal(r.ok, true);
  assert.equal(r.loans.length, 3);
  assert.equal(r.fileRequestDate, '2026-10-01 09:15:22');
  const [a, b, c] = r.loans;
  assert.equal(a.loanTypeDescription, 'DIRECT STAFFORD SUBSIDIZED');
  assert.equal(a.principal, 3500);
  assert.equal(a.interestRate, 5.5);
  assert.equal(a.disbursements.length, 2);
  assert.equal(b.interestRate, 6.53);
  assert.equal(c.principal, 10000);
  assert.equal(c.interestBalance, 612.4);
  assert.equal(c.status, 'IN SCHOOL OR GRACE PERIOD');
  assert.equal(r.totals.principal, 19500);
});

test('personal fields are not carried into parsed output', () => {
  const r = parseStudentAidFile(sample);
  const json = JSON.stringify(r);
  assert.ok(!json.includes('TESTER'));
  assert.ok(!json.includes('MAPLE LANE'));
  assert.ok(!json.includes('EXAMPLE.COM'));
});

test('missing fields become warnings, not invented values', () => {
  const r = parseStudentAidFile('File Request Date:2026-01-01\nLoan Type Code:D2\nLoan Type Description:DIRECT UNSUB\nLoan Outstanding Principal Balance:\n');
  assert.equal(r.loans.length, 1);
  assert.equal(r.loans[0].principal, null);
  assert.equal(r.loans[0].interestRate, null);
  assert.ok(r.warnings.some((w) => w.field === 'principal'));
  assert.ok(r.warnings.some((w) => w.field === 'interestRate'));
});

test('unrelated text files are rejected', () => {
  const r = parseStudentAidFile('Dear diary,\nToday was fine.\nTotal: 5');
  assert.equal(r.ok, false);
  assert.equal(r.loans.length, 0);
  assert.ok(r.errors[0].includes('does not look like'));
});

test('upload validation', () => {
  assert.match(validateUpload('a.pdf', Buffer.from('x'))!, /\.txt/);
  assert.match(validateUpload('a.txt', Buffer.alloc(0))!, /empty/);
  assert.match(validateUpload('a.txt', Buffer.from([65, 0, 66]))!, /binary/);
  assert.match(validateUpload('a.txt', Buffer.alloc(1_000_001, 65))!, /1 MB/);
  assert.equal(validateUpload('MyStudentData.txt', Buffer.from(sample)), null);
});

test('total mismatch produces a warning', () => {
  const r = parseStudentAidFile('Student Total All Loans Outstanding Principal:$5,000.00\nLoan Type Code:D1\nLoan Outstanding Principal Balance:$1,000.00\nLoan Interest Rate:5%\n');
  assert.ok(r.warnings.some((w) => w.message.includes('does not match')));
});
