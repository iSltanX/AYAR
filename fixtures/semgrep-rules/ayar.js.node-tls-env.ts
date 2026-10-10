// Test project of ayar.js.node-tls-env.
export function insecure(): void {
  // ruleid: ayar.js.node-tls-env
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

export function secure(): void {
  // ok: ayar.js.node-tls-env
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
}
