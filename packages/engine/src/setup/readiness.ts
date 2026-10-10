// C-10 point 6 and 9.4 point 2 (FR-16): the readiness of every applicable instance, apart from its outcome, with a
// written reason — ready; needs setup (a tool, a runtime version, dependencies, a data asset, a reference, the
// network); needs approval; not applicable; not included; or refused in «مشروع غير موثوق» (FR-55, G-20). The
// version probes of C-07 run here and only here (G-DEV4-04). Each gap that a setup action can close names that
// action (9.4 point 3); nothing is ever set up implicitly: a check that is not ready runs as «ناقص» (point 5).
import type { CheckSpec, Fact, Readiness, Reason, ResolvedEnv, ToolResolution } from '@ayar/protocol';
import { posix } from 'node:path';
import type { CheckDefinition, Catalog } from '@ayar/catalog';
import type { FileSystem } from '../ports/index.ts';
import { needsApproval } from '../profile/propose.ts';
import type { ToolLocation, ToolsService } from '../tools/service.ts';


export type ActionSeed =
  | { kind: 'install_tool'; tool: string }
  | { kind: 'install_dependencies'; component: string; manager: string; ecosystem: 'npm' | 'PyPI' }
  | { kind: 'accept_tool_version'; tool: string; requiredSpec: string; requiredFrom: string; version: string; path: string | null }
  | { kind: 'download_osv_db'; ecosystem: 'npm' | 'PyPI' };

export interface InstanceReadiness {
  instance: string;
  /** What the report and the plan show. */
  readiness: Readiness;
  /** The readiness as if included: what an explicit choice of a not-included check would get (FR-18 «فحص منفرد»). */
  inner: Exclude<Readiness, 'not_included'>;
  reasons: Reason[];
  actions: ActionSeed[];
  /** The managed or system tool the check would use, when it needs one. */
  tool: ToolLocation | null;
}

export interface ReadinessInput {
  catalog: Catalog;
  specs: readonly CheckSpec[];
  facts: readonly Fact[];
  approvals: ReadonlyMap<string, { specHash: string }>;
  untrusted: boolean;
  env: ResolvedEnv;
  projectRoot: string;
  fs: Pick<FileSystem, 'lstat' | 'stat'>;
  tools: Pick<ToolsService, 'locate'>;
  /** Tools AYAR can install (the managed registry). */
  installable: (key: string) => boolean;
  allowNetwork: boolean;
  /** Ecosystems whose offline OSV database is present (data_assets). */
  osvDbs: ReadonlySet<string>;
  /** G-25: tool versions the user accepted once for this project: `tool\0requiredSpec\0version`. */
  accepted: ReadonlySet<string>;
  /**
   * DEV-6: is the browser of the project's own Playwright installed (the revision its playwright-core names, in
   * Playwright's cache)? beh.e2e and perf.compat run the project's tests with it; the probe's browser is DEV-7's.
   */
  projectBrowser?: (component: string) => Promise<boolean>;
}

const rec = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * C-09 and FR-11: a project command never runs unapproved. Besides what the profile includes (needsApproval), a
 * check chosen explicitly or added as a dependency that runs something of the project needs its approval too: it is
 * approved by including it in the profile first [D-DEV5-12].
 */
export function requiresApproval(spec: CheckSpec): boolean {
  return needsApproval(spec) || (spec.applicable && spec.enabled && spec.refused.length === 0 && runsProjectCommand(spec));
}

/** Does this instance run something of the project (its command, its scripts, its companion services)? FR-55. */
export function runsProjectCommand(spec: CheckSpec): boolean {
  if (spec.services.length) return true;
  if (spec.command && ['script', 'user', 'custom'].includes(spec.command.from)) return true;
  if (spec.command?.script) return true;
  return spec.sideEffects.runsProjectCode && spec.command !== null;
}

/** The ecosystems of a project, by its lock files and manifests (what an offline OSV database must cover). */
export function ecosystems(facts: readonly Fact[]): ('npm' | 'PyPI')[] {
  const out = new Set<'npm' | 'PyPI'>();
  if (facts.some((f) => f.key === 'node.lockfile' || f.key === 'node.package')) out.add('npm');
  if (facts.some((f) => f.key === 'python.lockfile' || f.key === 'python.requirements' || f.key === 'python.project')) out.add('PyPI');
  return [...out].sort();
}

function componentFacts(facts: readonly Fact[], component: string): Fact[] {
  return facts.filter((f) => f.component === component);
}

function packageManagerOf(facts: readonly Fact[], component: string): string {
  for (const c of [component, '.']) {
    const f = facts.find((x) => x.key === 'node.packageManager' && x.component === c);
    const name = rec(f?.value).name;
    if (f) return typeof name === 'string' ? name : 'npm';
  }
  return 'npm';
}

export async function evaluateInstances(i: ReadinessInput): Promise<InstanceReadiness[]> {
  const out: InstanceReadiness[] = [];
  const toolCache = new Map<string, Promise<ToolLocation | null>>();
  const locate = (key: string) => {
    if (!toolCache.has(key)) toolCache.set(key, i.tools.locate(key).catch(() => null));
    return toolCache.get(key)!;
  };
  const exists = async (rel: string) => (await i.fs.lstat(posix.join(i.projectRoot, rel)).catch(() => null)) !== null;
  const envTool = (name: string): ToolResolution | undefined => i.env.tools.find((t) => t.tool === name);
  /** The program on the computed PATH (C-07): the check would find it the same way. */
  const onPath = async (program: string) => {
    for (const dir of i.env.path) {
      if (!dir.startsWith('/')) continue;
      const st = await i.fs.stat(posix.join(dir, program)).catch(() => null);
      if (st?.isFile && (st.mode & 0o111) !== 0) return true;
    }
    return false;
  };
  const projectEcos = ecosystems(i.facts);

  for (const spec of i.specs) {
    const def: CheckDefinition | undefined = i.catalog.check(spec.checkId) ?? (spec.checkId.startsWith('custom.') ? i.catalog.check('custom.*') : undefined);
    if (!spec.applicable) {
      out.push({ instance: spec.instance, readiness: 'not_applicable', inner: 'not_applicable', reasons: spec.reasons.filter((r) => r.key === 'profile.reason.notApplicable'), actions: [], tool: null });
      continue;
    }
    const reasons: Reason[] = [];
    const actions: ActionSeed[] = [];
    let tool: ToolLocation | null = null;
    let inner: InstanceReadiness['inner'] = 'ready';
    const need = (r: Reason, a?: ActionSeed) => {
      if (inner === 'ready') inner = 'needs_setup';
      reasons.push(r);
      if (a && !actions.some((x) => JSON.stringify(x) === JSON.stringify(a))) actions.push(a);
    };

    // FR-55: a project command never runs in «مشروع غير موثوق»; the reading tools still do.
    if (i.untrusted && runsProjectCommand(spec)) {
      inner = 'untrusted';
      reasons.push({ key: 'setup.reason.untrusted' });
    }
    // Approval (FR-11): a refused command can never be approved; a changed spec needs its approval again.
    if (inner === 'ready' && spec.refused.length) {
      inner = 'needs_approval';
      reasons.push({ key: 'setup.reason.refused', params: { categories: spec.refused.join(', ') } });
    } else if (inner === 'ready' && requiresApproval(spec) && i.approvals.get(spec.instance)?.specHash !== spec.specHash) {
      inner = 'needs_approval';
      reasons.push({ key: i.approvals.has(spec.instance) ? 'setup.reason.specChanged' : 'setup.reason.notApproved' });
    }

    if (inner === 'ready') {
      // G-39 and 10.3: a missing reference («ناقص إعداد»), tests, or lock file.
      for (const m of spec.missing) need({ key: `setup.reason.missing.${m.kind}`, ...(m.ref ? { params: { ref: m.ref } } : {}) });
      // 10.2 rule 5: the network only when allowed.
      if (spec.network === 'required' && !i.allowNetwork) need({ key: 'setup.reason.networkNotAllowed' });
      // Managed tools (C-11): installed by AYAR, or a system tool inside the supported range.
      const managedReq = def?.requirements.find((r) => r.kind === 'tool' && (r.from === 'managed' || r.from === 'project_or_managed'));
      if (spec.tool?.source === 'managed' && managedReq?.kind === 'tool') {
        for (const key of managedReq.tools) {
          tool = await locate(key);
          if (tool) break;
        }
        if (!tool) {
          // The first tool of the requirement AYAR can install (Betterleaks before Gitleaks, E-08).
          const first = managedReq.tools.find((k) => i.installable(k));
          if (first) need({ key: 'setup.reason.toolMissing', params: { tool: first } }, { kind: 'install_tool', tool: first });
          else need({ key: 'setup.reason.toolMissing', params: { tool: managedReq.tools[0]! } });
        }
      }
      // Data assets (C-11 point 3).
      if (def?.requirements.some((r) => r.kind === 'dataAsset' && r.asset === 'osv-db')) {
        if (!(await locate('osv-scanner'))) need({ key: 'setup.reason.toolMissing', params: { tool: 'osv-scanner' } }, { kind: 'install_tool', tool: 'osv-scanner' });
        for (const eco of projectEcos) if (!i.osvDbs.has(eco)) need({ key: 'setup.reason.osvDbMissing', params: { ecosystem: eco } }, { kind: 'download_osv_db', ecosystem: eco });
      }
      if (def?.requirements.some((r) => r.kind === 'dataAsset' && r.asset === 'browser')) {
        const projectsOwn = def.runner.kind === 'adapter' && def.runner.ids.includes('playwright');
        if (!projectsOwn || !(await i.projectBrowser?.(spec.component))) need({ key: 'setup.reason.browserMissing' });
      }

      // A project command: its runtime, its program, its dependencies.
      if (spec.command) {
        const runtime = spec.tool?.runtime ?? null;
        if (runtime) {
          const t = envTool(runtime.name === 'node' ? 'node' : 'python3');
          if (!t || t.status === 'missing') need({ key: 'setup.reason.toolMissing', params: { tool: runtime.name } });
          else if (t.status === 'mismatch' && !spec.tool?.path) {
            const found = t.version ?? t.probe?.version ?? 'unknown';
            if (!i.accepted.has(`${runtime.name}\0${runtime.spec}\0${found}`)) {
              need(
                { key: 'setup.reason.runtimeMismatch', params: { tool: runtime.name, required: runtime.spec, from: runtime.from, found } },
                { kind: 'accept_tool_version', tool: runtime.name, requiredSpec: runtime.spec, requiredFrom: runtime.from, version: found, path: t.path },
              );
              if (t.proposedPath) reasons.push({ key: 'setup.reason.matchingInstalled', params: { tool: runtime.name, path: t.proposedPath } });
            } else reasons.push({ key: 'setup.reason.versionAccepted', params: { tool: runtime.name, required: runtime.spec, found } });
          }
        }
        const program = spec.command.argv[0]!;
        const component = spec.command.cwd;
        if (program.includes('/')) {
          // A program inside the project (.venv/bin/python): there, or the dependencies are not installed.
          if (!(await exists(posix.join(component, program)))) need({ key: 'setup.reason.dependenciesMissing', params: { component } }, { kind: 'install_dependencies', component, manager: 'uv', ecosystem: 'PyPI' });
        } else {
          const pmTool = envTool(program);
          if (pmTool?.viaCorepack && pmTool.status === 'mismatch') {
            // G-DEV2-01: corepack would download the declared manager; without the network it is not ready.
            need({ key: 'setup.reason.managerMismatch', params: { tool: program, required: pmTool.required?.spec ?? '' } });
          } else if (!(await onPath(program))) need({ key: 'setup.reason.toolMissing', params: { tool: program } });
        }
        // Dependencies (G-19: «ثبّت التبعيات» is a setup action): a package with dependencies and no node_modules.
        const own = componentFacts(i.facts, component);
        const deps = Number(rec(own.find((f) => f.key === 'node.dependencies')?.value).count ?? 0);
        if (deps > 0 && spec.command.from !== 'custom' && !(await exists(posix.join(component, 'node_modules'))) && !(await exists('node_modules'))) {
          need({ key: 'setup.reason.dependenciesMissing', params: { component } }, { kind: 'install_dependencies', component, manager: packageManagerOf(i.facts, component), ecosystem: 'npm' });
        }
        const pyName = rec(own.find((f) => f.key === 'python.manager')?.value).name;
        const pyManager = typeof pyName === 'string' ? pyName : '';
        if (pyManager === 'uv' && program === 'uv' && !(await exists(posix.join(component, '.venv')))) {
          need({ key: 'setup.reason.dependenciesMissing', params: { component } }, { kind: 'install_dependencies', component, manager: 'uv', ecosystem: 'PyPI' });
        }
      }
    }
    if (inner === 'ready') reasons.push({ key: tool ? `setup.reason.ready.${tool.source}` : 'setup.reason.ready', ...(tool ? { params: { tool: tool.key, version: tool.version } } : {}) });
    const included = spec.enabled && spec.included;
    out.push({ instance: spec.instance, readiness: included ? inner : 'not_included', inner, reasons: included ? reasons : [{ key: 'setup.reason.notIncluded' }, ...reasons], actions, tool });
  }
  return out;
}
