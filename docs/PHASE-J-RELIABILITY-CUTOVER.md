# Phase J: Reliability and Cutover

Status: local implementation and simulated reliability verification complete; production cutover remains blocked pending owner-scoped cloud deployment and real-device tests.

## 1. Objective completed

The primary Life OS information architecture now has an opt-in authenticated sync controller, owner-bound remote ingestion, conflict retention, retry/backoff, transactional restore, and a central compatibility-storage boundary. The UI exposes continuity and backup controls without claiming a provider is connected.

## 2. User-visible improvements

- More > Integrations shows canonical sync state, pending event count, sign-in, enable/disable, and Sync now controls.
- Sync cannot be enabled while signed out; the live browser test displayed the owner-sign-in requirement.
- More > Data exports a complete device snapshot and restores a validated JSON snapshot.
- Restore has a 10 MB input limit, explicit confirmation, owner/version validation, and rollback on compatibility-write failure.
- Authentication tokens and known secret keys are excluded from export.
- Primary tabs wrap compactly on tablet and phone instead of requiring page-level horizontal scrolling.

## 3. Architecture changes

- `canonical-sync.js` pulls before pushing, maintains a cursor, acknowledges immutable events, and uses bounded exponential retry.
- `event-repository.js` supports atomic remote ingest, snapshot replacement, local-owner claim, tombstone restore, and retained conflicts.
- `auth.js` restores sessions synchronously and has an SDK-free Supabase REST fallback.
- `ui/canonical-runtime.js` separates local outbox status from remote sync readiness and only schedules remote work after explicit enablement.
- `ui/compatibility-store.js` centralizes compatibility reads/writes for the five primary pages.
- `ui/more.html` owns the continuity and device-backup workflows.

## 4. Data migrations and rollback plan

Prepared migration checksums:

- `migrations/phase-a-canonical-events.sql`: `B718E45BFE6DD4F9AC6205F362FED2C55B1A8489A89908710F4F81726E7B8C38`
- `migrations/phase10-rls.sql`: `7275D0DF66C57A27FD0287C65A2281EF897DCBC508553FDDED9175614F22AF07`

Neither migration was applied during this phase. Production application requires a real owner UUID, a pre-cutover export, server environment configuration, and one coordinated RLS window. Rollback is documented in `docs/PHASE16-CUTOVER-CHECKLIST.md` and includes restoring the pre-cutover snapshot and disabling RLS through the migration rollback block if owner access fails.

## 5. Changed files

- `auth.js`
- `canonical-sync.js`
- `event-repository.js`
- `canonical-events.js`
- `data-registry.js`
- `data-commands.js`
- `ui/canonical-runtime.js`
- `ui/compatibility-store.js`
- `ui/log.html`
- `ui/money.html`
- `ui/more.html`
- `ui/data.js`
- `ui/today.html`
- `ui/coach.html`
- `sw.js`
- `tests/canonical-sync.test.js`
- `tests/phase-j-contract.test.js`

## 6. Tests run with exact results

- Canonical sync: 8 passed.
- Phase J contract: 13 passed.
- Full repository suite: 41 suites, 947 assertions/tests passed, 0 failed.
- Covered signed-out blocking, owner mismatch, offline behavior, acknowledgement, no-echo ingestion, conflict retention, retry, tombstone restore, import/restore validation, security contracts, and primary-page write boundaries.

## 7. Screenshots and viewport sizes

In-app browser matrices were executed at 1440x900, 1680x945, 1792x1024, 768x1024, and 390x844.

- Labs: no document overflow, no clipped visible controls, segment tabs fit at every size.
- More > Data: no document overflow, no clipped visible controls, export and restore inputs present at every size.
- Primary smoke matrix: Today, Log, Coach, Money, and More loaded at 1440x900 and 390x844 with no document overflow or clipped visible controls.

The in-app browser timed out while capturing the long More page image, so this report relies on the recorded DOM/geometry matrix rather than claiming a saved screenshot for that page.

## 8. Cross-domain propagation demonstrated

Canonical writes schedule sync only when the owner is authenticated and sync is explicitly enabled. Pull occurs before push. Remote immutable events feed the same projection engine as local events; conflicts are retained in `sync:conflicts` rather than silently overwriting either device. The full projection and workflow contracts pass after the sync changes.

## 9. Known limitations and blocked external checks

- Supabase migrations and RLS are not applied.
- Two independent authenticated browser profiles and a real installed mobile PWA have not been tested against production storage.
- Provider credentials and device bridges are not available in this local run.
- Secondary legacy tools outside the five primary pages still contain direct compatibility writes. They remain a staged cutover boundary and prevent a truthful claim that every historical page writes through canonical commands.
- Photo/document object synchronization and revoked-session storage access require the deployed backend.

## 10. Security and privacy impact

- Sync refuses signed-out and wrong-owner operations before invoking a transport.
- Remote rows are owner scoped and immutable in the repository contract.
- Export filters auth sessions, tokens, secrets, and passwords.
- Restore preserves current auth/device ownership and rejects foreign snapshots.
- Production security is not claimed until RLS is applied and verified with owner, unauthenticated, and second-user sessions.

## 11. Recommended next phase

Run the coordinated production cutover checklist, then execute the 13-scenario cross-device matrix with two independent authenticated profiles and one mobile PWA context. After that, migrate each remaining secondary legacy tool by domain rather than replacing mature workflows mechanically.

## 12. Owner approval

Local implementation is ready for review. Deployment, migration application, and production security verification still require explicit owner approval.
