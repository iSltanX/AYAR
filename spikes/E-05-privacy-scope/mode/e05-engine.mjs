// E-05 engine side: discovery (walk + read every file) and a test run (child process) in a project.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function walk(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p); else if (e.isFile()) out.push(p);
    }
  }
  return out;
}

export const handlers = {
  'e05.discover': ({ root }) => {
    const t = performance.now();
    try {
      const files = walk(root);
      for (const f of files) fs.readFileSync(f);
      return { ok: true, files: files.length, ms: Math.round(performance.now() - t) };
    } catch (e) {
      return { ok: false, code: e.code ?? String(e.message), ms: Math.round(performance.now() - t) };
    }
  },
  'e05.test': ({ root }) => new Promise((resolve) => {
    const t = performance.now();
    const child = spawn('/bin/sh', ['test/run.sh'], { cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => resolve({ ok: false, code: e.code, ms: Math.round(performance.now() - t) }));
    child.on('close', (code) => resolve({ ok: code === 0 && out.includes('PROBE_TEST_OK'), exit: code, out: out.trim().slice(0, 300), ms: Math.round(performance.now() - t) }));
  }),
};
