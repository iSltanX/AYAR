// Count privacy (TCC) requests for our spike apps from the unified log, joined by msgID.
// node tcc-log.mjs "<start, e.g. 2026-10-10 01:00:00>" <bundle-id-prefix> [out.json]
// A prompt was actually shown for a request iff tccd logged AUTHREQ_PROMPTING for its msgID
// (E-04 showed authReason=2 "user consent" also for later requests answered from the stored decision).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const [start, prefix, out] = process.argv.slice(2);
const text = execFileSync('/usr/bin/log', ['show', '--start', start, '--style', 'compact',
  '--predicate', 'subsystem == "com.apple.TCC" AND eventMessage CONTAINS "msgID"'],
  { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
const reqs = new Map();
const prompts = [];
for (const line of text.split('\n')) {
  const time = line.slice(0, 23);
  const id = /msgID=([\d.]+)/.exec(line)?.[1];
  if (!id) continue;
  const r = reqs.get(id) ?? { msgID: id, time };
  const svc = /service=(kTCCService\w+)/.exec(line)?.[1];
  if (svc) r.service = svc;
  if (line.includes('AUTHREQ_PROMPTING')) { r.prompted = true; prompts.push(time); }
  if (line.includes('AUTHREQ_ATTRIBUTION')) {
    r.responsible = /responsible=\{TCCDProcess: identifier=([^,]+)/.exec(line)?.[1];
    r.accessing = /accessing=\{TCCDProcess: identifier=([^,]+)(?:.*?binary_path=([^}]+))?/.exec(line)?.slice(1, 3).join(' ').trim();
  }
  const res = /AUTHREQ_RESULT: msgID=[\d.]+, authValue=(\d+), authReason=(\d+)/.exec(line);
  if (res) { r.authValue = Number(res[1]); r.authReason = Number(res[2]); r.resultTime = time; }
  reqs.set(id, r);
}
const ours = [...reqs.values()].filter((r) => r.responsible?.startsWith(prefix) && r.authValue !== undefined);
const summary = {
  start, prefix,
  requests: ours.length,
  prompted: ours.filter((r) => r.prompted).length,
  byService: Object.fromEntries([...new Set(ours.map((r) => r.service))].map((s) => [s, {
    requests: ours.filter((r) => r.service === s).length,
    prompted: ours.filter((r) => r.service === s && r.prompted).length,
    denied: ours.filter((r) => r.service === s && r.authValue === 0).length,
  }])),
  requestsDetail: ours.map(({ time, service, responsible, accessing, authValue, authReason, prompted }) => ({ time, service, responsible, accessing, authValue, authReason, prompted: Boolean(prompted) })),
};
if (out) fs.writeFileSync(out, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, requestsDetail: undefined }, null, 2));
