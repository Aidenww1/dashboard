# Phase 16 Report: Security And Release Gate

Status: **IMPLEMENTATION AUDIT COMPLETE. PRODUCTION RELEASE BLOCKED.**

## Gate Decision

Do not deploy the security cutover yet. Authentication is still optional, RLS is not enabled, several browser clients still use the publishable Supabase key directly, and the production environment does not have `OWNER_UID` or `PUSH_REQUIRE_AUTH`. Enabling RLS now would lock out current clients; deploying the current API surface without RLS leaves sensitive service-role routes exposed.

The required atomic sequence is documented in `docs/PHASE16-CUTOVER-CHECKLIST.md`. No database policy, production environment variable, deployment, or credential was changed during this phase.

## Findings

### Critical: owner data is not yet protected by an enforced identity boundary

The staged single-owner migration covers the canonical Supabase tables, but it has not been applied and redesigned clients do not yet propagate an authenticated session to every REST and realtime call. This is the primary release blocker.

The migration was corrected to work in the Supabase SQL editor: psql-only `\\set` substitution was removed and a zero-UUID sentinel now aborts before any schema or data change unless the owner UUID is replaced.

### High: service-role API routes need owner authorization

`api/health/read/[type].js`, `api/health-ai/agent.js`, `api/events/add.js`, `api/life-context.js`, and paid AI parsing routes can read data, write data, or consume model budget without a mandatory owner session. Cron authorization is conditional on `CRON_SECRET`; health ingest intentionally remains open while `HEALTH_INGEST_TOKEN` is unset; push mutation remains open while `PUSH_REQUIRE_AUTH` is unset. These gates must become fail-closed in the coordinated cutover.

### Medium: backup confidentiality depends on the missing access boundary

Downloaded JSON backups are plaintext by design and should be treated as sensitive files. Cloud snapshots live in `app_state`, so their confidentiality currently depends on the same unfinished Auth/RLS boundary. Restore integrity was hardened in this phase with a 10 MB limit, plain-object validation, pre-restore download, preflight serialization, and rollback after partial write failure.

### Medium: legacy supply-chain hardening remains

Semgrep identified mutable GitHub Action tags and legacy external scripts without Subresource Integrity. Action pins require verified full commit SHAs; the unversioned Supabase CDN include needs a pinned artifact or locally bundled dependency before SRI can be stable. These are not the main owner-data boundary, but should be addressed before widening distribution.

### Fixed: Android health bridge exposure

The bridge previously listened on all network interfaces over plaintext HTTP. It now binds to device loopback only, and Android OS backup is disabled for the bridge application. Launcher and Health Connect rationale activities remain exported because their platform intent filters require external launchability; privileged service components remain unexported.

### Fixed: scanner-confirmed local code patterns

Health insert logging now uses constant format strings, and the wearable comparison no longer mutates the parsed object passed into `Object.assign`.

## Automated Audit

- Gitleaks: no leaks found in the workspace scan; the image over 2 MB was skipped by the configured size cap.
- Semgrep initial scan: 1,074 registry rules selected, 511 applicable rules, 212 tracked files, 26 findings across six categories, and one partial parse warning in legacy `glowlab.html`.
- Deterministic security contract: service-role isolation from browser code, fail-closed sleep ingest, migration sentinel/policies/rollback, restore validation/rollback, loopback bridge, and Android backup protection.
- Final Semgrep scan after hardening and temp cleanup: 511 applicable rules, 176 tracked files, 23 findings (6 mutable CI refs, 13 legacy SRI warnings, 3 required exported activities, and 1 loopback socket warning).
- Full regression suite: 23 suites passed, including 18 backup checks and 15 security contract checks.
- Browser workflow QA: JSON restore completed end to end with no actionable console errors.

## Residual Risk

The local implementation is suitable for continued development, but it is not approved for a security-sensitive production release until the owner-auth cutover checklist passes against the real Supabase and Vercel environments. The currently linked production deployment is an older build and was not replaced in this phase.
