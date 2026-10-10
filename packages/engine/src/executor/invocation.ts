// What C-12 runs for an instance (C-12 «المدخلات: مواصفات الاستدعاء من المحولات»). For a project command, its
// approved argv in its folder, with the chosen tool version first on PATH when the profile names one (C-07 point 3).
// For a check whose tool is managed (secrets, dependencies), the invocation E-08 and E-09 settled, with its raw
// report written into the instance's temporary reports folder (D-46). A custom check may name that folder in its
// argv as `{reports}` (and its own temporary folder as `{tmp}`), since it has no adapter to place its report there
// [D-DEV5-09]. Everything else — the analyzers, the probe, the integrity checks, and the adapters that add report
// flags to project tools — arrives with DEV-6, DEV-7 and DEV-9 through the same interface: until then such an
// instance ends «تعذّر» with the reason that its runner is not available, never a guessed result.
import type { CheckSpec, Reason } from '@ayar/protocol';
import { posix } from 'node:path';
import type { ToolLocation } from '../tools/service.ts';

export interface Invocation {
  argv: string[];
  /** Absolute. */
  cwd: string;
  /** Added to the computed child environment (the adapter's variables, C-07 point 5). */
  env: Record<string, string>;
  /** Tool versions recorded with the evidence (9.9). */
  toolVersions: Record<string, string>;
}

export type InvocationResult = { ok: true; invocation: Invocation } | { ok: false; outcome: 'missing' | 'unavailable'; reason: Reason };

export interface InvocationContext {
  spec: CheckSpec;
  projectRoot: string;
  reportsDir: string;
  tmpDir: string;
  tool: ToolLocation | null;
  osvDbDir: string;
  /** PATH of the computed environment (to put a chosen tool version first). */
  path: string;
}

/** Later phases register their runners here (adapters, analyzers, probe, integrity) by catalog runner id. */
export type RunnerHook = (c: InvocationContext) => InvocationResult | null;

export function resolveInvocation(c: InvocationContext, hooks: readonly RunnerHook[] = []): InvocationResult {
  for (const h of hooks) {
    const r = h(c);
    if (r) return r;
  }
  const { spec } = c;
  if (spec.command) {
    const cwd = posix.join(c.projectRoot, spec.command.cwd);
    const subst = (a: string) => (spec.command!.from === 'custom' ? a.replaceAll('{reports}', c.reportsDir).replaceAll('{tmp}', c.tmpDir) : a);
    const argv = spec.command.argv.map(subst);
    // A program inside the project (.venv/bin/python) is run by its path, from the component's folder.
    if (argv[0]!.includes('/') && !argv[0]!.startsWith('/')) argv[0] = posix.join(cwd, argv[0]!);
    const env: Record<string, string> = {};
    // C-07 point 3: a matching installed version chosen in the profile comes first on PATH (it was approved).
    if (spec.tool?.path) env.PATH = [posix.dirname(spec.tool.path), c.path].filter(Boolean).join(':');
    if (spec.command.from === 'custom') env.AYAR_REPORTS_DIR = c.reportsDir;
    return { ok: true, invocation: { argv, cwd, env, toolVersions: {} } };
  }
  if (spec.tool?.source === 'managed') {
    if (!c.tool) return { ok: false, outcome: 'missing', reason: { key: 'run.reason.toolMissing', params: { tool: spec.tool.key } } };
    const versions = { [c.tool.key]: c.tool.version };
    switch (c.tool.key) {
      case 'betterleaks':
      case 'gitleaks':
        // E-08: from the project root with `dir .`, so the report's paths match .gitleaksignore; values redacted
        // by the tool itself (C-18 layer 3), the report as JSON, and a distinct exit code for findings.
        if (spec.checkId !== 'sec.secrets.files') break;
        return {
          ok: true,
          invocation: {
            argv: [c.tool.path, 'dir', '.', '--redact=100', '--report-format', 'json', '--report-path', posix.join(c.reportsDir, `${c.tool.key}.json`), '--exit-code', '42'],
            cwd: c.projectRoot,
            env: {},
            toolVersions: versions,
          },
        };
      case 'osv-scanner':
        // E-09: offline, no call analysis (no code runs), JSON into the reports folder, AYAR's database.
        return {
          ok: true,
          invocation: {
            argv: [c.tool.path, 'scan', 'source', '-r', c.projectRoot, '--offline', '--no-call-analysis=all', '--format', 'json', '--output-file', posix.join(c.reportsDir, 'osv.json')],
            cwd: c.tmpDir,
            env: { OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY: c.osvDbDir },
            toolVersions: versions,
          },
        };
      default:
        break;
    }
  }
  return { ok: false, outcome: 'unavailable', reason: { key: 'run.reason.runnerUnavailable', params: { runner: spec.runner.ids.join(',') || spec.runner.kind } } };
}
