// E-04 engine side: access a project in ~/Documents from the utilityProcess and from a child process.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const file = path.join(os.homedir(), 'Documents', 'ayar-e04-probe', 'src', 'index.js');
const timed = (fn) => { const t = performance.now(); try { return { ok: true, value: fn(), ms: Math.round(performance.now() - t) }; } catch (e) { return { ok: false, code: e.code ?? String(e.message), ms: Math.round(performance.now() - t) }; } };

export const handlers = {
  'e04.read': () => timed(() => fs.readFileSync(file, 'utf8').trim()),
  'e04.childCat': () => timed(() => {
    const r = spawnSync('/bin/cat', [file], { encoding: 'utf8' });
    if (r.status !== 0) throw Object.assign(new Error(r.stderr.trim()), { code: `exit ${r.status}: ${r.stderr.trim()}` });
    return r.stdout.trim();
  }),
};
