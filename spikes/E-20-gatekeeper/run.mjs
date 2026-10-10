// E-20: Gatekeeper والأدوات المُدارة (الخطة 22، C-11). لكل أداة مُدارة (منزَّلة برمجيًّا بإصدار مثبت): المسار، وسمة الحجر
// (com.apple.quarantine)، والتوقيع (codesign: ad-hoc/linker-signed أم Developer ID أم Apple)، وتقييم spctl، وهل تعمل (--version).
// ثم: (1) هل يضع التنزيل البرمجي (Node https كما في C-11، وcurl) سمة الحجر؟ (2) ماذا يقول spctl عن نسخة موسومة بالحجر يدويًّا
// (دون تشغيلها، حتى لا يظهر حوار Gatekeeper على شاشة المالك)؟ (3) Chromium الخاص بـ Playwright (حزمة .app) وتوقيعه.
//   node spikes/E-20-gatekeeper/run.mjs
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { DEV2_CACHE, TC_HOME, baseEnv, excerpt, resultsDir, rmrf, run, tmpdir, writeJson } from '../_lib-dev2/lib.mjs';

const results = resultsDir(import.meta.url);
const out = { at: new Date().toISOString(), tools: [], downloadQuarantine: [], quarantinedAssessment: [], chromium: null, system: {} };
const H = (s) => String(s).replaceAll(os.homedir(), '~');

async function inspect(name, bin, versionArgs = ['--version']) {
  if (!fs.existsSync(bin)) { out.tools.push({ name, bin: H(bin), missing: true }); return; }
  const real = fs.realpathSync(bin);
  const xa = await run('/usr/bin/xattr', { args: ['-l', real] });
  const cs = await run('/usr/bin/codesign', { args: ['-dv', '--verbose=2', real] });
  const sig = cs.err; // codesign يكتب إلى stderr
  const sp = await run('/usr/sbin/spctl', { args: ['--assess', '--type', 'execute', '-vv', real] });
  const v = await run(real, { args: versionArgs, env: baseEnv(), timeout: 30 });
  const row = {
    name, bin: H(bin), realpath: H(real), sizeMB: +(fs.statSync(real).size / 1048576).toFixed(1),
    quarantine: /com\.apple\.quarantine/.test(xa.out) ? xa.out.split('\n').find((l) => l.includes('quarantine')).trim() : null,
    provenance: /com\.apple\.provenance/.test(xa.out),
    signature: (sig.match(/Signature=(.*)/) ?? [])[1] ?? null, flags: (sig.match(/flags=([^ ]+)/) ?? [])[1] ?? null, identifier: (sig.match(/Identifier=(.*)/) ?? [])[1] ?? null,
    teamId: (sig.match(/TeamIdentifier=(.*)/) ?? [])[1] ?? null, authority: (sig.match(/Authority=(.*)/) ?? [])[1] ?? null,
    spctl: `${sp.code}: ${excerpt((sp.out + sp.err).trim().split('\n').at(-1) ?? '', 160)}`,
    runs: v.code === 0, version: excerpt((v.out || v.err).split('\n').find((l) => l.trim()) ?? '', 80),
  };
  out.tools.push(row);
  console.log(`• ${name}: sig=${row.signature} flags=${row.flags} team=${row.teamId ?? '—'} quarantine=${row.quarantine ? 'نعم' : 'لا'} spctl=${row.spctl.slice(0, 60)} runs=${row.runs}`);
}

// ── الأدوات المُدارة (كلها منزَّلة برمجيًّا: gh أو pip/uv أو Playwright أو npm) ──
await inspect('betterleaks 1.9.0 (gh release download)', path.join(DEV2_CACHE, 'betterleaks', 'bin', 'betterleaks'), ['version']);
await inspect('gitleaks 8.30.1 (gh release download، نسخة مُدارة)', path.join(DEV2_CACHE, 'gitleaks', 'bin', 'gitleaks'), ['version']);
await inspect('gitleaks 8.30.1 (Homebrew، للمقارنة)', '/opt/homebrew/bin/gitleaks', ['version']);
await inspect('osv-scanner 2.6.0 (gh release download)', path.join(TC_HOME, 'bin', 'osv-scanner'));
await inspect('lychee 0.24.2 (gh release download، tar.gz)', path.join(TC_HOME, 'bin', 'lychee'));
await inspect('cosign 3.1.3 (gh release download)', path.join(DEV2_CACHE, 'cosign', 'cosign'), ['version']);
await inspect('mise 2026.10.7 (gh release download، tar.gz)', path.join(DEV2_CACHE, 'mise', 'mise', 'bin', 'mise'));
await inspect('uv 0.13.0 (pip في بيئة معزولة)', path.join(TC_HOME, 'py', 'bin', 'uv'));
{ // semgrep: الملف التنفيذي الأصلي داخل الحزمة (semgrep-core) هو الثنائي الذي يهم Gatekeeper
  const r = await run(`ls "${TC_HOME}"/py/lib/python3.12/site-packages/semgrep/bin/ 2>/dev/null`);
  const core = r.out.split('\n').map((s) => s.trim()).find((s) => /semgrep-core/.test(s));
  if (core) await inspect('semgrep-core 1.180.0 (pip، داخل حزمة semgrep)', path.join(TC_HOME, 'py', 'lib', 'python3.12', 'site-packages', 'semgrep', 'bin', core), ['-version']);
}
await inspect('node 24.18.1 (Homebrew، للمقارنة)', '/opt/homebrew/bin/node');

// ── Chromium الخاص بـ Playwright (حزمة تطبيق) ──
{
  const cache = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  const dirs = fs.existsSync(cache) ? fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort() : [];
  if (dirs.length) {
    const app = path.join(cache, dirs.at(-1), 'chrome-mac-arm64', 'Google Chrome for Testing.app');
    const cs = await run('/usr/bin/codesign', { args: ['-dv', '--verbose=2', app] });
    const sp = await run('/usr/sdk/bin/true').catch(() => null);
    const spc = await run('/usr/sbin/spctl', { args: ['--assess', '--type', 'execute', '-vv', app] });
    const xa = await run('/usr/bin/xattr', { args: ['-l', app] });
    const du = await run(`du -sm "${path.join(cache, dirs.at(-1))}" | cut -f1`);
    const bin = path.join(app, 'Contents', 'MacOS', 'Google Chrome for Testing');
    const v = await run(bin, { args: ['--version'], env: baseEnv(), timeout: 30 });
    out.chromium = { dir: dirs.at(-1), sizeMB: Number(du.out.trim()), quarantine: /quarantine/.test(xa.out), signature: (cs.err.match(/Signature=(.*)/) ?? [])[1] ?? null, authority: (cs.err.match(/Authority=(.*)/) ?? [])[1] ?? null, teamId: (cs.err.match(/TeamIdentifier=(.*)/) ?? [])[1] ?? null, flags: (cs.err.match(/flags=([^ ]+)/) ?? [])[1] ?? null, spctl: `${spc.code}: ${excerpt((spc.out + spc.err).trim().split('\n').at(-1) ?? '', 160)}`, runs: v.code === 0, version: v.out.trim() };
    void sp;
    console.log(`• Chromium: ${out.chromium.version} sig=${out.chromium.signature} authority=${out.chromium.authority} team=${out.chromium.teamId} quarantine=${out.chromium.quarantine} spctl=${out.chromium.spctl.slice(0, 70)} size=${out.chromium.sizeMB}MB`);
  }
}

// ── (1) هل يضع التنزيل البرمجي سمة الحجر؟ Node https (كما في C-11) وcurl ──
{
  const dir = tmpdir('ayar-e20-dl');
  const url = 'https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_checksums.txt';
  const nodeFile = path.join(dir, 'via-node.txt');
  await new Promise((resolve, reject) => {
    const get = (u, redirects = 0) => https.get(u, { headers: { 'user-agent': 'ayar-e20' } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && redirects < 5) { res.resume(); return get(res.headers.location, redirects + 1); }
      const ws = fs.createWriteStream(nodeFile); res.pipe(ws); ws.on('finish', resolve); ws.on('error', reject);
    }).on('error', reject);
    get(url);
  });
  const curlFile = path.join(dir, 'via-curl.txt');
  await run('/usr/bin/curl', { args: ['-sSL', '-o', curlFile, url], timeout: 60 });
  for (const [how, f] of [['Node https → fs.createWriteStream (طريقة C-11)', nodeFile], ['curl -o', curlFile]]) {
    const xa = await run('/usr/bin/xattr', { args: ['-l', f] });
    out.downloadQuarantine.push({ how, bytes: fs.statSync(f).size, quarantine: /quarantine/.test(xa.out), xattrs: xa.out.trim().split('\n').map((l) => l.split(':')[0]).filter(Boolean) });
    console.log(`• download via ${how}: quarantine=${/quarantine/.test(xa.out)} xattrs=${out.downloadQuarantine.at(-1).xattrs.join(',') || '—'}`);
  }
  rmrf(dir);
}

// ── (2) نسخة موسومة بالحجر يدويًّا: تقييم spctl فقط (دون تشغيل، لتجنب حوار Gatekeeper) ──
{
  const dir = tmpdir('ayar-e20-q');
  for (const [name, src] of [['gitleaks (ad-hoc linker-signed)', path.join(DEV2_CACHE, 'gitleaks', 'bin', 'gitleaks')], ['osv-scanner', path.join(TC_HOME, 'bin', 'osv-scanner')]]) {
    if (!fs.existsSync(src)) continue;
    const q = path.join(dir, path.basename(src));
    fs.copyFileSync(src, q); fs.chmodSync(q, 0o755);
    const before = await run('/usr/sbin/spctl', { args: ['--assess', '--type', 'execute', '-vv', q] });
    await run('/usr/bin/xattr', { args: ['-w', 'com.apple.quarantine', `0083;${Math.floor(Date.now() / 1000).toString(16)};AYAR-E20;`, q] });
    const after = await run('/usr/sbin/spctl', { args: ['--assess', '--type', 'execute', '-vv', q] });
    const xa = await run('/usr/bin/xattr', { args: ['-p', 'com.apple.quarantine', q] });
    await run('/usr/bin/xattr', { args: ['-d', 'com.apple.quarantine', q] });
    const stripped = await run('/usr/bin/xattr', { args: ['-l', q] });
    out.quarantinedAssessment.push({ name, spctlBefore: `${before.code}: ${excerpt((before.out + before.err).trim(), 160)}`, quarantineSet: xa.out.trim(), spctlAfter: `${after.code}: ${excerpt((after.out + after.err).trim(), 160)}`, strippedOk: !/quarantine/.test(stripped.out) });
    console.log(`• quarantined ${name}: before=[${out.quarantinedAssessment.at(-1).spctlBefore}] after=[${out.quarantinedAssessment.at(-1).spctlAfter}] stripped=${out.quarantinedAssessment.at(-1).strippedOk}`);
  }
  rmrf(dir);
}

// ── النظام ──
{
  const sw = await run('sw_vers -productVersion');
  const gk = await run('/usr/sbin/spctl', { args: ['--status'] });
  out.system = { macOS: sw.out.trim(), gatekeeper: (gk.out + gk.err).trim() };
}
writeJson(path.join(results, 'run.json'), out);
console.log(`\nكُتب ${path.join(results, 'run.json')}`);
