#!/usr/bin/env node
// مولّد FX-MALICIOUS (DEV-1، المهمة 7): يبني مستودع Git مفخخًا في مجلد مؤقت خارج مستودع عِيَار وقت الاختبار.
//
//   node fixtures/tools/malicious/generate.mjs --out <مجلد-فارغ> [--markers <مجلد>] [--huge-mb 300] [--no-traps]
//
// قاعدة الأمان (الخطة D-38، AGENTS.md 6.1): هذا المولّد لا يستدعي `git` إطلاقًا، لا قبل ضبط الفخاخ ولا بعده:
// كائنات Git (blob وtree وcommit) تُكتب مباشرة بـ zlib وSHA-1، فلا يمر أي أمر على المستودع المولَّد.
// ولا يستورد child_process أصلًا (يتحقق منه اختبار المولّد test.mjs).
//
// المخرجات تحت --out:
//   repo/        المستودع المفخخ (شجرة العمل + .git)
//   outside/     مجلد شقيق للجذر يشير إليه الرابط الرمزي repo/external
//   markers/     (أو --markers) المكان الذي ستكتب فيه الفخاخ ملفات علامة إن نُفِّذت؛ يجب أن يبقى فارغًا
//   MANIFEST.json  وصف الفخاخ ومسارات العلامات وقيم الأسرار المصطنعة
// --no-traps: يبني المستودع نفسه (الكائنات والمراجع نفسها) بلا فخاخ في .git/config، لاختبار صحة بنيته بأوامر git آمنة.
//
// كل الأسرار مصطنعة بصيغة مفتاح API عامة، وليست أسرارًا حقيقية.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : fallback; };
const out = opt('out');
if (!out) { console.error('الاستخدام: generate.mjs --out <مجلد> [--markers <مجلد>] [--huge-mb N] [--no-traps]'); process.exit(2); }
const noTraps = argv.includes('--no-traps');
const hugeMb = Number(opt('huge-mb', '300'));
const root = path.resolve(out);
const repo = path.join(root, 'repo');
const outside = path.join(root, 'outside');
const markers = path.resolve(opt('markers', path.join(root, 'markers')));

// ── أسرار مصطنعة معروفة للاختبار ──
export const SECRETS = {
  env: 'ayr_env_7c1d4a9e0b6f2835d1c47a9e3b50f628',
  history: 'ayr_hist_2b6e90d4c8a1f7355e0a9c3d71b84f26',
  outside: 'ayr_outside_91e3a5c7d2f40b68a1c9e3d57f20b486',
};

// ── محتوى شجرة العمل ──
const files = new Map([
  ['README.md', '# مستودع مفخخ للاختبار (FX-MALICIOUS)\n\nيولَّد وقت الاختبار ولا يُلتزم. لا تشغّل `git` داخله.\n'],
  ['.gitignore', '.env\n'],
  ['.gitattributes', '*.js diff=evildiff\n*.py diff=eviltext\n'],
  ['src/app.js', "// ملف JavaScript صغير تعمل عليه الفحوص الساكنة.\nexport function run(code) {\n  return eval(code);\n}\n\nexport function add(a, b) {\n  return a + b;\n}\n"],
  ['src/util.py', '"""ملف Python صغير تعمل عليه الفحوص الساكنة."""\nimport subprocess\n\n\ndef run(cmd: str) -> int:\n    return subprocess.call(cmd, shell=True)\n\n\ndef double(n: int) -> int:\n    return n * 2\n'],
]);
const oldSecretFile = ['config/old-credentials.js', `// مفتاح مصطنع لمشروع اختبار عِيَار؛ ليس سرًّا حقيقيًّا.\nexport const API_KEY = '${SECRETS.history}';\n`];

// ── كتابة كائنات Git مباشرة (بلا استدعاء git) ──
const objects = path.join(repo, '.git', 'objects');
function writeObject(type, body) {
  const header = Buffer.from(`${type} ${body.length}\0`);
  const full = Buffer.concat([header, body]);
  const sha = crypto.createHash('sha1').update(full).digest('hex');
  const dir = path.join(objects, sha.slice(0, 2));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, sha.slice(2));
  if (!fs.existsSync(file)) fs.writeFileSync(file, zlib.deflateSync(full), { mode: 0o444 });
  return sha;
}
function writeTree(entries) {
  // entries: Map(path → Buffer)، تُبنى الأشجار المتداخلة وفق ترتيب Git (الاسم، والمجلد باللاحقة «/»)
  const level = new Map();
  for (const [p, content] of entries) {
    const [head, ...rest] = p.split('/');
    if (rest.length === 0) level.set(head, { mode: '100644', content });
    else {
      if (!level.has(head)) level.set(head, { mode: '40000', sub: new Map() });
      level.get(head).sub.set(rest.join('/'), content);
    }
  }
  const rows = [...level.entries()].map(([name, v]) => {
    const sha = v.sub ? writeTree(v.sub) : writeObject('blob', Buffer.from(v.content));
    return { name, mode: v.mode, sha, key: v.sub ? `${name}/` : name };
  });
  rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return writeObject('tree', Buffer.concat(rows.map((r) => Buffer.concat([Buffer.from(`${r.mode} ${r.name}\0`), Buffer.from(r.sha, 'hex')]))));
}
function writeCommit(tree, parent, message, when) {
  const ident = `AYAR Fixture <fixture@ayar.local> ${when} +0000`;
  const lines = [`tree ${tree}`, ...(parent ? [`parent ${parent}`] : []), `author ${ident}`, `committer ${ident}`, '', message, ''];
  return writeObject('commit', Buffer.from(lines.join('\n')));
}

fs.mkdirSync(path.join(repo, '.git', 'refs', 'heads'), { recursive: true });
fs.mkdirSync(path.join(repo, '.git', 'objects', 'info'), { recursive: true });
fs.mkdirSync(path.join(repo, '.git', 'objects', 'pack'), { recursive: true });
const t0 = 1767225600; // 2026-01-01T00:00:00Z
const first = new Map([...files, oldSecretFile]);
const c1 = writeCommit(writeTree(first), null, 'التزام أول: يضم ملفًّا فيه مفتاح مصطنع', t0);
const c2 = writeCommit(writeTree(files), c1, 'حذف ملف المفتاح من الشجرة (يبقى في التاريخ)', t0 + 3600);
fs.writeFileSync(path.join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n');
fs.writeFileSync(path.join(repo, '.git', 'refs', 'heads', 'main'), `${c2}\n`);

// ── شجرة العمل ──
for (const [rel, content] of files) {
  const p = path.join(repo, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}
fs.writeFileSync(path.join(repo, '.env'), `# قيمة مصطنعة لمشروع اختبار عِيَار\nAYAR_FAKE_ENV_SECRET=${SECRETS.env}\n`);
fs.mkdirSync(outside, { recursive: true });
fs.writeFileSync(path.join(outside, 'outside-secret.txt'), `خارج الجذر (مصطنع): ${SECRETS.outside}\n`);
fs.symlinkSync(path.join('..', 'outside'), path.join(repo, 'external'));
const hugeFd = fs.openSync(path.join(repo, 'huge.bin'), 'w');
fs.ftruncateSync(hugeFd, hugeMb * 1024 * 1024); // ملف متناثر: حجمه كبير وقرصه صفر تقريبًا
fs.closeSync(hugeFd);

// ── الفخاخ: آخر خطوة، وبعدها لا يلمس المولّد المستودع بأي أمر ──
fs.mkdirSync(markers, { recursive: true });
const sq = (s) => `'${s.replace(/'/g, `'\\''`)}'`; // اقتباس لصدفة sh
const marker = (name) => path.join(markers, `${name}.marker`);
// قيمة في ملف إعداد Git: تُحاط بعلامتي اقتباس مزدوجتين وتُهرَّب فيها \ و" كي لا تُفسَّر ; أو # تعليقًا
const cfg = (v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const fsmonitorCmd = `sh -c ${sq(`echo "$$" > ${sq(marker('fsmonitor'))}; exit 0`)} sh`;
const diffCmd = `sh -c ${sq(`echo "$$" > ${sq(marker('diff-driver'))}; exit 0`)} sh`;
const textconvCmd = `sh -c ${sq(`echo "$$" > ${sq(marker('textconv'))}; cat "$1"`)} sh`;
const traps = [
  { id: 'fsmonitor', where: '.git/config [core] fsmonitor', marker: marker('fsmonitor'), command: fsmonitorCmd },
  { id: 'diff-driver', where: '.git/config [diff "evildiff"] command + .gitattributes *.js', marker: marker('diff-driver'), command: diffCmd },
  { id: 'textconv', where: '.git/config [diff "eviltext"] textconv + .gitattributes *.py', marker: marker('textconv'), command: textconvCmd },
];
const baseConfig = '[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n\tlogallrefupdates = true\n';
let config = baseConfig;
if (!noTraps) {
  config = `${baseConfig}\tfsmonitor = ${cfg(fsmonitorCmd)}\n`
    + `[diff "evildiff"]\n\tcommand = ${cfg(diffCmd)}\n`
    + `[diff "eviltext"]\n\ttextconv = ${cfg(textconvCmd)}\n`;
}
fs.writeFileSync(path.join(repo, '.git', 'config'), config);

fs.writeFileSync(path.join(root, 'MANIFEST.json'), `${JSON.stringify({
  generator: 'fixtures/tools/malicious/generate.mjs',
  traps_armed: !noTraps,
  repo_root: 'repo',
  head: c2,
  first_commit: c1,
  markers_dir: markers,
  traps: traps.map(({ id, where, marker: m, command }) => ({ id, where, marker: m, command })),
  fake_secrets: SECRETS,
  notes: [
    'لا يُشغَّل git داخل repo/ (D-38) إلا في تجربة E-24 بالبيئة المعزولة.',
    'external → ../outside رابط رمزي إلى خارج الجذر؛ huge.bin ملف متناثر بحجم ' + `${hugeMb}MB.`,
    'السر القديم في التزام ' + c1.slice(0, 7) + ' (config/old-credentials.js) وحُذف من شجرة التزام ' + c2.slice(0, 7) + '.',
  ],
}, null, 2)}\n`);
console.log(`generated ${repo}${noTraps ? ' (بلا فخاخ)' : ''} · HEAD ${c2.slice(0, 7)}`);
