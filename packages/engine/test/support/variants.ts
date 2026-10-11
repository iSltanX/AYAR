// Runs plan 20's variants through the engine and compares every expectation (AT-14, AT-16). Per project, what a
// real user would have done first: the dependencies installed («ثبّت التبعيات», offline here), the runtime version
// accepted once when the project pins one that is not installed (G-25), AYAR's offline OSV database present (the
// mini database of E-09), the network allowed for the link checker with its local server up, and the optional checks
// a defect needs included (AT-16 «مع تضمين الاختيارية اللازمة لعيوبها»).
import type { ReadinessReport, ResultsPage, RunDetail, SetupExecuteResult } from '@ayar/protocol';
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { confirmationGrant } from '../../../../tools/cli/src/grants.ts';
import { addProject, approveAll, plan, startRun, waitRun } from '../../../../tools/cli/test/support/fixtures.ts';
import { rowFor, type Row } from './conformance.ts';
import { expectations, FIXTURES, installDependencies, materialize, ok, type EngineConnection, type Expectation } from './scan.ts';

/** The variants of a project, as plan 20 lists them (project.json). */
export function variantsOf(project: string): string[] {
  const meta = JSON.parse(readFileSync(join(FIXTURES, project, 'project.json'), 'utf8')) as { variants: Record<string, unknown> };
  return Object.keys(meta.variants);
}

/** A bin folder with the system's Gitleaks alone (the toolchain's pin, E-08): nothing else of Homebrew leaks in. */
export function systemBin(root: string): string {
  const dir = join(root, 'system-bin');
  mkdirSync(dir, { recursive: true });
  for (const [name, target] of [['gitleaks', '/opt/homebrew/bin/gitleaks']] as const) if (existsSync(target) && !existsSync(join(dir, name))) symlinkSync(target, join(dir, name));
  return dir;
}

/** E-09's mini database as AYAR's offline OSV database (what «حمّل قاعدة الثغرات» leaves), for npm and PyPI. */
export function installOsvMiniDb(dataDir: string): void {
  const out = join(dataDir, 'osv-db');
  execFileSync(process.execPath, [join(FIXTURES, 'tools/osv-mini-db/build.mjs'), '--out', out], { stdio: 'pipe' });
  const db = new DatabaseSync(join(dataDir, 'ayar.db'));
  try {
    db.exec('PRAGMA busy_timeout = 5000');
    for (const eco of ['npm', 'PyPI']) {
      const zip = join(out, 'osv-scalibr', eco, 'all.zip');
      db.prepare("INSERT INTO data_assets (id, kind, key, version_or_date, path, size, updated_at) VALUES (?, 'osv-db', ?, '2026-10-10', ?, 0, ?) ON CONFLICT (kind, key) DO NOTHING").run(`dat_test_${eco}`, eco, zip, new Date().toISOString());
    }
  } finally {
    db.close();
  }
}

export interface VariantOptions {
  /** FX-ADAPTERS: each component folder is a project of its own. */
  perComponent?: boolean;
  /** Profile changes for a variant (timeouts, explicit variables), merged with the inclusions. */
  patch?: (variant: string) => Record<string, unknown> | undefined;
  /** Accept the pinned runtime version once (FX-NOISY's .nvmrc, G-25). */
  acceptVersions?: boolean;
  /** A background process the variant's check talks to (lychee's local server). */
  background?: (path: string) => string[] | null;
  timeoutMs?: number;
  /** Variants whose expectation depends on a later phase beyond the check itself (the guard's effect, DEV-9). */
  later?: (variant: string, e: Expectation) => string | null;
  /** Only these expectations (a subset of a variant). */
  only?: (e: Expectation) => boolean;
  /** A variant's precondition, after its profile is approved and before its run (DEV-7: references approved first). */
  before?: (variant: string, ctx: { engine: EngineConnection; projectId: string; path: string }) => Promise<void>;
}

let seq = 0;

/** Runs one variant: every in-scope expectation, the stability one apart (its covering would hide beh.unit's own run). */
export async function runVariant(engine: EngineConnection, root: string, project: string, variant: string, o: VariantOptions = {}): Promise<Row[]> {
  const exp = expectations(project, variant).expectations.filter((e) => o.only?.(e) ?? true);
  const base = materialize(project, variant, join(root, `${project}-${variant}-${++seq}`));
  const rows: Row[] = [];
  // Per project root: the expectations it holds, and its instances.
  const roots = new Map<string, { path: string; component: string; items: { e: Expectation; instance: string; index: number }[] }>();
  for (const [index, e] of exp.entries()) {
    const sub = o.perComponent ? (e.component ?? '.') : '.';
    const instance = `${e.check}@${o.perComponent ? '.' : (e.component ?? '.')}`;
    const key = sub;
    if (!roots.has(key)) roots.set(key, { path: sub === '.' ? base : join(base, sub), component: sub, items: [] });
    roots.get(key)!.items.push({ index, e: o.perComponent && e.location?.path?.startsWith(`${sub}/`) ? { ...e, location: { ...e.location, path: e.location.path.slice(sub.length + 1) } } : e, instance });
  }
  for (const r of roots.values()) {
    installDependencies(r.path);
    const { projectId } = await addProject(engine, r.path);
    const instances = [...new Set(r.items.map((x) => x.instance))];
    const checks: Record<string, Record<string, unknown>> = {};
    for (const i of instances) checks[i] = { included: true };
    const extra = o.patch?.(variant);
    const extraChecks = (extra?.checks as Record<string, Record<string, unknown>> | undefined) ?? {};
    for (const [i, c] of Object.entries(extraChecks)) checks[i] = { ...(checks[i] ?? {}), ...c };
    ok(await engine.invoke('profile.update', { projectId, patch: { ...(extra ?? {}), checks } }));
    await approveAll(engine, projectId);
    if (o.acceptVersions) await acceptVersions(engine, projectId);
    await o.before?.(variant, { engine, projectId, path: r.path });
    const bg = o.background?.(r.path) ?? null;
    const server = bg ? spawn(bg[0]!, bg.slice(1), { cwd: r.path, stdio: 'ignore' }) : null;
    if (server) await new Promise((res) => setTimeout(res, 500));
    try {
      const groups = [instances.filter((i) => !i.startsWith('beh.stability@')), instances.filter((i) => i.startsWith('beh.stability@'))].filter((g) => g.length);
      const results: { detail: RunDetail; findings: ResultsPage['findings'] }[] = [];
      for (const g of groups) {
        const p = await plan(engine, projectId, { kind: 'group', instances: g });
        const detail = await waitRun(engine, (await startRun(engine, p.id)).runId, o.timeoutMs ?? 300_000);
        const page = ok<ResultsPage>(await engine.invoke('results.query', { projectId, filters: { runId: detail.run.runId, includeExcluded: true, limit: 1000 } }));
        results.push({ detail, findings: page.findings });
      }
      for (const { e, instance, index } of r.items) {
        const from = results.find((x) => x.detail.checks.some((c) => c.instance === instance)) ?? null;
        const row = rowFor(project, variant, e, instance, from?.detail ?? null, from?.findings ?? [], o.later?.(variant, e) ?? null, o.perComponent ? `${r.component}:${instance}` : undefined);
        rows.push(row);
        // Task 8: the rule each expected finding was found with (written out to complete the expected files).
        if (process.env.AYAR_RULES_OUT && row.finding) appendFileSync(process.env.AYAR_RULES_OUT, `${JSON.stringify({ project, variant, index, rule: row.finding.ruleId, toolRule: row.finding.toolRuleId, ok: row.ok })}\n`);
      }
    } finally {
      server?.kill('SIGTERM');
    }
  }
  return rows;
}

/** G-25: «اعتمد الإصدار مرة» for every runtime version the readiness asks to accept. */
async function acceptVersions(engine: EngineConnection, projectId: string): Promise<void> {
  const readiness = ok<ReadinessReport>(await engine.invoke('readiness.evaluate', { projectId }));
  for (const a of readiness.actions.filter((x) => x.kind === 'accept_tool_version')) {
    const preview = ok<{ digest: string }>(await engine.invoke('setup.preview', { actionId: a.id }));
    const g = confirmationGrant('setup.execute', a.id, preview.digest);
    ok<SetupExecuteResult>(await engine.invoke('setup.execute', { actionId: a.id, confirmationToken: g.token }, g.grants));
  }
}
