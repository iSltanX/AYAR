// AT-31's second half, outside the sandbox. Reads the kernel's refusals («Sandbox: <process>(<pid>) deny(1)
// network-outbound <target>», and «N duplicate reports for …») in the window the test recorded, and names each by its
// process from the samples the wrapper took:
//   - the test's canary: expected (it shows the sandbox and its log were on);
//   - a process in the group of one of the project's own commands (the engine's ledger): outside the guarantee (15.3);
//   - the probe's browser: only Chromium's IPv6 reachability check (a UDP connect to [2001:4860:4860::8888]:443 that
//     sends nothing, net/dns/host_resolver_manager.cc), and only where the browser's own net-log shows that and no
//     other socket leaving this machine;
//   - anything else — the engine, the probe, a managed tool, a version probe, or a process not seen — fails.
// Usage: node at31-refusals.mjs <folder with window.json, ps.txt and netlog/>. Exit 0 if nothing of AYAR's was refused.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!existsSync(join(dir, 'window.json'))) {
  console.log('AT-31: the test did not record its window (it did not reach its end)');
  process.exit(1);
}
const w = JSON.parse(readFileSync(join(dir, 'window.json'), 'utf8'));
const at = (ms) => new Date(ms).toLocaleString('sv-SE');

// The processes seen: the first full command line of each pid.
const procs = new Map();
for (const line of readFileSync(join(dir, 'ps.txt'), 'utf8').split('\n')) {
  const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
  if (!m) continue;
  const [, pid, ppid, pgid, command] = m;
  const known = procs.get(+pid);
  if (!known || (/^\(.*\)$/.test(known.command) && !/^\(.*\)$/.test(command))) procs.set(+pid, { ppid: +ppid, pgid: +pgid, command });
}
const ENGINE = /packages\/engine\/src\/bin\/node\.ts|engine\.mjs/;
/** A process and its parents up to the engine (included); the whole line if the engine is not among them. */
const chain = (pid) => {
  const out = [];
  for (let p = pid; procs.has(p) && !out.includes(p) && p > 1; p = procs.get(p).ppid) {
    out.push(p);
    if (ENGINE.test(procs.get(p).command)) break;
  }
  return out;
};
const groups = new Set(w.projectGroups);
const PROBE = /packages\/probe\/src\/bin\/node\.ts|@ayar\/probe|probe\.mjs/;

// The refusals in the window (two seconds after it, for the log's delay).
const out = execFileSync('/usr/bin/log', ['show', '--start', at(Date.parse(w.start)), '--end', at(Date.parse(w.end) + 2000), '--style', 'compact', '--predicate', 'eventMessage CONTAINS "deny(1) network-outbound"'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const refusals = [];
for (const line of out.split('\n')) {
  const m = /(?:(\d+) duplicate reports? for )?Sandbox: (.+)\((\d+)\) deny\(1\) network-outbound (.+)$/.exec(line);
  if (m) refusals.push({ count: m[1] ? +m[1] : 1, name: m[2], pid: +m[3], target: m[4].trim(), line: line.trim() });
}

// The probe's browsers' own record of their sockets.
const netlog = { reachability: 0, other: [] };
const LOOPBACK = /^(127\.|\[::1\]|::1|localhost)/;
const PROBE_ADDRESS = '[2001:4860:4860::8888]:443';
for (const f of existsSync(join(dir, 'netlog')) ? readdirSync(join(dir, 'netlog')) : []) {
  const text = readFileSync(join(dir, 'netlog', f), 'utf8').trim();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    // A browser ended before it closed its log leaves the list of events open.
    j = JSON.parse(`${text.replace(/,\s*$/, '')}]}`);
  }
  const type = Object.fromEntries(Object.entries(j.constants.logEventTypes).map(([k, v]) => [v, k]));
  const udp = new Map();
  for (const e of j.events) {
    const t = type[e.type];
    const p = e.params ?? {};
    if (t === 'UDP_CONNECT' && p.address) {
      udp.set(e.source.id, p.address);
      if (p.address === PROBE_ADDRESS) netlog.reachability++;
      else if (!LOOPBACK.test(p.address)) netlog.other.push(`${f}: UDP_CONNECT ${p.address}`);
    }
    if (t === 'UDP_BYTES_SENT' && udp.has(e.source.id) && !LOOPBACK.test(udp.get(e.source.id))) netlog.other.push(`${f}: UDP_BYTES_SENT to ${udp.get(e.source.id)}`);
    if (t === 'TCP_CONNECT_ATTEMPT' && p.address && !LOOPBACK.test(p.address)) netlog.other.push(`${f}: TCP_CONNECT_ATTEMPT ${p.address}`);
    if (t === 'DNS_TRANSACTION_ATTEMPT') netlog.other.push(`${f}: ${t}`);
  }
}

const named = { canary: 0, project: [], reachability: 0, ayar: [] };
for (const r of refusals) {
  if (r.pid === w.canary) {
    named.canary += r.count;
    continue;
  }
  const c = chain(r.pid);
  // The refusal, and the process the engine started that it came from (or the whole line if not the engine's).
  const top = c.length > 1 && ENGINE.test(procs.get(c[c.length - 1]).command) ? [c[c.length - 2]] : c;
  const label = `${r.line.replace(/^.*\(Sandbox\) /, '')}\n      from ${top.map((p) => `${p} ${procs.get(p).command.slice(0, 200)}`).join('\n      ') || '(a process the samples did not see)'}`;
  if (c.some((p) => groups.has(procs.get(p).pgid))) named.project.push(label);
  else if (c.some((p) => PROBE.test(procs.get(p).command)) && r.target === 'remote:*:443' && /Chrome for Testing/.test(r.name)) named.reachability += r.count;
  else named.ayar.push(label);
}
const reachabilityOk = named.reachability === 0 || (netlog.reachability >= named.reachability && netlog.other.length === 0);

console.log(`AT-31 window ${w.start} → ${w.end}: ${refusals.length} refusal line(s)`);
console.log(`  the canary: ${named.canary} (expected at least one)`);
console.log(`  the project's own commands (outside the guarantee, 15.3): ${named.project.length}`);
for (const l of named.project) console.log(`    PROJECT ${l}`);
console.log(`  the probe's browser, Chromium's IPv6 reachability check: ${named.reachability} refused; its net-logs: ${netlog.reachability} such check(s), ${netlog.other.length} other socket(s) leaving this machine`);
for (const l of netlog.other) console.log(`    NETLOG ${l}`);
console.log(`  AYAR's processes: ${named.ayar.length}`);
for (const l of named.ayar) console.log(`    REFUSED ${l}`);
process.exit(named.canary > 0 && named.ayar.length === 0 && reachabilityOk ? 0 : 1);
