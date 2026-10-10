// E-17: فتح الملف في المحرر عند السطر (الخطة 22؛ decisions.md E-17: الافتراضي `open`، وقوالب VS Code وCursor وZed وXcode
// لما يُكتشف مثبتًا). على جهاز المالك: كشف المحررات (معرّفات الحزم ومسارات /Applications وأوامر سطر الأوامر)، والتطبيق
// الافتراضي لأنواع الملفات (NSWorkspace)، وتجربة `xed -l` و`open` فعليًّا، وVS Code 1.141.0 منزَّلًا في مجلد خارج المستودع
// (دون /Applications ودون جعله افتراضيًّا، ببيانات مستخدم مؤقتة) لتجربة قالب `--goto`. التحقق البصري من السطر المحدد يحتاج
// الشاشة، فيُسجَّل طلبًا للمالك.
//   node spikes/E-17-editor/run.mjs [--no-vscode]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DEV2_CACHE, baseEnv, excerpt, resultsDir, rmrf, run, sha256File, tmpdir, writeJson } from '../_lib-dev2/lib.mjs';

const results = resultsDir(import.meta.url);
const noVscode = process.argv.includes('--no-vscode');
const out = { at: new Date().toISOString(), detection: {}, defaults: {}, templates: {}, trials: [], needsScreen: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1) الكشف ──
const editors = {
  xcode: { bundle: 'com.apple.dt.Xcode', app: '/Applications/Xcode.app', cli: ['/usr/bin/xed'] },
  vscode: { bundle: 'com.microsoft.VSCode', app: '/Applications/Visual Studio Code.app', cli: ['/usr/local/bin/code', '/opt/homebrew/bin/code'] },
  cursor: { bundle: 'com.todesktop.230313mzl4w4u92', app: '/Applications/Cursor.app', cli: ['/usr/local/bin/cursor', '/opt/homebrew/bin/cursor'] },
  zed: { bundle: 'dev.zed.Zed', app: '/Applications/Zed.app', cli: ['/usr/local/bin/zed', '/opt/homebrew/bin/zed'] },
};
for (const [name, e] of Object.entries(editors)) {
  const md = await run('/usr/bin/mdfind', { args: [`kMDItemCFBundleIdentifier == '${e.bundle}'`], timeout: 20 });
  const found = md.out.trim().split('\n').filter(Boolean).filter((p) => !p.includes('/.cache/'));
  out.detection[name] = { bundleId: e.bundle, mdfind: found, appPath: fs.existsSync(e.app), cli: e.cli.filter((c) => fs.existsSync(c)), version: null };
  if (name === 'xcode' && fs.existsSync(e.app)) out.detection[name].version = (await run('/usr/bin/xcodebuild', { args: ['-version'] })).out.trim().replace(/\n/g, ' · ');
  console.log(`• ${name}: app=${out.detection[name].appPath} mdfind=${found.length} cli=${out.detection[name].cli.join(',') || '—'} ${out.detection[name].version ?? ''}`);
}

// ── 2) التطبيق الافتراضي لأنواع الملفات (NSWorkspace، بلا فتح) ──
{
  const sw = tmpdir('ayar-e17-swift');
  const src = path.join(sw, 'default.swift');
  fs.writeFileSync(src, `import AppKit\nfor arg in CommandLine.arguments.dropFirst() {\n  let url = URL(fileURLWithPath: arg)\n  if let app = NSWorkspace.shared.urlForApplication(toOpen: url) { print("\\(arg) -> \\(app.path)") } else { print("\\(arg) -> (none)") }\n}\n`);
  const probeDir = tmpdir('ayar-e17-files');
  const files = { ts: path.join(probeDir, 'sample.ts'), md: path.join(probeDir, 'sample.md'), py: path.join(probeDir, 'sample.py'), json: path.join(probeDir, 'sample.json') };
  fs.writeFileSync(files.ts, 'export const a = 1;\nexport const b = 2;\nexport const target = "السطر الثالث";\nexport const d = 4;\n');
  fs.writeFileSync(files.md, '# عنوان\n\nسطر ثانٍ\n\nسطر **ثالث**\n');
  fs.writeFileSync(files.py, 'a = 1\nb = 2\ntarget = "السطر الثالث"\n');
  fs.writeFileSync(files.json, '{\n  "a": 1,\n  "target": 3\n}\n');
  const r = await run('/usr/bin/swift', { args: [src, ...Object.values(files)], env: baseEnv({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }), timeout: 120 });
  out.defaults = { exit: r.code, map: Object.fromEntries(r.out.trim().split('\n').filter(Boolean).map((l) => { const [f, app] = l.split(' -> '); return [path.extname(f).slice(1), app]; })), err: excerpt(r.err, 300) };
  console.log('• defaults:', JSON.stringify(out.defaults.map));
  out._files = files; out._probeDir = probeDir; rmrf(sw);
}

// ── 3) القوالب (المراجع الرسمية) ──
out.templates = {
  default: { cmd: 'open <file>', note: 'التطبيق الافتراضي لنوع الملف (LaunchServices)؛ لا يحمل سطرًا. ومع -t محرر النصوص الافتراضي', ref: 'man open' },
  xcode: { cmd: 'xed --line <N> <file>', note: 'يحدد السطر بعد الفتح؛ -b يبقي Xcode في الخلفية', ref: 'xed --help (Xcode 27: -l, --line <number> Select line <number> after opening file)' },
  vscode: { cmd: 'code --goto <file>:<line>[:<col>]', note: 'أو code -g', ref: 'https://code.visualstudio.com/docs/configure/command-line (--goto)' },
  cursor: { cmd: 'cursor --goto <file>:<line>[:<col>]', note: 'واجهة سطر أوامر متوافقة مع VS Code', ref: 'https://docs.cursor.com/… (cursor CLI مشتق من code)' },
  zed: { cmd: 'zed <file>:<line>[:<col>]', note: 'الصيغة path:line:column في الوسيط نفسه', ref: 'https://zed.dev/docs/getting-started (zed path:line:column)' },
};

// ── 4) التجارب الفعلية ──
const files = out._files; delete out._files;
const xcodeRunningBefore = (await run('/usr/bin/pgrep', { args: ['-x', 'Xcode'] })).code === 0;
{ // xed -l 3 -b (Xcode في الخلفية)
  const t0 = Date.now();
  const r = await run('/usr/bin/xed', { args: ['-l', '3', '-b', files.ts], env: baseEnv(), timeout: 90 });
  await sleep(2000);
  const running = (await run('/usr/bin/pgrep', { args: ['-x', 'Xcode'] })).code === 0;
  out.trials.push({ name: 'xed --line 3 -b sample.ts', exit: r.code, ms: Date.now() - t0, xcodeRunningBefore, xcodeRunningAfter: running, err: excerpt(r.err, 200), verified: 'الإطلاق والخروج 0؛ أما تحديد السطر 3 فيحتاج النظر إلى الشاشة' });
  out.needsScreen.push('Xcode: هل الملف sample.ts مفتوح والسطر 3 («السطر الثالث») محدد؟');
  console.log(`• xed: exit=${r.code} xcode before=${xcodeRunningBefore} after=${running}`);
}
{ // open -g (الافتراضي، في الخلفية)
  const t0 = Date.now();
  const r = await run('/usr/bin/open', { args: ['-g', files.md], env: baseEnv(), timeout: 60 });
  out.trials.push({ name: 'open -g sample.md', exit: r.code, ms: Date.now() - t0, defaultApp: out.defaults.map?.md ?? null, err: excerpt(r.err, 200) });
  out.needsScreen.push(`open: هل فُتح sample.md في ${path.basename(out.defaults.map?.md ?? 'التطبيق الافتراضي')}؟`);
  console.log(`• open: exit=${r.code} → ${out.defaults.map?.md}`);
}
if (!noVscode) { // VS Code 1.141.0 منزَّل خارج المستودع، ببيانات مستخدم مؤقتة
  const dir = path.join(DEV2_CACHE, 'editors'); fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, 'VSCode-darwin-arm64-1.141.0.zip');
  const app = path.join(dir, 'Visual Studio Code.app');
  const dl = { url: 'https://update.code.visualstudio.com/1.141.0/darwin-arm64/stable', already: fs.existsSync(app) };
  if (!dl.already) {
    const t0 = Date.now();
    const c = await run('/usr/bin/curl', { args: ['-sSL', '-o', zip, dl.url], timeout: 900 });
    dl.curlExit = c.code; dl.ms = Date.now() - t0; dl.bytes = fs.existsSync(zip) ? fs.statSync(zip).size : 0; dl.sha256 = fs.existsSync(zip) ? sha256File(zip) : null;
    if (c.code === 0) { const u = await run('/usr/bin/ditto', { args: ['-x', '-k', zip, dir], timeout: 300 }); dl.unzipExit = u.code; }
    const xa = await run('/usr/bin/xattr', { args: ['-l', app] }); dl.quarantine = /quarantine/.test(xa.out);
  }
  const code = path.join(app, 'Contents', 'Resources', 'app', 'bin', 'code');
  const trial = { name: 'VS Code 1.141.0 (منزَّل) · code --goto sample.ts:3:5', download: dl };
  if (fs.existsSync(code)) {
    const ud = tmpdir('ayar-e17-vscode-user'); const ext = tmpdir('ayar-e17-vscode-ext');
    const cs = await run('/usr/bin/codesign', { args: ['-dv', app] }); trial.signature = (cs.err.match(/Authority=(.*)/) ?? [])[1] ?? excerpt(cs.err, 120);
    const v = await run(code, { args: ['--version', '--user-data-dir', ud, '--extensions-dir', ext], env: baseEnv(), timeout: 120 });
    trial.version = v.out.trim().split('\n'); trial.versionExit = v.code;
    const t0 = Date.now();
    const child = spawn(code, ['--goto', `${files.ts}:3:5`, '--new-window', '--disable-extensions', '--disable-workspace-trust', '--user-data-dir', ud, '--extensions-dir', ext], { env: baseEnv(), detached: true, stdio: 'ignore' });
    const exited = await Promise.race([new Promise((r) => child.on('exit', (c) => r(c))), sleep(15000).then(() => 'still-running')]);
    // الملف التنفيذي الرئيسي لـ VS Code هو Contents/MacOS/Code (لا Electron)
    const mainBin = `${app}/Contents/MacOS/Code`;
    const running = (await run('/usr/bin/pgrep', { args: ['-f', mainBin] })).code === 0;
    trial.goto = { cliExit: exited, ms: Date.now() - t0, appRunningAfter: running };
    out.needsScreen.push('VS Code (المنزَّل): هل فُتح sample.ts والمؤشر عند السطر 3 العمود 5؟');
    // نترك النافذة ثوانٍ ثم نغلق النسخة المؤقتة (ليست تطبيق المالك) بكل عملياتها المساعدة
    await sleep(6000);
    await run('/usr/bin/pkill', { args: ['-f', `${app}/Contents/`] });
    await sleep(1500);
    if ((await run('/usr/bin/pgrep', { args: ['-f', `${app}/Contents/`] })).code === 0) { await run('/usr/bin/pkill', { args: ['-9', '-f', `${app}/Contents/`] }); await sleep(1000); }
    trial.closed = (await run('/usr/bin/pgrep', { args: ['-f', `${app}/Contents/`] })).code !== 0;
    rmrf(ud); rmrf(ext);
    console.log(`• vscode: version=${trial.version?.[0]} goto exit=${exited} running=${running} closed=${trial.closed}`);
  } else trial.error = 'لم يُنزَّل أو لم يُفك';
  out.trials.push(trial);
}
out.ownerRequest = { steps: out.needsScreen.length, minutes: 2, text: `تحقق بصري (${out.needsScreen.length} خطوات، نحو دقيقتين): ${out.needsScreen.join(' · ')}` };
writeJson(path.join(results, 'run.json'), out);
console.log(`\nكُتب ${path.join(results, 'run.json')}\nيحتاج الشاشة: ${out.needsScreen.join(' | ')}`);
