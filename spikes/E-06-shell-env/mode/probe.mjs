// E-06 probe (C-07 step 1): read the login environment from the user's shell.
// Runs inside the engine utilityProcess of the packaged spike app, and also under plain Node.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BEGIN = '__AYAR_ENV_BEGIN__';
const END = '__AYAR_ENV_END__';

function runShell(script, { timeoutMs = 10000, env = process.env } = {}) {
  const shell = env.SHELL || '/bin/zsh';
  return new Promise((resolve) => {
    const t0 = performance.now();
    const child = spawn(shell, ['-ilc', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true, // own process group: lets us find anything the rc files left behind
      env: { ...env, AYAR_RESOLVING_ENVIRONMENT: '1' },
      cwd: os.homedir(),
    });
    const out = [];
    let err = '';
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => { err += d; });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      let leftovers = '';
      try { leftovers = execFileSync('/bin/ps', ['-o', 'pid=,command=', '-g', String(child.pid)], { encoding: 'utf8' }).trim(); } catch {}
      resolve({ shell, ms: performance.now() - t0, code, signal, timedOut, stdout: Buffer.concat(out), stderr: err, leftovers, pgid: child.pid });
    });
  });
}

function parseEnv(buf) {
  const s = buf.toString('utf8');
  const b = s.indexOf(`${BEGIN}\n`);
  const e = s.lastIndexOf(`\n${END}`);
  if (b < 0 || e < 0) return { ok: false, noiseBefore: s.slice(0, 200) };
  const body = s.slice(b + BEGIN.length + 1, e);
  const vars = {};
  for (const entry of body.split('\0')) {
    if (!entry) continue;
    const i = entry.indexOf('=');
    if (i > 0) vars[entry.slice(0, i)] = entry.slice(i + 1);
  }
  return { ok: true, noiseBeforeBytes: b, vars };
}

const watched = () => {
  const home = os.homedir();
  const files = ['.zsh_history', '.zcompdump', '.zsh_sessions', '.nvm/alias/default', '.cargo/env'];
  return Object.fromEntries(files.map((f) => {
    try { const st = fs.statSync(path.join(home, f)); return [f, st.mtimeMs]; } catch { return [f, null]; }
  }));
};

export const handlers = {
  'e06.probe': async ({ runs = 5, timeoutMs = 10000 }) => {
    const results = [];
    for (let i = 0; i < runs; i++) {
      const before = watched();
      const r = await runShell(`printf '%s\\n' ${BEGIN}; env -0; printf '\\n%s\\n' ${END}`, { timeoutMs });
      const after = watched();
      const parsed = parseEnv(r.stdout);
      results.push({
        run: i + 1,
        ms: Number(r.ms.toFixed(1)),
        code: r.code,
        timedOut: r.timedOut,
        parsed: parsed.ok,
        noiseBeforeBytes: parsed.noiseBeforeBytes ?? null,
        stderr: r.stderr.slice(0, 500),
        leftoverProcesses: r.leftovers,
        changedFiles: Object.keys(before).filter((k) => before[k] !== after[k]),
        PATH: parsed.vars?.PATH ?? null,
        varNames: parsed.vars ? Object.keys(parsed.vars).sort() : [],
      });
    }
    return { inheritedPATH: process.env.PATH, inheritedSHELL: process.env.SHELL ?? null, results };
  },
  // Where each tool resolves inside the login shell (functions vs. PATH), and the PATH lookup alone.
  'e06.whence': async () => {
    const tools = ['node', 'npm', 'npx', 'pnpm', 'corepack', 'python3', 'uv', 'bun', 'cargo', 'git'];
    const r = await runShell(`whence -v ${tools.join(' ')}; print -r -- '---'; for t in ${tools.join(' ')}; do print -r -- "$t => $(whence -p $t)"; done; print -r -- '---'; node --version 2>&1`);
    return { ms: Number(r.ms.toFixed(1)), code: r.code, out: r.stdout.toString(), stderr: r.stderr.slice(0, 500) };
  },
};
