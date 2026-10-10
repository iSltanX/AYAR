// Test project of ayar.js.tls-reject-unauthorized.
import https from 'node:https';

export function insecure(url) {
  // ruleid: ayar.js.tls-reject-unauthorized
  return https.get(url, { rejectUnauthorized: false });
}

export function secure(url) {
  // ok: ayar.js.tls-reject-unauthorized
  return https.get(url, { rejectUnauthorized: true });
}
