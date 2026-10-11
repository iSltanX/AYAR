// C-14 «شبكة المسبار» (15.3, AT-31): every request of the probe's pages passes the route handler. This machine
// (127.0.0.1, localhost, [::1]), the extension's own pages and inline data are let through; a host the user allowed by
// name is let through and logged; anything else is refused and logged — the page is checked as it shows without it.
// A declared simulation answers instead of the network (a status, a delay, a body, or a failed connection).
// Beneath the handler, the browser itself is started with a proxy that does not exist for every address outside this
// machine and the allowed hosts, so a request the handler does not see (a WebSocket, a worker) cannot leave either.
import type { ProbeCell } from '../contract.ts';

export interface NetworkLog {
  blocked: string[];
  allowed: string[];
  mocked: { url: string; status: number | null; delayMs: number; aborted: boolean }[];
  /** Told of every simulated request (its address as the page asked for it). */
  simulated?: (url: string) => void;
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const LOCAL_SCHEMES = new Set(['chrome-extension:', 'data:', 'blob:', 'about:', 'chrome:', 'devtools:']);

/** A request's place for the log: method, scheme, host and path; never its query (it may carry a token). */
export function shownUrl(method: string, raw: string): string {
  try {
    const u = new URL(raw);
    return `${method} ${u.protocol}//${u.host}${u.pathname}`.slice(0, 2048);
  } catch {
    return `${method} ${raw.slice(0, 200)}`;
  }
}

export type Verdict = { kind: 'local' } | { kind: 'allowed' } | { kind: 'blocked' };

export function judgeUrl(raw: string, allowHosts: readonly string[]): Verdict {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { kind: 'blocked' };
  }
  if (LOCAL_SCHEMES.has(u.protocol)) return { kind: 'local' };
  if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'ws:' && u.protocol !== 'wss:') return { kind: 'blocked' };
  if (LOOPBACK.has(u.hostname)) return { kind: 'local' };
  if (allowHosts.includes(u.hostname.toLowerCase())) return { kind: 'allowed' };
  return { kind: 'blocked' };
}

/** A simulation's pattern against a request: its path (with the query when the pattern has one); `*` one segment, `**` any. */
export function mockMatches(pattern: string, raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  const subject = pattern.includes('?') ? `${u.pathname}${u.search}` : u.pathname;
  if (!pattern.includes('*')) return subject === pattern;
  const re = pattern
    .replace(/[.+^${}()|[\]\\?]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${re}$`).test(subject);
}

/**
 * The rule beneath the handler, for what the browser does by itself: no name resolves but this machine's and the
 * allowed hosts' (Chromium's automatic DNS-over-HTTPS probe goes direct, past any proxy, and would otherwise ask the
 * system's resolver and its DoH server — seen under AT-31's monitor, D-DEV7-20), and everything else goes to a proxy
 * that does not exist. What remains is Chromium's IPv6 reachability check: a UDP connect that sends nothing.
 */
export function networkArgs(allowHosts: readonly string[]): string[] {
  const local = ['127.0.0.1', 'localhost', '[::1]'];
  return [
    '--proxy-server=http://127.0.0.1:9',
    `--proxy-bypass-list=${[...local, ...allowHosts].join(';')}`,
    `--host-resolver-rules=${['MAP * ~NOTFOUND', ...[...local, '::1', ...allowHosts].map((h) => `EXCLUDE ${h}`)].join(' , ')}`,
  ];
}

export type Mock = ProbeCell['mock'][number];

export function findMock(mocks: readonly Mock[], url: string): Mock | null {
  return mocks.find((m) => mockMatches(m.url, url)) ?? null;
}
