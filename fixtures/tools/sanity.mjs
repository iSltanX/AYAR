#!/usr/bin/env node
// مشغّل «سلامة المشاريع» (DEV-1، المهمة 10): يشغّل الأداة الأصلية على كل نسخة ويقارن بما يعلنه مشروعها.
//
//   node fixtures/tools/sanity.mjs run <FX-X> [نسخة ...]   # يشغّل ويحفظ النتائج في fixtures/sanity-results/<FX-X>.json
//   node fixtures/tools/sanity.mjs report                  # يبني fixtures/SANITY.md من النتائج المحفوظة
//
// كل مشروع يعلن تشغيلاته في FX-X/sanity.mjs (default export):
//   { setup: 'أمر', versions: { اسم: 'أمر' }, variants: { نسخة: [ { id, cmd, exit, match?, nomatch?, proves, timeout_s?, env?, soft? } ] } }
//   - exit: رمز الخروج المتوقع (رقم أو مصفوفة). وmatch: تعابير نمطية يجب أن تظهر في الخرج، وnomatch: يجب ألا تظهر.
//   - pending: { id, proves, reason } يسجَّل «لم يُشغَّل» بسببه.
// تُركَّب كل نسخة في مجلد مؤقت خارج المستودع (G-09)، ويُحذف بعد التشغيل.
// الأدوات: يُفترض أن PATH فيه node/pnpm، وتُضاف مجلدات صندوق الأدوات (fixtures/tools/toolchain.json).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { FIXTURES_ROOT, materialize, readJson } from './materialize.mjs';

const RESULTS = path.join(FIXTURES_ROOT, 'sanity-results');
const toolchain = readJson(path.join(FIXTURES_ROOT, 'tools', 'toolchain.json'));
const TC_HOME = (toolchain.home ?? '').replace(/^~/, os.homedir());

export function toolPath() {
  const extra = [path.dirname(process.execPath), ...(toolchain.path_dirs ?? []).map((d) => d.replace(/^~/, os.homedir()))];
  return [...extra, process.env.PATH].join(path.delimiter);
}

function sh(cmd, cwd, { env = {}, timeout = 180 } = {}) {
  const t0 = Date.now();
  const r = spawnSync('/bin/sh', ['-c', cmd], {
    cwd, encoding: 'utf8', timeout: timeout * 1000, maxBuffer: 64 * 1024 * 1024, killSignal: 'SIGKILL',
    env: { ...process.env, PATH: toolPath(), CI: '1', NO_COLOR: '1', FORCE_COLOR: '0', AYAR_FX_HOME: TC_HOME, FX_TOOLS: path.join(FIXTURES_ROOT, 'tools'), ...env },
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return { code: r.status ?? (r.signal ? `signal:${r.signal}` : null), out, ms: Date.now() - t0, timedOut: r.error?.code === 'ETIMEDOUT' };
}

function excerpt(out, max = 1800) {
  const clean = out.replace(/\u001b\[[0-9;]*m/g, '').trim();
  if (clean.length <= max) return clean;
  const half = Math.floor(max / 2);
  return `${clean.slice(0, half)}\n… [اقتُطع] …\n${clean.slice(-half)}`;
}

async function runProject(id, only) {
  const spec = (await import(pathToFileURL(path.join(FIXTURES_ROOT, id, 'sanity.mjs')))).default;
  fs.mkdirSync(RESULTS, { recursive: true });
  const file = path.join(RESULTS, `${id}.json`);
  const saved = fs.existsSync(file) ? readJson(file) : { project: id, variants: {} };
  saved.date = new Date().toISOString().slice(0, 10);
  const versions = {};
  for (const [name, cmd] of Object.entries(spec.versions ?? {})) {
    const r = sh(cmd, os.tmpdir());
    versions[name] = r.out.split('\n').find((l) => l.trim())?.trim() ?? '?';
  }
  saved.versions = { ...(saved.versions ?? {}), ...versions };
  let bad = 0;
  for (const [variant, runs] of Object.entries(spec.variants)) {
    if (only.length && !only.includes(variant)) continue;
    const base = fs.mkdtempSync(path.join(os.tmpdir(), `ayar-fx-sanity-${id}-`));
    const dir = path.join(base, 'p');
    const rec = [];
    try {
      materialize(id, variant, dir);
      const needSetup = runs.some((r) => !r.pending);
      if (needSetup && spec.setup) {
        const s = sh(spec.setup, dir, { timeout: 600 });
        if (s.code !== 0) { rec.push({ id: 'setup', cmd: spec.setup, ok: false, code: s.code, proves: 'تجهيز التبعيات', excerpt: excerpt(s.out) }); bad++; }
      }
      if (!rec.length) {
        for (const r of runs) {
          if (r.pending) { rec.push({ id: r.id, ok: true, pending: true, proves: r.proves, reason: r.reason }); continue; }
          const res = sh(r.cmd, dir, { env: r.env, timeout: r.timeout_s ?? 180 });
          const wantExit = Array.isArray(r.exit) ? r.exit : [r.exit ?? 0];
          const problems = [];
          if (!wantExit.includes(res.code)) problems.push(`رمز الخروج ${res.code} بدل ${wantExit.join('|')}`);
          for (const m of r.match ?? []) if (!new RegExp(m, 'mu').test(res.out)) problems.push(`لم يظهر في الخرج: ${m}`);
          for (const m of r.nomatch ?? []) if (new RegExp(m, 'mu').test(res.out)) problems.push(`ظهر في الخرج ما لا يجوز: ${m}`);
          if (r.after) { const a = r.after(dir, res); if (a) problems.push(a); }
          const ok = problems.length === 0;
          if (!ok) bad++;
          rec.push({ id: r.id, cmd: r.cmd, ok, code: res.code, ms: res.ms, proves: r.proves, problems, excerpt: excerpt(res.out, r.excerpt ?? 1200) });
          console.log(`${ok ? '✓' : '✗'} ${id}/${variant}/${r.id} (exit ${res.code})${ok ? '' : ` — ${problems.join('; ')}`}`);
        }
      }
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
    saved.variants[variant] = rec;
  }
  fs.writeFileSync(file, `${JSON.stringify(saved, null, 2)}\n`);
  if (bad) { console.error(`\n${bad} فحص سلامة أخفق في ${id}`); process.exitCode = 1; }
  else console.log(`\nنجحت كل فحوص السلامة في ${id}`);
}

function report() {
  const files = fs.existsSync(RESULTS) ? fs.readdirSync(RESULTS).filter((f) => f.endsWith('.json')).sort() : [];
  const out = [];
  out.push('# سلامة المشاريع: نتيجة تشغيل كل نسخة بأداتها الأصلية', '',
    '> مولَّد آليًّا بـ `node fixtures/tools/sanity.mjs report` من `fixtures/sanity-results/*.json`، ولا يُحرَّر يدويًّا. كل صف: الأمر الحرفي، ورمز الخروج الفعلي، وما يثبته. «✓» يعني أن الخرج الفعلي طابق ما يعلنه ملف التوقع، و«⏸» يعني «لم يُشغَّل» بسببه.', '');
  for (const f of files) {
    const d = readJson(path.join(RESULTS, f));
    out.push(`## ${d.project}`, '', `تاريخ آخر تشغيل: ${d.date}`, '');
    out.push('الأدوات: ' + Object.entries(d.versions ?? {}).map(([k, v]) => `${k} \`${v}\``).join('، '), '');
    for (const [variant, runs] of Object.entries(d.variants)) {
      out.push(`### ${variant}`, '', '| الفحص | الأمر | الخروج | النتيجة | ما يثبته |', '|---|---|---|---|---|');
      for (const r of runs) {
        const cmd = r.pending ? '—' : `\`${(r.cmd ?? '').replace(/\|/g, '\\|')}\``;
        const st = r.pending ? `⏸ لم يُشغَّل: ${r.reason}` : r.ok ? '✓' : `✗ ${r.problems?.join('؛ ') ?? ''}`;
        out.push(`| ${r.id} | ${cmd} | ${r.pending ? '—' : r.code} | ${st} | ${r.proves ?? ''} |`);
      }
      out.push('');
      const evid = runs.filter((r) => !r.pending && r.excerpt && (r.evidence || !r.ok));
      for (const r of evid) out.push('<details><summary>' + r.id + '</summary>', '', '```text', r.excerpt, '```', '', '</details>', '');
    }
  }
  fs.writeFileSync(path.join(FIXTURES_ROOT, 'SANITY.md'), `${out.join('\n')}\n`);
  console.log(`كُتب fixtures/SANITY.md من ${files.length} مشروع`);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'run' && args[0]) await runProject(args[0], args.slice(1));
else if (cmd === 'report') report();
else { console.error('الاستخدام: sanity.mjs run <FX-X> [نسخة ...] | sanity.mjs report'); process.exit(2); }
