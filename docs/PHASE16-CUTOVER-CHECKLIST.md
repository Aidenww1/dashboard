# Phase 16 Security Cutover Checklist

Status: **RELEASE BLOCKED until every item below is completed in one coordinated window.**

## Preconditions

- Create the single Supabase Auth owner account and record its UUID.
- Export the current browser state and verify at least one cloud backup slot.
- Set `OWNER_UID` on Vercel and redeploy the server routes before changing table constraints.
- Set strong values for `HEALTH_INGEST_TOKEN`, `SLEEP_INGEST_TOKEN`, and `CRON_SECRET`.
- Update the Android/Tasker/MacroDroid callers to send their ingest token before making health ingest fail closed.

## Client And API Cutover

- Load `auth.js` in the redesigned shell and prove sign-in, refresh, sign-out, and recovery.
- Send the owner session JWT on every browser Supabase REST and realtime request.
- Require an owner session for `api/health/read/[type].js`, `api/health-ai/agent.js` POST, `api/events/add.js`, `api/life-context.js`, `api/nutrition-ai.js`, `api/visual-ai.js`, and `api/gcal-nlp.js`.
- Make the health ingest route fail closed when `HEALTH_INGEST_TOKEN` is absent.
- Make cron GET requests fail closed when `CRON_SECRET` is absent.
- Set `PUSH_REQUIRE_AUTH=1` only after `pwa.js` is proven to attach a valid owner session to POST and DELETE.
- Keep `SUPABASE_SERVICE_KEY` server-only and confirm all service-role writes stamp the configured `OWNER_UID`.

## RLS Window

1. Replace the zero `owner_uid` sentinel in `migrations/phase10-rls.sql`.
2. Run the migration in the Supabase SQL editor. The sentinel must abort an unedited script.
3. Verify all listed tables have `rowsecurity = true` and no null `user_id` values.
4. Verify an unauthenticated REST request cannot read or write owner rows.
5. Verify the owner session can read and write every canonical table.
6. Verify a second test user cannot read, update, or delete owner rows.
7. Verify sleep ingest, health ingest, event creation, AI tools, cron, and push subscription mutation.
8. Run backup export, local restore, cloud restore, and the full regression suite.

## Rollback

- Run the rollback block in `migrations/phase10-rls.sql` to disable RLS if owner access fails.
- Revert auth-required flags while keeping the additive `user_id` columns.
- Restore the downloaded pre-cutover browser snapshot if a client migration corrupts local state.
- Rotate affected tokens after any failed or partially exposed cutover.

Do not deploy the Phase 16 security cutover in pieces. Optional auth plus disabled RLS is a staging state, not a secure production boundary.
