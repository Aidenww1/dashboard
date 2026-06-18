// Regression tests for the bank-CSV import parser in finance.html.
// This is a money path with many bank dialects (EU/US numbers, split or signed
// amount columns, half a dozen date formats), so it needs coverage. The parser
// is already pure ("Pure parser: text -> {error}|{iban,transactions}. No DOM,
// no writes." -- finance.html), so rather than risk the live import path by
// extracting it, we read its source block straight out of finance.html and run
// it in an isolated function scope. If those functions move or change name,
// this test fails loudly (which is the point).
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'finance.html'), 'utf8');
const start = html.indexOf('function ingParseCsvLine');
const end = html.indexOf('function ingParseAndStage');
if (start < 0 || end < 0 || end <= start) {
  console.error('FAIL: could not locate the ingParse* block in finance.html (renamed/moved?)');
  process.exit(1);
}
const src = html.slice(start, end);
// eslint-disable-next-line no-new-func -- first-party source, test-only.
const P = new Function(src + '\nreturn { ingParseTxns, ingParseDate, ingParseAmount, ingParseCsvLine, ingDetectDelim };')();

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; return; }
  fail++;
  console.error('FAIL: ' + msg + '\n  expected ' + e + '\n  got      ' + a);
}
function ok(cond, msg) { eq(!!cond, true, msg); }

// --- ingParseAmount: EU vs US number formats, negatives ---
eq(P.ingParseAmount('1.234,56'), 1234.56, 'amount EU thousands+decimal');
eq(P.ingParseAmount('1,234.56'), 1234.56, 'amount US thousands+decimal');
eq(P.ingParseAmount('1234,56'), 1234.56, 'amount EU decimal only');
eq(P.ingParseAmount('1234.56'), 1234.56, 'amount US decimal only');
eq(P.ingParseAmount('€ 50,00'), 50, 'amount with currency symbol');
eq(P.ingParseAmount('(50.00)'), -50, 'amount parentheses negative');
eq(P.ingParseAmount('-12,50'), -12.5, 'amount leading minus EU');
ok(Number.isNaN(P.ingParseAmount('')), 'empty amount -> NaN');

// --- ingParseDate: the documented formats, European DD/MM default ---
eq(P.ingParseDate('20260617'), '2026-06-17', 'date YYYYMMDD');
eq(P.ingParseDate('2026-06-17'), '2026-06-17', 'date ISO');
eq(P.ingParseDate('17-06-2026'), '2026-06-17', 'date DD-MM-YYYY (European default)');
eq(P.ingParseDate('06/17/2026'), '2026-06-17', 'date MM/DD when first field > 12 -> swap');
eq(P.ingParseDate('17.06.26'), '2026-06-17', 'date DD.MM.YY two-digit year');
eq(P.ingParseDate('garbage'), '', 'unparseable date -> empty');

// --- ingDetectDelim ---
eq(P.ingDetectDelim('a;b;c;d'), ';', 'detect semicolon');
eq(P.ingDetectDelim('a,b,c'), ',', 'detect comma');

// --- ingParseTxns: empty / malformed inputs return a friendly error, not a throw ---
ok(P.ingParseTxns('').error, 'empty file -> error');
ok(P.ingParseTxns('just one line').error, 'single line -> error');
ok(P.ingParseTxns('foo;bar\n1;2').error, 'no date/amount columns -> error');

// --- ingParseTxns: ING-style EU semicolon CSV (Af/Bij direction column) ---
const ing = [
  'Datum;Naam;Rekening;Af Bij;Bedrag (EUR);Omschrijving',
  '20260615;Albert Heijn;NL00INGB0001;Af;23,45;Groceries',
  '20260616;Salary BV;NL00INGB0001;Bij;2.500,00;June salary',
].join('\n');
const r1 = P.ingParseTxns(ing);
ok(!r1.error, 'ING CSV parses without error');
eq(r1.transactions.length, 2, 'ING CSV -> 2 transactions');
eq(r1.iban, 'NL00INGB0001', 'ING CSV picks up IBAN');
// sorted newest-first
eq(r1.transactions[0].date, '2026-06-16', 'ING newest-first sort');
eq(r1.transactions[0].amount, 2500, 'Bij (credit) is positive');
eq(r1.transactions[1].amount, -23.45, 'Af (debit) is negative');

// --- ingParseTxns: US comma CSV with a single signed Amount column ---
const us = [
  'Date,Description,Amount',
  '06/15/2026,Coffee,-4.50',
  '06/16/2026,Refund,12.00',
].join('\n');
const r2 = P.ingParseTxns(us);
ok(!r2.error, 'US CSV parses without error');
eq(r2.transactions.length, 2, 'US CSV -> 2 transactions');
eq(r2.transactions.find(t => t.description === 'Coffee').amount, -4.5, 'US signed negative kept');

// --- ingParseTxns: split Debit/Credit columns ---
const split = [
  'Date;Name;Debit;Credit',
  '2026-06-15;Rent;1200,00;',
  '2026-06-16;Interest;;3,21',
].join('\n');
const r3 = P.ingParseTxns(split);
ok(!r3.error, 'split debit/credit parses');
eq(r3.transactions.find(t => t.description === 'Rent').amount, -1200, 'Debit column -> negative');
eq(r3.transactions.find(t => t.description === 'Interest').amount, 3.21, 'Credit column -> positive');

console.log('finance-parse.test.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
