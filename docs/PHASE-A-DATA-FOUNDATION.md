# Phase A: Truth and Data Foundation

Status: implemented locally, tested, not deployed, no database migration applied, no live user data migrated.

## Outcome

Phase A adds a canonical, owner-scoped data foundation beside the current application without changing page write paths. Existing pages continue to use their mature legacy stores until each domain passes parity tests in a later phase.

The new foundation provides:

- A machine-readable source-of-truth registry.
- Versioned canonical event validation and normalization.
- Stable offline event IDs and idempotent `source_ref` handling.
- A transactional browser repository backed by IndexedDB.
- Atomic event, outbox, command-history, and migration-metadata commits.
- Append-only replacements and deletion tombstones.
- Confirmation-ready `execute`, `undo`, and `redo` commands.
- Explicit migration preview, checksum, apply, verify, and rollback.
- Compatibility reads that expose canonical and legacy data together.
- A staged owner-scoped cloud schema with immutable event policies.

## Authoritative Registry

The machine-readable registry is [data-registry.js](../data-registry.js). It is authoritative over prose documentation. Every entry declares its events, commands, projections, legacy sources, cloud tables, identity rules, unit rules, date rules, retention rules, privacy class, consumers, owner, and migration version.

CI-style coverage in `tests/data-registry.test.js` scans production JavaScript and HTML for direct `localStorage` literals and referenced key constants. The test fails when a statically discoverable production store has no registered owner.

## Current Store Ownership

| Domain | Owner | Current legacy stores and prefixes |
|---|---|---|
| Profile | `platform/profile` | `settings:v1`; `auth:required:v1` is registered but excluded from migration |
| Nutrition | `health/nutrition` | `nt:logs`, `nt:targets`, `nt:tdee`, `nt:grocery:v1`, `nt:meal_templates`, `nt:photoCache:v1`, `nt:recipes:v1`, `gym:nutrition-targets:v1`, `health:caffeine:v1` |
| Hydration | `health/hydration` | `po_water_v1` |
| Sleep | `health/recovery` | `sleep:logs`, `sleep:manual:v1`, `health:sleep:v1` |
| Wearables | `integrations/wearables` | `wearable:today:v1`, `activity:summary:v1`, `health:metrics:v1` |
| Training | `health/training` | `po_coach_v1`, `po_coach_workout_done`, `gym:cardio:v1`, `gym:cycle:v1`, `gym:goals:v1`, `gym:prs:v1`, `gym:prs:suppressed:v1`, `gym:rest:v1`, `gym:templates:v1` |
| Body | `health/body` | `po_coach_weights`, `body:logs`, `health:body:v1`, `body:photo_reports:v1`, body use of `gym:goals:v1` |
| Energy | `health/energy` | `energy:logs:v1` |
| Mood | `health/checkins` | `mind:mood:v1`, `mood:logs:v1`, `mind:gratitude:v1`, `mind:journal:v1`, `mind:meditation:v1` |
| Labs | `health/labs` | `blood:logs`, `health:labs:v1` |
| Supplements | `health/supplements` | `stack:items`, `stack:taken:*`, `supps:stack`, `supps:taken` |
| Skin | `health/skin` | `skin:breakouts`, `skin:device_sessions`, `skin:goals`, `skin:ingredients`, `skin:logs`, `skin:products`, `skin:routine:v1` |
| Finance | `finance` | `fin:accounts:v1`, `fin:budgets`, `fin:income`, `fin:subs`, `fin:debt_strat`, `fin:debts:v1`, `fin:dividends:v1`, `fin:mortgage:v1`, `fin:portfolio:v1`, `fin:recur_dismissed:v1`, `fin:tax:v1`, `finance:vehicles`, `finance_active_tab`, `ing:income`, `ing:meta`, `ing:tx`, `incoming_orders`, `man:income`, `nw:activity`, `nw:history`, `nw_currency`, `sav:goals`, `subs`, `gl:revenue`, `gl:expenses`, `gl:rateInputs` |
| Productivity | `productivity` | `tasks:v1`, `tasks:projects:v1`, `goals:*`, `habits:v1`, `habits:logs:v1`, `planner:blocks:v1`, `pomo:sessions:v1`, `goal_streak_v1`, briefing keys, `reminders:v1` |
| Communications | `integrations/communications` | mail summary/cache/order/snooze/classification keys, Gmail and Google Calendar connection state; provider tokens are registered but excluded from event migration |
| Photos | `platform/media` | `po_coach_photos`, `body:photos:v1`, IndexedDB `lifeos-photos` |
| Lifestyle | `lifestyle` | `travel:trips:v1`, `library:books:v1`, `library:courses:v1`, `social:contacts:v1`, `watch:comparison:v1`, `watch:data:v3` |
| System | `platform/data` | AI cache, audit/coach reports, experiment state, `lifeos:hist:*`, radar state, error log, onboarding, backup metadata, share handoff, and `sync:meta:*`; disposable caches and sync metadata are excluded from migration |

## Canonical Event Contract

`canonical-events.js` owns the version 1 event shape:

```js
{
  id,
  user_id,
  type,
  domain,
  occurred_at,
  recorded_at,
  local_date,
  timezone,
  source,
  source_ref,
  schema_version,
  payload,
  units,
  confidence,
  provenance,
  supersedes_id,
  deleted_at,
  device_id,
  sync_state
}
```

Important guarantees:

- `user_id` and `device_id` are required at the repository boundary.
- `source_ref` deterministically produces the same event ID across retries and devices.
- A reused identity with different facts raises `IDEMPOTENCY_CONFLICT`.
- Event types must be registered and owned by their declared domain.
- Domain payloads validate before any transaction opens.
- UTC occurrence time, local date, and IANA timezone are stored separately.
- Edits append events with `supersedes_id`.
- Deletes append events with `deleted_at` and a target-preserving tombstone payload.

## Transaction Boundary

`event-repository.js` stores four IndexedDB object stores in one database:

- `events`
- `outbox`
- `commands`
- `meta`

An event, its pending outbox operation, command history, and any migration marker are committed in one IndexedDB transaction. A failed write leaves all four stores unchanged. The in-memory test adapter follows the same batch contract and supports injected write failures.

Effective reads remove active tombstones and superseded facts while raw reads preserve the complete audit history. Tombstoning a correction reveals the previously superseded fact again, which makes undo reversible without destructive history edits.

## Command API

`data-commands.js` exposes:

```js
LifeOS.commands.execute(command)
LifeOS.commands.undo(commandId)
LifeOS.commands.redo(commandId)
```

The module is installed explicitly after an owner-scoped repository is created. It does not auto-run AI suggestions or bypass the existing confirmation UI. Command IDs are idempotent. Undo appends tombstones. Redo creates a new event linked to the original command.

## Migration Runbook

`legacy-migration.js` never starts automatically.

1. `preview()` snapshots every current raw key/value, computes a whole-snapshot checksum, resolves ownership, excludes credentials and disposable operational stores, and creates stable canonical import envelopes in memory only.
2. The preview reports counts, bytes, skipped stores, and unregistered stores.
3. `apply(preview)` refuses to run if any raw legacy value changed after preview.
4. Events and the applied migration marker commit together.
5. `verify(id)` proves event count, source-reference uniqueness, per-key raw checksum identity, and snapshot identity.
6. Failed verification appends rollback tombstones and restores the exact pre-apply snapshot.
7. Manual `rollback(id)` uses compensating transactions: if canonical rollback fails after a legacy restore, it restores the pre-rollback legacy state.
8. Legacy stores remain intact during the compatibility period.

The migration envelope retains the exact raw string as `payload.raw_value`, plus its parsed form, checksum, byte length, original key, original owner, migration version, and import time. This makes a byte-identity round trip possible even when an old value is not valid JSON.

## Cross-Device Boundary

The local repository is an offline replica, not the final authority. The durable authority will be the authenticated, owner-scoped cloud ledger in `migrations/phase-a-canonical-events.sql` after approval and cutover testing.

The staged cloud schema:

- Requires authenticated `user_id` ownership.
- Allows owner `SELECT` and `INSERT` only.
- Has no `UPDATE` or `DELETE` policy, enforcing replacement and tombstone history.
- Deduplicates `(user_id, type, source_ref)`.
- Supports owner/date, domain/date, supersession, and payload indexes.
- Can participate in Supabase Realtime after the approved migration.

It has not been applied. The current `cloudsync.js`, `events.js`, and `events-bridge.js` remain the active legacy cross-device paths until a later phase ports domain writes and implements outbox upload, cursor download, bootstrap, conflict resolution, and photo object storage.

## Verification

Focused behavior proven:

- Registry completeness and unique ownership.
- Canonical schema validation and timezone-local dates.
- Stable IDs and idempotency conflicts.
- Atomic event and outbox writes.
- Replacement, tombstone, and effective-history behavior.
- Command execute, undo, redo, and retry safety.
- Migration dry run, exact raw preservation, drift refusal, idempotent apply, verification, rollback, and storage failure compensation.
- Credential exclusion from canonical migration payloads.

Full regression result on 2026-07-20:

- 28 test suites passed.
- 664 checks passed.
- 0 failures.

No UI files or page write paths changed, so Phase A has no before/after visual delta and no screenshot requirement. Browser visual acceptance resumes when Phase C changes shared UI and Phase D starts page cutover.

## Review Gate

Phase A stops here for owner review as required by the master plan.

Phase B should build deterministic projections and the dependency graph on top of this repository. It should not remove compatibility readers or redirect a page write until fixtures prove that its canonical projection matches the current visible totals and workflows.
