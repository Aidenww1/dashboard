# Phase 10 - Money

## Scope

Verified and completed the deployed Money workspace across the locked views:

- Overview
- Accounts
- Cash Flow
- Spending
- Business
- Wealth
- Planning

## Functional recovery

- Accounts, cash flow, and spending use `fin:accounts:v1` and `ing:tx`.
- Wealth uses the canonical `nw:*` balances and `nw:history` snapshots.
- Spending shares `fin:subs` and `fin:budgets` with Finance.
- Business shares `gl:revenue` and `gl:expenses` with GlowLab.
- Planning reads `sav:goals` and computes affordability from actual bank cash and net cash flow.
- Quick Log now validates an amount and writes a dated expense or income to `ing:tx`.
- Missing financial sources produce explicit empty states and links to the owning workflow.

## Visual parity

- Preserved the dense 12-column financial dashboard and real-data charts.
- Changed the seven-section mobile tab strip to a stable wrapped layout.
- Verified no desktop or 390px horizontal page overflow.

## Verification

- `node tests/money-contract.test.js`: 19 passed, 0 failed.
- `node --experimental-websocket tests/browser-money-qa.mjs`: passed.
- All seven views rendered seeded canonical data.
- Quick Log persisted a canonical expense.
- Planning affordability used bank balance and current net cash flow.
- Browser console: no actionable problems.
- Expected local-only noise: missing `favicon.ico`.

## Evidence

- `docs/phase10-screenshots/money-overview-1440x900.png`
- `docs/phase10-screenshots/money-planning-mobile-390x844.png`
