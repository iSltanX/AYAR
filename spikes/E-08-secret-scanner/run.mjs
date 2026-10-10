// E-08 (2): Betterleaks 1.9.0 مقابل Gitleaks 8.30.1 على الأسرار المزروعة وعلى مدونة نظيفة فيها نصوص عربية:
// الكشف، والإنذارات الكاذبة، والزمن، وصيغة التقرير. الاستدعاء كما في C-15 (dir، --redact=100، --report-format json،
// --exit-code 42) ولا -v أبدًا. التحقق من التوقيعات في download.sh. المدونة تُولَّد هنا حتميًّا (بذرة ثابتة).
//   node spikes/E-08-secret-scanner/run.mjs
import fs from 'node:fs';
import path from 'node:path';
import { DEV2_CACHE, FIXTURES, baseEnv, excerpt, gitShim, materialize, resultsDir, rmrf, run, snapshot, diffSnapshot, tmpdir, writeJson } from '../_lib-dev2/lib.mjs';

const results = resultsDir(import.meta.url);
const scanners = {
  gitleaks: { bin: '/opt/homebrew/bin/gitleaks', version: 'version' },
  betterleaks: { bin: path.join(DEV2_CACHE, 'betterleaks', 'bin', 'betterleaks'), version: 'version' },
};
const out = { at: new Date().toISOString(), versions: {}, help: {}, cases: [] };
for (const [name, s] of Object.entries(scanners)) {
  out.versions[name] = (await run(s.bin, { args: [s.version] })).out.trim();
  const h = await run(s.bin, { args: ['dir', '--help'] });
  const g = await run(s.bin, { args: ['--help'] });
  out.help[name] = { v_flag: (g.out + h.out).split('\n').filter((l) => /^\s+-v\b|--verbose|--verify/.test(l)).map((l) => l.trim()), dirFlags: h.out.split('\n').filter((l) => /--(redact|report-format|report-path|exit-code|no-banner|config|max-target|follow-symlinks|gitleaks-ignore-path|no-color|enable-rule|baseline-path|max-decode|max-archive|diagnostics)/.test(l)).map((l) => l.trim().slice(0, 110)) };
}

// ── مدونة عربية نظيفة مولَّدة (60 تدوينة Markdown، وصفحات HTML، وملف قفل بـ integrity، وworkflow، وصور data: صغيرة) ──
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(7);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const words = 'عِيَار يقيس المشروع مقابل معايير معلنة ويكشف المخالفة بدليل والتصميم قبل الواجهة والمحرك عملية مستقلة والأدلة محفوظة محليًّا واللغة العربية أولًا والأرقام ٠١٢٣٤٥٦٧٨٩ والاتجاه من اليمين إلى اليسار وهذه تدوينة عن البرمجة والتصميم والاختبارات والمراجعة البشرية والنزاهة والأداء والمتانة والترخيص والتوثيق'.split(' ');
const para = (n) => Array.from({ length: n }, () => pick(words)).join(' ') + '.';
const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[Math.floor(rnd() * 16)]).join('');
const b64 = (n) => Array.from({ length: n }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'[Math.floor(rnd() * 64)]).join('');
function makeBlog(dir) {
  fs.mkdirSync(path.join(dir, 'posts'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
  for (let i = 1; i <= 60; i++) {
    const body = [`---`, `title: "${para(4)}"`, `date: 2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 27)).padStart(2, '0')}`, `tags: [عربي, برمجة, ${pick(['تصميم', 'اختبار', 'أمن'])}]`, `---`, '', `# ${para(5)}`, '', para(60), '', para(45), '',
      `> ${para(20)}`, '', '```bash', `git log --oneline -5   # ${hex(40)}`, `curl -s https://example.com/api/items?id=${hex(8)} | jq .`, `export NODE_OPTIONS=--max-old-space-size=4096`, '```', '',
      `رابط: https://example.com/${hex(6)}/مقال-${i} والبريد: كاتب${i}@example.com`, '', `معرّف فريد: ${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`, '', para(80), ''];
    if (i % 7 === 0) body.push(`![صورة](data:image/png;base64,${b64(400)})`, '');
    if (i % 11 === 0) body.push('```json', JSON.stringify({ name: 'مثال', integrity: `sha512-${b64(86)}==`, color: `#${hex(6)}` }, null, 2), '```', '');
    fs.writeFileSync(path.join(dir, 'posts', `post-${String(i).padStart(2, '0')}.md`), body.join('\n'));
  }
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>مدونة</title><style>:root{--ink:#141B20;--paper:#F7F4EC}</style></head><body><h1>${para(4)}</h1><p>${para(50)}</p><img src="data:image/png;base64,${b64(300)}"></body></html>`);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'ayar-arabic-blog', version: '1.0.0', private: true, scripts: { build: 'node build.mjs' } }, null, 2));
  const pk = { name: 'ayar-arabic-blog', version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'ayar-arabic-blog', version: '1.0.0' } } };
  for (let i = 0; i < 40; i++) pk.packages[`node_modules/pkg-${i}`] = { version: `1.${i}.0`, resolved: `https://registry.npmjs.org/pkg-${i}/-/pkg-${i}-1.${i}.0.tgz`, integrity: `sha512-${b64(86)}==` };
  fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify(pk, null, 2));
  fs.writeFileSync(path.join(dir, '.github', 'workflows', 'ci.yml'), `name: ci\non: [push]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@${hex(40)}\n      - run: npm ci\n        env:\n          NPM_TOKEN: \${{ secrets.NPM_TOKEN }}\n          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}\n`);
  fs.writeFileSync(path.join(dir, '.env.example'), 'API_KEY=\nDATABASE_URL=postgres://user:password@localhost:5432/blog\nSESSION_SECRET=change-me\n');
  fs.writeFileSync(path.join(dir, 'build.mjs'), `// يبني المدونة\nconst apiBase = 'https://example.com/api';\nconst token = process.env.API_TOKEN ?? '';\nexport default { apiBase, token };\n`);
}

const C15 = (bin, root, report, extra = []) => [bin, { args: ['dir', root, '--redact=100', '--no-banner', '--report-format', 'json', '--report-path', report, '--exit-code', '42', ...extra], env: baseEnv(), timeout: 600 }];
const parseReport = (file) => { if (!fs.existsSync(file)) return null; const txt = fs.readFileSync(file, 'utf8'); try { const j = JSON.parse(txt || '[]'); return { count: j.length, findings: j.map((f) => ({ rule: f.RuleID, file: f.File, line: f.StartLine, secretRedacted: f.Secret, fingerprintLike: Object.keys(f).filter((k) => /fingerprint/i.test(k)).map((k) => f[k]).join(',') })), keys: j[0] ? Object.keys(j[0]) : [] }; } catch { return { parseError: txt.slice(0, 200) }; } };
const shim = gitShim();
async function scanCase(name, root, { expectRules = [], config = null, note = '' } = {}) {
  const row = { name, note, expectRules, scanners: {} };
  for (const [sname, s] of Object.entries(scanners)) {
    const R = tmpdir('ayar-e08-r');
    const report = path.join(R, 'secrets.json');
    const before = snapshot(root, { skip: new Set(['node_modules', '.venv']) });
    const [bin, opts] = C15(s.bin, root, report, config ? ['--config', config] : []);
    opts.env.PATH = `${shim.dir}:${opts.env.PATH}`;
    const callsBefore = shim.calls().length;
    const r = await run(bin, opts);
    const rep = parseReport(report);
    const d = diffSnapshot(before, snapshot(root, { skip: new Set(['node_modules', '.venv']) }));
    row.scanners[sname] = { exit: r.code, ms: r.ms, report: rep, gitCalls: shim.calls().length - callsBefore, repoWrites: [...d.added, ...d.changed], stderrTail: excerpt(r.err.split('\n').slice(-3).join('\n'), 300) };
    rmrf(R);
  }
  out.cases.push(row);
  console.log(`• ${name}: ${Object.entries(row.scanners).map(([k, v]) => `${k}=exit${v.exit}/${v.report?.count ?? '∅'}/${v.ms}ms`).join('  ')}`);
}

// 1) FX-EXT secret (سر مصطنع ثابت في src/config.ts)
{ const { base, root } = await materialize('FX-EXT', 'secret', 'ayar-e08'); await scanCase('FX-EXT/secret (مزروع 1)', root, { expectRules: ['generic-api-key'], config: path.join(FIXTURES, 'tools', 'gitleaks-fixtures.toml') }); await scanCase('FX-EXT/secret بالقواعد الافتراضية (بلا إعداد)', root, { expectRules: ['generic-api-key'] }); rmrf(base); }
// 2) FX-EXT secret-in-test-log (السر يُبنى وقت التشغيل: لا يظهر حرفيًّا في الملفات)
{ const { base, root } = await materialize('FX-EXT', 'secret-in-test-log', 'ayar-e08'); await scanCase('FX-EXT/secret-in-test-log (الملفات نظيفة حرفيًّا)', root, { expectRules: [], config: path.join(FIXTURES, 'tools', 'gitleaks-fixtures.toml') }); rmrf(base); }
// 3) FX-ADAPTERS gitleaks--bad و good (بإعداد المشروع gitleaks.toml)
{ const { base, root } = await materialize('FX-ADAPTERS', 'gitleaks--bad', 'ayar-e08'); await scanCase('FX-ADAPTERS/gitleaks--bad (مزروع 1، بإعداد المشروع)', path.join(root, 'gitleaks'), { expectRules: ['generic-api-key'], config: path.join(root, 'gitleaks', 'gitleaks.toml') }); rmrf(base); }
// 4) FX-MALICIOUS: شجرة العمل (.env مصطنع، ورابط رمزي إلى خارج الجذر) — من مجلد عمل محايد، وبأداة git مزيفة أول PATH
{ const { base, root } = await materialize('FX-MALICIOUS', 'default', 'ayar-e08'); const markers = path.join(base, 'p', 'markers'); await scanCase('FX-MALICIOUS/repo (dir: .env مزروع، رابط رمزي خارج الجذر لا يُتبع)', root, { expectRules: ['generic-api-key'], note: `markers=${fs.readdirSync(markers).length}` }); out.cases.at(-1).markersAfter = fs.readdirSync(markers).length; rmrf(base); }
// 5) المدونة العربية النظيفة: بالقواعد الافتراضية ثم بإعداد fixtures (استثناء ملفات القفل)
{ const blog = tmpdir('ayar-e08-blog'); makeBlog(blog); const n = fs.readdirSync(path.join(blog, 'posts')).length; await scanCase(`مدونة عربية نظيفة (${n} تدوينة) بالقواعد الافتراضية`, blog, { expectRules: [] }); await scanCase('المدونة نفسها بإعداد fixtures (استثناء القفل)', blog, { expectRules: [], config: path.join(FIXTURES, 'tools', 'gitleaks-fixtures.toml') }); rmrf(blog); }
// 6) الزمن على مستودع اصطناعي كبير (50 ألف ملف)
{ const big = tmpdir('ayar-e08-big'); const gen = await run(process.execPath, { args: [path.join(FIXTURES, 'tools', 'synth-repo', 'generate.mjs'), '--preset', 'large', '--out', big], timeout: 300 }); out.synth = gen.out.trim().split('\n').at(-1); await scanCase('مستودع اصطناعي 50 ألف ملف (الزمن)', big, { expectRules: [] }); rmrf(big); }
rmrf(shim.dir);
writeJson(path.join(results, 'compare.json'), out);
console.log(`\nكُتب ${path.join(results, 'compare.json')}`);
