// Shared ingest-endpoint auth (Phase 10: "ingest secrets / endpoint protection /
// unauthenticated rejection"). Token may arrive as the x-ingest-token header, a
// body.token field, or ?token= query. Compared in constant time.
//
// failOpenWhenUnset: when the env token is NOT configured —
//   false (default) -> reject (503). Use for endpoints that already require a
//     token, so a misconfigured deploy can't silently become an open writer.
//   true -> allow but flag .unprotected. Use only for an endpoint whose device
//     side (e.g. Tasker/Health Connect) can't be updated atomically with the
//     server; the owner sets the token + updates the device as a coordinated step.
export function checkIngestToken(req, envName, opts) {
  const failOpenWhenUnset = !!(opts && opts.failOpenWhenUnset);
  const expected = process.env[envName];
  if (!expected) {
    return failOpenWhenUnset
      ? { ok: true, unprotected: true }
      : { ok: false, status: 503, error: 'Ingest endpoint not configured' };
  }
  const provided =
    (req.headers && (req.headers['x-ingest-token'] || req.headers['X-Ingest-Token'])) ||
    (req.body && req.body.token) ||
    (req.query && req.query.token) || '';
  if (typeof provided !== 'string' || provided.length !== expected.length) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? { ok: true } : { ok: false, status: 401, error: 'Unauthorized' };
}
