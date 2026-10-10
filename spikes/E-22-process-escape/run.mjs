// E-22: العمليات التي تفلت من التنظيف (الخطة 22، C-12 البنود 6 و8 و11، الحد المعلن في 17، AT-11).
// على FX-PROC: sigterm-grandchild وsetsid-detach وdouble-fork وlaunchctl-submit وenv-cleared-detach. يُشغَّل كل سيناريو
// كما يفعل C-12 (spawn منفصل في مجموعة عمليات جديدة، وعلامة AYAR_CHECK_TOKEN في البيئة)، ثم يُقاس ما يكشفه:
//   (أ) المسح بالعلامة عبر sysctl(KERN_PROCARGS2) (ما تعتمده ps -E)، (ب) شجرة الآباء/مجموعة العمليات، (ج) الأثر: عملية جديدة
//   للمستخدم أبوها launchd ظهرت أثناء الفحص، (د) وظائف launchd الجديدة في نطاق المستخدم. ثم التنظيف والتحقق من عدم بقاء شيء.
// ومعه: التصعيد SIGINT→SIGTERM→SIGKILL على الحفيد العنيد، وقياس ضجيج القاعدة (ج) في نافذة خمول.
//   node spikes/E-22-process-escape/run.mjs
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { NVM_NODE, baseEnv, excerpt, materialize, resultsDir, rmrf, run, tmpdir, writeJson } from '../_lib-dev2/lib.mjs';

const results = resultsDir(import.meta.url);
const here = path.dirname(new URL(import.meta.url).pathname);
const NODE = path.join(NVM_NODE, 'v24.16.0', 'bin', 'node');
const UID = os.userInfo().uid;
const out = { at: new Date().toISOString(), procargs: null, scenarios: [], noise: null, finalCheck: null };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// ── أداة procargs ──
const bin = path.join(tmpdir('ayar-e22-bin'), 'procargs');
const cc = await run('/usr/bin/clang', { args: ['-O1', '-o', bin, path.join(here, 'procargs.c')] });
if (cc.code !== 0) { console.error(cc.err); process.exit(1); }

async function psList() {
  const r = await run('/bin/ps', { args: ['-axo', 'pid=,ppid=,pgid=,sess=,uid=,etime=,comm='] });
  const rows = [];
  for (const line of r.out.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const et = m[6].split(/[-:]/).map(Number); let secs = 0; for (const n of et) secs = secs * 60 + n; if (et.length === 4) secs = et[0] * 86400 + et[1] * 3600 + et[2] * 60 + et[3];
    rows.push({ pid: +m[1], ppid: +m[2], pgid: +m[3], sess: +m[4], uid: +m[5], elapsedS: secs, comm: m[7] });
  }
  return rows;
}
async function tokenScan(token) {
  const mine = (await psList()).filter((p) => p.uid === UID).map((p) => p.pid);
  const r = await run(bin, { args: ['AYAR_CHECK_TOKEN', ...mine.map(String)], timeout: 30 });
  const hits = []; const errors = [];
  for (const line of r.out.split('\n')) { const m = line.match(/^pid=(\d+) (.*)$/); if (!m) continue; if (/error=/.test(m[2])) errors.push(line); }
  // المتغير موجود؟ نحتاج قيمته: نعيد بالعلامة الكاملة (اسم=قيمة) عبر فحص env_strings بالنص؛ الأداة تفحص الاسم فقط، فنتحقق من القيمة بـ ps -E
  const ps = await run('/bin/ps', { args: ['-axE', '-o', 'pid=,command='] });
  for (const line of ps.out.split('\n')) { const m = line.match(/^\s*(\d+)\s/); if (m && line.includes(`AYAR_CHECK_TOKEN=${token}`)) hits.push(+m[1]); }
  return { hits, presentByName: r.out.split('\n').filter((l) => /_present=1/.test(l)).length, errors: errors.length };
}
async function launchdLabels() { const r = await run('/bin/launchctl', { args: ['list'] }); return r.out.split('\n').slice(1).map((l) => l.trim().split(/\s+/)[2]).filter(Boolean); }
async function killGroupEscalating(pgid) {
  const t0 = Date.now(); const steps = [];
  for (const [sig, wait] of [['SIGINT', 5000], ['SIGTERM', 5000], ['SIGKILL', 3000]]) {
    try { process.kill(-pgid, sig); } catch (e) { steps.push({ sig, sent: false, err: e.code }); break; }
    const until = Date.now() + wait; let remaining;
    do { await sleep(250); remaining = (await psList()).filter((p) => p.pgid === pgid); } while (remaining.length && Date.now() < until);
    steps.push({ sig, sent: true, remainingAfter: remaining.map((p) => `${p.pid}:${p.comm}`), ms: Date.now() - t0 });
    if (!remaining.length) break;
  }
  return steps;
}

// ── 0) رؤية البيئة عبر KERN_PROCARGS2 لثنائيات المنصة وغيرها ──
{
  const probes = [['/bin/sleep', ['30']], [NODE, ['-e', 'setTimeout(()=>{},30000)']], ['/opt/homebrew/bin/python3.12', ['-c', 'import time; time.sleep(30)']], ['/usr/bin/python3', ['-c', 'import time; time.sleep(30)']], ['/bin/sh', ['-c', 'sleep 30']], ['/usr/bin/env', ['sleep', '30']]];
  const kids = probes.map(([exe, args]) => spawn(exe, args, { env: { ...baseEnv(), AYAR_CHECK_TOKEN: 'tok_probe' }, stdio: 'ignore' }));
  await sleep(700);
  const r = await run(bin, { args: ['AYAR_CHECK_TOKEN', ...kids.map((k) => String(k.pid))] });
  out.procargs = r.out.trim().split('\n').map((l) => l.replaceAll(os.homedir(), '~'));
  for (const k of kids) k.kill('SIGKILL');
  console.log('procargs:\n' + out.procargs.join('\n'));
}

// ── 1) السيناريوهات ──
const baselinePs = await psList();
const baselineLabels = await launchdLabels();
const scenarios = ['sigterm-grandchild', 'setsid-detach', 'double-fork', 'launchctl-submit', 'env-cleared-detach'];
for (const variant of scenarios) {
  const { base, root } = await materialize('FX-PROC', variant, 'ayar-e22');
  const token = `ayr_chk_${crypto.randomBytes(8).toString('hex')}`;
  const pidsFile = path.join(base, 'pids.txt'); const labelFile = path.join(base, 'launchd.label');
  const env = { ...baseEnv({ PATH: `${path.dirname(NODE)}:${baseEnv().PATH}` }), AYAR_CHECK_TOKEN: token, FX_PROC_PIDS: pidsFile, FX_PROC_LABEL: labelFile };
  const t0 = Date.now();
  const child = spawn(NODE, ['--test'], { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const pgid = child.pid; let outTxt = '';
  child.stdout.on('data', (d) => { outTxt += d; }); child.stderr.on('data', (d) => { outTxt += d; });
  // «exit» يصدر حين يخرج القائد، و«close» حين تُغلق أنابيبه أيضًا، وقد تبقى مفتوحة في يد حفيد ورثها (ملاحظة لـ C-12)
  let exitAt = null, closeAt = null;
  const exitP = new Promise((r) => child.on('exit', (code, signal) => { exitAt = Date.now(); r({ code, signal }); }));
  const closeP = new Promise((r) => child.on('close', (code, signal) => { closeAt = Date.now(); r({ code, signal }); }));
  const exited = await Promise.race([exitP, sleep(12000).then(() => null)]);
  const row = { variant, token, pgid, leaderExit: exited, leaderMs: exitAt ? exitAt - t0 : null };
  if (!exited) { row.escalation = await killGroupEscalating(pgid); row.leaderExitAfterEscalation = await Promise.race([exitP, sleep(5000).then(() => 'لم يخرج')]); }
  const closed = await Promise.race([closeP, sleep(3000).then(() => null)]);
  row.pipesClosedMs = closed && closeAt ? closeAt - t0 : null; row.pipesHeldOpenByOrphans = !closed;
  if (exited) {
    // المجموعة بعد خروج القائد: ما بقي فيها (C-12 البند 11)
    row.groupAfterExit = (await psList()).filter((p) => p.pgid === pgid).map((p) => `${p.pid}:${p.comm}`);
  }
  await sleep(800);
  const recorded = fs.existsSync(pidsFile) ? fs.readFileSync(pidsFile, 'utf8').trim().split('\n').filter(Boolean).map(Number) : [];
  const ps = await psList();
  const byPid = new Map(ps.map((p) => [p.pid, p]));
  const tok = await tokenScan(token);
  const group = ps.filter((p) => p.pgid === pgid).map((p) => p.pid);
  const newPpid1 = ps.filter((p) => p.uid === UID && p.ppid === 1 && !baselinePs.some((b) => b.pid === p.pid) && p.elapsedS <= (Date.now() - t0) / 1000 + 2);
  const newLabels = (await launchdLabels()).filter((l) => !baselineLabels.includes(l));
  row.recordedPids = recorded.map((pid) => { const p = byPid.get(pid); return { pid, alive: alive(pid), comm: p?.comm ?? null, ppid: p?.ppid ?? null, pgid: p?.pgid ?? null, byToken: tok.hits.includes(pid), byGroup: group.includes(pid), byPpid1Heuristic: newPpid1.some((x) => x.pid === pid) }; });
  row.tokenScan = { hits: tok.hits, byNameCount: tok.presentByName, errors: tok.errors };
  row.groupScan = group;
  row.ppid1Heuristic = newPpid1.map((p) => `${p.pid}:${p.comm}:${p.elapsedS}s`);
  row.newLaunchdLabels = newLabels;
  row.testOutput = excerpt(outTxt.replaceAll(os.homedir(), '~'), 500);
  // التنظيف: بالعلامة ثم بالقائمة المسجلة ثم launchd، ثم التحقق
  const kill = async (pids) => { for (const pid of pids) { try { process.kill(pid, 'SIGTERM'); } catch { /* ماتت */ } } await sleep(1500); for (const pid of pids) if (alive(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { /* ماتت */ } } };
  await kill([...new Set([...tok.hits, ...group])]);
  const stillAfterToken = recorded.filter(alive);
  await kill(stillAfterToken);
  for (const l of newLabels) await run('/bin/launchctl', { args: ['remove', l] });
  if (fs.existsSync(labelFile)) { const l = fs.readFileSync(labelFile, 'utf8').trim(); await run('/bin/launchctl', { args: ['remove', l] }); row.labelFromFile = l; }
  await sleep(1200);
  const psAfter = await psList();
  row.cleanup = { killedByTokenOrGroup: [...new Set([...tok.hits, ...group])], neededRecordedList: stillAfterToken, recordedAliveAfter: recorded.filter(alive), newPpid1AliveAfter: newPpid1.filter((p) => psAfter.some((q) => q.pid === p.pid)).map((p) => `${p.pid}:${p.comm}`), labelsAfter: (await launchdLabels()).filter((l) => /ayar/.test(l)) };
  out.scenarios.push(row);
  console.log(`• ${variant}: leader=${JSON.stringify(exited)} recorded=${recorded.length} token=${tok.hits.length} group=${group.length} ppid1=${newPpid1.length} labels=${newLabels.length} → after cleanup alive=${row.cleanup.recordedAliveAfter.length} labels=${row.cleanup.labelsAfter.length}`);
  rmrf(base);
}

// ── 2) ضجيج القاعدة (ج): عمليات جديدة أبوها launchd للمستخدم في نافذة خمول 20 ثانية ──
{
  const b = await psList(); const t0 = Date.now();
  await sleep(20000);
  const a = await psList();
  const noise = a.filter((p) => p.uid === UID && p.ppid === 1 && !b.some((x) => x.pid === p.pid)).map((p) => p.comm.replaceAll(os.homedir(), '~'));
  out.noise = { windowS: 20, newPpid1: noise, count: noise.length, totalUserProcesses: a.filter((p) => p.uid === UID).length, ms: Date.now() - t0 };
  console.log(`• noise: ${noise.length} new ppid=1 user processes in 20s: ${noise.join(', ')}`);
}

// ── 3) الفحص النهائي ──
{
  const ps = await psList();
  const leftovers = ps.filter((p) => /sleeper|double_fork|ignore-sigterm|spawn-grandchild/.test(p.comm) || (p.comm === '/bin/sleep' && p.ppid === 1));
  const labels = (await launchdLabels()).filter((l) => /ayar/.test(l));
  out.finalCheck = { leftovers: leftovers.map((p) => `${p.pid}:${p.comm}`), ayarLaunchdLabels: labels, clean: !leftovers.length && !labels.length };
  console.log(`• final: leftovers=${leftovers.length} labels=${labels.length} ${out.finalCheck.clean ? '✓ نظيف' : '✗'}`);
}
rmrf(path.dirname(bin));
writeJson(path.join(results, 'run.json'), out);
console.log(`\nكُتب ${path.join(results, 'run.json')}`);
