/**
 * Parser for the StudentAid.gov "Download My Aid Data" text file (usually saved as MyStudentData.txt).
 *
 * Format reference: Federal Student Aid, "Download My Aid Data File Layout" (FSA Partner Connect, Feb 2023),
 * https://fsapartners.ed.gov/knowledge-center/library/nslds-user-resources/2023-02-16/download-my-aid-data-file-layout
 *  - One `Label:Value` pair per line. Blank values appear as `Label:`.
 *  - Dates mm/dd/ccyy, currency $n,nnn.nn, percent nn.nn%.
 *  - Sections are not delimited; each loan block starts at "Loan Type Code:".
 *
 * Data minimization: student name, address, phone and email fields are read past and never returned or stored.
 * The file is parsed in memory; nothing is written to disk and contents are never logged.
 */
import type { ImportWarning, ParsedLoan } from '../shared/types';

export const MAX_FILE_BYTES = 1_000_000;

export interface ParseResult {
  ok: boolean;
  fileRequestDate: string | null;
  fileSource: string | null;
  loans: ParsedLoan[];
  warnings: ImportWarning[];
  errors: string[];
  totals: { principal: number | null; interest: number | null };
}

const LOAN_FIELDS = new Set([
  'Loan Type Code', 'Loan Type Description', 'Loan Attending School Name', 'Loan Date', 'Loan Repayment Begin Date',
  'Loan Amount', 'Loan Disbursed Amount', 'Loan Outstanding Principal Balance', 'Loan Outstanding Principal Balance as of Date',
  'Loan Outstanding Interest Balance', 'Loan Outstanding Interest Balance as of Date', 'Loan Interest Rate Type Description',
  'Loan Interest Rate', 'Loan Actual Interest Rate', 'Loan Repayment Plan Type Code Description', 'Loan Repayment Plan Type Code',
  'Loan Next Payment Due Date', 'Current Loan Status Description', 'Current Loan Status', 'Loan Status Description',
  'Loan Contact Name', 'Loan Servicer Name', 'Loan Disbursement Date', 'Loan Disbursement Amount',
]);

export function parseMoney(v: string | undefined): number | null {
  if (v === undefined) return null;
  const s = v.trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  const n = Number(s.replace(/[$,()\s-]/g, ''));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

export function parsePercent(v: string | undefined): number | null {
  if (v === undefined) return null;
  const s = v.trim().replace('%', '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
}

export function parseDate(v: string | undefined): string | null {
  if (v === undefined) return null;
  const s = v.trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const [, mm, dd, yyyy] = m;
    const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    return isValidISO(iso) ? iso : null;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m && isValidISO(m[0])) return m[0];
  return null;
}

function isValidISO(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

function blank(): ParsedLoan {
  return {
    loanTypeCode: null, loanTypeDescription: null, schoolName: null, loanDate: null, loanAmount: null, disbursedAmount: null,
    principal: null, principalAsOf: null, interestBalance: null, interestAsOf: null, interestRate: null, rateType: null,
    repaymentPlan: null, repaymentBeginDate: null, nextPaymentDueDate: null, status: null, servicer: null, disbursements: [],
  };
}

/** Basic content checks for an untrusted upload before parsing. */
export function validateUpload(fileName: string, bytes: Buffer): string | null {
  if (!/\.txt$/i.test(fileName)) return 'Only .txt files from StudentAid.gov are supported.';
  if (bytes.length === 0) return 'The file is empty.';
  if (bytes.length > MAX_FILE_BYTES) return 'The file is larger than 1 MB, which is bigger than a StudentAid.gov data file should be.';
  if (bytes.includes(0)) return 'This looks like a binary file, not a text file.';
  const text = bytes.toString('utf8');
  if (text.includes('�')) return 'The file is not valid UTF-8 text.';
  return null;
}

export function parseStudentAidFile(text: string): ParseResult {
  const warnings: ImportWarning[] = [];
  const errors: string[] = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const pairs: [string, string][] = [];
  let unparsed = 0;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const idx = line.indexOf(':');
    if (idx <= 0) {
      unparsed++;
      continue;
    }
    pairs.push([line.slice(0, idx).trim(), line.slice(idx + 1).trim()]);
  }

  const labels = new Set(pairs.map(([k]) => k));
  const looksLikeAidFile = labels.has('File Source') || labels.has('File Request Date') || labels.has('Loan Type Code') || labels.has('Student Total All Loans Outstanding Principal');
  if (!looksLikeAidFile) {
    return {
      ok: false, fileRequestDate: null, fileSource: null, loans: [], warnings, totals: { principal: null, interest: null },
      errors: ['This file does not look like a StudentAid.gov aid data file. It has none of the expected labels (for example "File Request Date:" or "Loan Type Code:").'],
    };
  }

  let fileRequestDate: string | null = null;
  let fileSource: string | null = null;
  let totalPrincipal: number | null = null;
  let totalInterest: number | null = null;
  const loans: ParsedLoan[] = [];
  let cur: ParsedLoan | null = null;
  let pendingDisb: { date: string | null; amount: number | null } | null = null;
  let actualRate: number | null = null;
  let statusCode: string | null = null;
  let planCode: string | null = null;
  let lastStatusDesc: string | null = null;

  const finish = () => {
    if (!cur) return;
    if (pendingDisb) cur.disbursements.push(pendingDisb);
    if (cur.interestRate === null && actualRate !== null) cur.interestRate = actualRate;
    if (cur.status === null) cur.status = lastStatusDesc ?? statusCode;
    if (cur.repaymentPlan === null && planCode) cur.repaymentPlan = planCode;
    loans.push(cur);
    cur = null;
    pendingDisb = null;
    actualRate = null;
    statusCode = null;
    planCode = null;
    lastStatusDesc = null;
  };

  for (const [k, v] of pairs) {
    if (k === 'File Request Date') fileRequestDate = v || null;
    else if (k === 'File Source') fileSource = v || null;
    else if (k === 'Student Total All Loans Outstanding Principal') totalPrincipal = parseMoney(v);
    else if (k === 'Student Total All Loans Outstanding Interest') totalInterest = parseMoney(v);

    if (k === 'Loan Type Code') {
      finish();
      cur = blank();
      cur.loanTypeCode = v || null;
      continue;
    }
    if (k === 'Grant Type Code') {
      finish();
      continue;
    }
    if (!cur) continue;
    const loan: ParsedLoan = cur;
    switch (k) {
      case 'Loan Type Description': loan.loanTypeDescription = v || null; break;
      case 'Loan Attending School Name': loan.schoolName = v || null; break;
      case 'Loan Date': loan.loanDate = parseDate(v); break;
      case 'Loan Repayment Begin Date': loan.repaymentBeginDate = parseDate(v); break;
      case 'Loan Amount': loan.loanAmount = parseMoney(v); break;
      case 'Loan Disbursed Amount': loan.disbursedAmount = parseMoney(v); break;
      case 'Loan Outstanding Principal Balance': loan.principal = parseMoney(v); break;
      case 'Loan Outstanding Principal Balance as of Date': loan.principalAsOf = parseDate(v); break;
      case 'Loan Outstanding Interest Balance': loan.interestBalance = parseMoney(v); break;
      case 'Loan Outstanding Interest Balance as of Date': loan.interestAsOf = parseDate(v); break;
      case 'Loan Interest Rate Type Description': loan.rateType = v || null; break;
      case 'Loan Interest Rate': loan.interestRate = parsePercent(v); break;
      case 'Loan Actual Interest Rate': actualRate = parsePercent(v); break;
      case 'Loan Repayment Plan Type Code Description': loan.repaymentPlan = v || null; break;
      case 'Loan Repayment Plan Type Code': planCode = v || null; break;
      case 'Loan Next Payment Due Date': loan.nextPaymentDueDate = parseDate(v); break;
      case 'Current Loan Status Description': loan.status = v || null; break;
      case 'Current Loan Status': statusCode = v || null; break;
      case 'Loan Status Description': lastStatusDesc = v || lastStatusDesc; break;
      case 'Loan Contact Name':
      case 'Loan Servicer Name': loan.servicer = v || loan.servicer; break;
      case 'Loan Disbursement Date':
        if (pendingDisb) loan.disbursements.push(pendingDisb);
        pendingDisb = { date: parseDate(v), amount: null };
        break;
      case 'Loan Disbursement Amount':
        if (pendingDisb) pendingDisb.amount = parseMoney(v);
        else loan.disbursements.push({ date: null, amount: parseMoney(v) });
        break;
      default:
        if (k.startsWith('Loan ') && !LOAN_FIELDS.has(k)) {
          /* known-but-unused fields (award ID, PSLF counts, etc.) are intentionally ignored */
        }
    }
  }
  finish();

  loans.forEach((l, i) => {
    const name = l.loanTypeDescription ?? `Loan ${i + 1}`;
    if (l.principal === null) warnings.push({ loanIndex: i, field: 'principal', message: `${name}: no outstanding principal in the file.` });
    if (l.interestRate === null) warnings.push({ loanIndex: i, field: 'interestRate', message: `${name}: no interest rate in the file.` });
    if (l.interestBalance === null) warnings.push({ loanIndex: i, field: 'interestBalance', message: `${name}: unpaid interest is not listed, so the total balance may be higher than principal.` });
    if (!l.servicer) warnings.push({ loanIndex: i, field: 'servicer', message: `${name}: the file does not name a servicer. Check your StudentAid.gov account to find it.` });
  });
  if (unparsed > 0) warnings.push({ loanIndex: null, field: null, message: `${unparsed} line(s) were not in Label:Value form and were skipped.` });
  if (loans.length === 0) warnings.push({ loanIndex: null, field: null, message: 'The file has no loan records. If you have federal loans, add them manually or download a fresh file.' });
  const parsedPrincipal = loans.reduce((a, l) => a + (l.principal ?? 0), 0);
  if (totalPrincipal !== null && loans.length && Math.abs(parsedPrincipal - totalPrincipal) > 1) {
    warnings.push({ loanIndex: null, field: null, message: `The file's total principal (${totalPrincipal.toFixed(2)}) does not match the sum of its loan records (${parsedPrincipal.toFixed(2)}). Some loans may be consolidated or paid off.` });
  }

  return { ok: true, fileRequestDate, fileSource, loans, warnings, errors, totals: { principal: totalPrincipal, interest: totalInterest } };
}
