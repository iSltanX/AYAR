// C-07 point 1 (D-06), as E-06 settled it: the user's shell in login-interactive mode prints `env -0` between two
// markers. Stdin is closed, it has a timeout (10 s by default, A-15), and AYAR_RESOLVING_ENVIRONMENT=1 lets the
// user skip heavy initialization. It starts from an explicit minimal environment (HOME, USER, LOGNAME, SHELL,
// TMPDIR, LANG, the system PATH), not the inherited one, so the result is the same whether AYAR was opened from
// Finder or from a terminal (E-06). The same shell also says which tools are shell functions (nvm's lazy
// loading, G-49). Markers carry a random nonce, so nothing the user's files print can fake them.
import type { ProcessControl } from '../ports/index.ts';

export const SYSTEM_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
export const PROBED_TOOLS = ['node', 'npm', 'npx', 'pnpm', 'yarn', 'corepack', 'bun', 'python3', 'python', 'uv', 'poetry'];

export interface LoginShellOptions {
  processes: ProcessControl;
  shell: string;
  timeoutMs: number;
  base: { HOME: string; USER: string; LOGNAME: string; TMPDIR: string; LANG: string | null };
  nonce: string;
}

export type LoginShellResult =
  | { ok: true; env: Record<string, string>; functions: string[]; durationMs: number }
  | { ok: false; reason: 'timeout' | 'exit' | 'no_markers' | 'spawn_failed'; durationMs: number; code: number | null };

export function loginShellScript(shell: string, nonce: string): string {
  const name = shell.split('/').pop() ?? '';
  const detect =
    name === 'zsh'
      ? `for t in ${PROBED_TOOLS.join(' ')}; do w=$(whence -w "$t" 2>/dev/null) && printf '%s\\0' "$w"; done`
      : name === 'bash'
        ? `for t in ${PROBED_TOOLS.join(' ')}; do w=$(type -t "$t" 2>/dev/null) && printf '%s: %s\\0' "$t" "$w"; done`
        : ':';
  return [`printf '\\0__AYAR_ENV_BEGIN_${nonce}__\\0'`, '/usr/bin/env -0', `printf '\\0__AYAR_ENV_END_${nonce}__\\0'`, detect, `printf '\\0__AYAR_FN_END_${nonce}__\\0'`].join('; ');
}

export function parseLoginShellOutput(out: string, nonce: string): { env: Record<string, string>; functions: string[] } | null {
  const begin = `\0__AYAR_ENV_BEGIN_${nonce}__\0`;
  const end = `\0__AYAR_ENV_END_${nonce}__\0`;
  const fnEnd = `\0__AYAR_FN_END_${nonce}__\0`;
  const b = out.indexOf(begin);
  const e = out.indexOf(end, b + begin.length);
  if (b < 0 || e < 0) return null;
  const env: Record<string, string> = {};
  for (const entry of out.slice(b + begin.length, e).split('\0')) {
    const i = entry.indexOf('=');
    if (i > 0) env[entry.slice(0, i)] = entry.slice(i + 1);
  }
  const f = out.indexOf(fnEnd, e + end.length);
  const functions =
    f < 0
      ? []
      : out
          .slice(e + end.length, f)
          .split('\0')
          .map((x) => /^([\w.-]+):\s*function$/.exec(x.trim())?.[1])
          .filter((x): x is string => !!x);
  return { env, functions };
}

export async function readLoginShell(o: LoginShellOptions): Promise<LoginShellResult> {
  const env: Record<string, string> = {
    HOME: o.base.HOME,
    USER: o.base.USER,
    LOGNAME: o.base.LOGNAME,
    SHELL: o.shell,
    TMPDIR: o.base.TMPDIR,
    PATH: SYSTEM_PATH,
    AYAR_RESOLVING_ENVIRONMENT: '1',
    ...(o.base.LANG ? { LANG: o.base.LANG } : {}),
  };
  const r = await o.processes.spawn(o.shell, ['-ilc', loginShellScript(o.shell, o.nonce)], { cwd: o.base.HOME, env, timeoutMs: o.timeoutMs, maxOutputBytes: 8 * 1024 * 1024 });
  if (r.error) return { ok: false, reason: 'spawn_failed', durationMs: r.durationMs, code: null };
  if (r.timedOut) return { ok: false, reason: 'timeout', durationMs: r.durationMs, code: r.code };
  const parsed = parseLoginShellOutput(new TextDecoder().decode(r.stdout), o.nonce);
  if (!parsed) return { ok: false, reason: r.code === 0 ? 'no_markers' : 'exit', durationMs: r.durationMs, code: r.code };
  return { ok: true, env: parsed.env, functions: parsed.functions, durationMs: r.durationMs };
}
