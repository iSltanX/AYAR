// E-07 (5): مراسل JUnit في node:test بحسب نسخة Node المكتشفة (C-15 صف node:test): هل `--test-reporter=junit` مع
// `--test-reporter-destination=<ملف>` يعمل في Node 20.20.2 و24.14.0 و24.16.0 (nvm) و24.18.1 (Homebrew)، ومع مراسل ثانٍ إلى stdout.
//   node spikes/E-07-toolchains/node-test-reporters.mjs
import fs from 'node:fs';
import path from 'node:path';
import { NVM_NODE, baseEnv, excerpt, materialize, resultsDir, rmrf, run, tmpdir, writeJson } from '../_lib-dev2/lib.mjs';

const results = resultsDir(import.meta.url);
const nodes = ['/opt/homebrew/bin/node', ...fs.readdirSync(NVM_NODE).sort().map((v) => path.join(NVM_NODE, v, 'bin', 'node'))].filter((p) => fs.existsSync(p));
const out = { at: new Date().toISOString(), runs: [] };
for (const kind of ['good', 'node-test--bad', 'node-test--no-inputs']) {
  const { base, root } = await materialize('FX-ADAPTERS', kind, 'ayar-e07nt');
  const dir = path.join(root, 'node-test');
  for (const node of nodes) {
    const R = tmpdir('ayar-e07nt-r');
    const r = await run(node, { args: ['--test', '--test-reporter=junit', `--test-reporter-destination=${path.join(R, 'junit.xml')}`, '--test-reporter=spec', '--test-reporter-destination=stdout'], cwd: dir, env: baseEnv(), timeout: 60 });
    const junit = path.join(R, 'junit.xml');
    const xml = fs.existsSync(junit) ? fs.readFileSync(junit, 'utf8') : null;
    const row = { node: node.replaceAll(process.env.HOME, '~'), version: (await run(node, { args: ['--version'] })).out.trim(), variant: kind, exit: r.code, ms: r.ms, junit: xml ? { bytes: xml.length, testsuites: /<testsuites/.test(xml), tests: xml.match(/tests="(\d+)"/)?.[1], failures: xml.match(/failures="(\d+)"/)?.[1] } : null, stdoutHead: excerpt(r.out, 300), stderr: excerpt(r.err, 300) };
    out.runs.push(row);
    console.log(`• ${row.version} / ${kind}: exit=${r.code} junit=${JSON.stringify(row.junit)}`);
    rmrf(R);
  }
  rmrf(base);
}
writeJson(path.join(results, 'node-test-reporters.json'), out);
