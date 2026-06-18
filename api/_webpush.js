/* ============================================================
   Minimal Web Push (VAPID) sender — no dependencies.
   Sends a "tickle" (no encrypted payload): only requires a VAPID
   ES256 JWT in the Authorization header, which Node's webcrypto
   signs natively. The service worker fetches the actual briefing
   text from Supabase when the push wakes it, so we never need to
   implement RFC 8291 (aes128gcm) payload encryption.

   Env required (set in Vercel):
     VAPID_PUBLIC_KEY   base64url, 65-byte uncompressed P-256 point
     VAPID_PRIVATE_KEY  base64url, 32-byte P-256 private scalar
     VAPID_SUBJECT      mailto:you@example.com  (optional)
   Generate with:  npx web-push generate-vapid-keys
   ============================================================ */
import { webcrypto } from 'node:crypto';
const { subtle } = webcrypto;

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBuf(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

async function importVapidKey() {
  const pub = b64urlToBuf(process.env.VAPID_PUBLIC_KEY);   // 0x04 || X(32) || Y(32)
  const priv = b64urlToBuf(process.env.VAPID_PRIVATE_KEY); // d (32)
  const jwk = {
    kty: 'EC', crv: 'P-256',
    x: b64url(pub.subarray(1, 33)),
    y: b64url(pub.subarray(33, 65)),
    d: b64url(priv),
    ext: true,
  };
  return subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function vapidJWT(audience) {
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64url(Buffer.from(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: process.env.VAPID_SUBJECT || 'mailto:admin@lifeos.app',
  })));
  const data = header + '.' + payload;
  const key = await importVapidKey();
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(data)); // raw r||s
  return data + '.' + b64url(Buffer.from(sig));
}

// Returns the push service HTTP status (201 = queued, 404/410 = expired).
export async function sendPush(sub) {
  const audience = new URL(sub.endpoint).origin;
  const jwt = await vapidJWT(audience);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      TTL: '86400',
      Authorization: `vapid t=${jwt}, k=${process.env.VAPID_PUBLIC_KEY}`,
    },
  });
  return res.status;
}

// Reads stored subscriptions, pushes to each, prunes expired ones.
export async function sendPushToAll() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return { skipped: 'no VAPID keys' };
  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPA_URL || !SUPA_KEY) return { skipped: 'no supabase' };
  const r = await fetch(`${SUPA_URL}/rest/v1/app_state?select=data&key=eq.push:subs:v1&limit=1`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  });
  const rows = r.ok ? await r.json() : [];
  const subs = (rows[0] && rows[0].data && rows[0].data.subs) || [];
  if (!subs.length) return { sent: 0, total: 0 };
  let sent = 0;
  const keep = [];
  for (const s of subs) {
    try {
      const st = await sendPush(s);
      if (st >= 200 && st < 300) { sent++; keep.push(s); }
      else if (st !== 404 && st !== 410) { keep.push(s); } // transient — retain
    } catch (e) { keep.push(s); }
  }
  if (keep.length !== subs.length) {
    await fetch(`${SUPA_URL}/rest/v1/app_state?on_conflict=key`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ key: 'push:subs:v1', data: { subs: keep }, updated_at: new Date().toISOString(), user_id: process.env.OWNER_UID }),
    });
  }
  return { sent, total: subs.length };
}
