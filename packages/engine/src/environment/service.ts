// C-07: the environment service. The login environment is read once per engine session (or again on request)
// and kept in memory only; its sensitive values are handed to C-18 (layer 1) at once, and never stored. Per
// project it resolves the tools; at readiness it can probe their versions; per check instance it computes the
// child environment (names only leave the engine).
import type { Catalog } from '@ayar/catalog';
import type { ChildEnvSummary, Fact, ResolvedEnv } from '@ayar/protocol';
import { homedir, tmpdir, userInfo } from 'node:os';
import type { EnginePorts, Logger } from '../ports/index.ts';
import { classifyEnvName, exceptionReason } from '../redaction/names.ts';
import type { RedactionService } from '../redaction/service.ts';
import { computeChildEnv } from './child-env.ts';
import { readLoginShell } from './login-shell.ts';
import { installedVersions, nvmDefault } from './managers.ts';
import { fallbackPath, probeVersions, resolveTools } from './resolve.ts';

export interface BaseEnv {
  source: 'login_shell' | 'fallback';
  fallbackReason: string | null;
  shell: string;
  resolvedAt: string;
  durationMs: number;
  env: Record<string, string>;
  functions: string[];
}

export interface EnvironmentSettings {
  shell: string | null;
  timeoutSeconds: number;
}

export class EnvironmentService {
  readonly #ports: EnginePorts;
  readonly #redaction: RedactionService;
  readonly #logger: Logger;
  readonly #settings: () => EnvironmentSettings;
  readonly #processEnv: Readonly<Record<string, string | undefined>>;
  readonly #shellOverride: string | null;
  #base: Promise<BaseEnv> | null = null;

  constructor(o: {
    ports: EnginePorts;
    redaction: RedactionService;
    logger: Logger;
    settings: () => EnvironmentSettings;
    catalog: Catalog;
    processEnv?: Readonly<Record<string, string | undefined>>;
    /** A shell chosen by the host itself (tools/cli's test hook), not by the renderer. */
    shellOverride?: string | null;
  }) {
    this.#ports = o.ports;
    this.#redaction = o.redaction;
    this.#logger = o.logger;
    this.#settings = o.settings;
    this.#processEnv = o.processEnv ?? process.env;
    this.#shellOverride = o.shellOverride ?? null;
  }

  /**
   * The shell to read: the host's override, else the setting — only if it is a login shell the system lists in
   * /etc/shells, owned by root and not writable by others (review M10: a setting is not a way to run any
   * program) — else the account's shell.
   */
  async #shell(setting: string | null): Promise<string> {
    if (this.#shellOverride) return this.#shellOverride;
    const account = this.#processEnv.SHELL ?? userInfo().shell ?? '/bin/zsh';
    if (!setting) return account;
    try {
      const listed = new TextDecoder().decode((await this.#ports.fs.readFilePrefix('/etc/shells', 64 * 1024)).data).split('\n').map((l) => l.trim());
      const st = await this.#ports.fs.stat(setting);
      if (listed.includes(setting) && st?.isFile && st.uid === 0 && (st.mode & 0o022) === 0) return setting;
    } catch {
      /* fall through: the setting is refused */
    }
    this.#logger.log('warn', 'environment.shell is not a system login shell: using the account shell', {});
    return account;
  }

  home(): string {
    return this.#processEnv.HOME ?? homedir();
  }

  /** The login environment of this session (C-07 point 1), or the marked fallback (point 2). */
  base(refresh = false): Promise<BaseEnv> {
    if (refresh || !this.#base) this.#base = this.#read();
    return this.#base;
  }

  async #read(): Promise<BaseEnv> {
    const s = this.#settings();
    const shell = await this.#shell(s.shell);
    const user = this.#processEnv.USER ?? userInfo().username;
    const base = { HOME: this.home(), USER: user, LOGNAME: this.#processEnv.LOGNAME ?? user, TMPDIR: this.#processEnv.TMPDIR ?? tmpdir(), LANG: this.#processEnv.LANG ?? null };
    const nonce = Buffer.from(this.#ports.random.bytes(12)).toString('hex');
    const started = this.#ports.clock.now();
    const r = await readLoginShell({ processes: this.#ports.processes, shell, timeoutMs: s.timeoutSeconds * 1000, base, nonce });
    let out: BaseEnv;
    if (r.ok) {
      out = { source: 'login_shell', fallbackReason: null, shell, resolvedAt: started.toISOString(), durationMs: r.durationMs, env: r.env, functions: r.functions };
    } else {
      const path = await fallbackPath(this.#ports.fs, base.HOME);
      this.#logger.log('warn', 'login shell environment unavailable: using the fallback', { reason: r.reason, code: r.code });
      out = {
        source: 'fallback',
        fallbackReason: r.reason,
        shell,
        resolvedAt: started.toISOString(),
        durationMs: r.durationMs,
        env: { HOME: base.HOME, USER: base.USER, LOGNAME: base.LOGNAME, SHELL: shell, TMPDIR: base.TMPDIR, PATH: path.join(':'), ...(base.LANG ? { LANG: base.LANG } : {}) },
        functions: [],
      };
    }
    // C-18 layer 1: the values of sensitive variables are redacted wherever they appear, passed or not.
    const rules = this.#redaction.names();
    this.#redaction.registerKnownValues(Object.entries(out.env).filter(([n]) => classifyEnvName(n, rules) === 'sensitive').map(([n, value]) => ({ rule: `env:${n}`, value })));
    return out;
  }

  /** ResolvedEnv for a project (names only, never values). */
  async resolve(o: { projectRoot: string; facts: readonly Fact[]; refresh?: boolean; probe?: boolean; untrusted?: boolean }): Promise<ResolvedEnv> {
    const b = await this.base(o.refresh ?? false);
    const rules = this.#redaction.names();
    const names = Object.keys(b.env).sort();
    const path = (b.env.PATH ?? '').split(':').filter(Boolean);
    const installed = await installedVersions(this.#ports.fs, this.home());
    let tools = await resolveTools({ fs: this.#ports.fs, path, projectRoot: o.projectRoot, facts: o.facts, installed, shellFunctions: b.functions, nvmDefault: await nvmDefault(this.#ports.fs, this.home(), installed) });
    if (o.probe) {
      const child = computeChildEnv({ login: b.env, rules, allowSensitive: [], explicit: {} });
      tools = await probeVersions(this.#ports.processes, tools, { projectRoot: o.projectRoot, neutralCwd: this.home(), untrusted: o.untrusted ?? false, env: child.env, realpath: (p) => this.#ports.fs.realpath(p).catch(() => null) });
    }
    return {
      source: b.source,
      fallbackReason: b.fallbackReason,
      shell: b.shell,
      resolvedAt: b.resolvedAt,
      durationMs: b.durationMs,
      path,
      lang: b.env.LANG ?? null,
      names,
      withheld: names.filter((n) => classifyEnvName(n, rules) === 'sensitive'),
      exceptions: names.filter((n) => classifyEnvName(n, rules) === 'exception').map((n) => ({ name: n, reason: exceptionReason(n, rules)! })),
      removedInternal: names.filter((n) => classifyEnvName(n, rules) === 'internal'),
      tools,
    };
  }

  /** The environment one instance would get (names only), from its spec's allowed and explicit variables. */
  async childSummary(instance: string, spec: { allowSensitive: readonly string[]; explicit: Readonly<Record<string, string>> }): Promise<ChildEnvSummary> {
    const b = await this.base();
    const c = computeChildEnv({ login: b.env, rules: this.#redaction.names(), allowSensitive: spec.allowSensitive, explicit: spec.explicit });
    return { instance, passed: c.passed, withheld: c.withheld, allowedSensitive: c.allowedSensitive, added: c.added, removedInternal: c.removedInternal };
  }
}
