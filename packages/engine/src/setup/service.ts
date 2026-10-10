// 9.4, FR-16, FR-17, D-07 (C-10 readiness, C-11 setup actions): readiness.evaluate, setup.preview, setup.execute.
// Every gap a setup action can close is an action of its own, with a preview of what it runs, which host it
// reaches, how much it downloads, what it writes and where (AYAR's folder or the project's node_modules), and
// whether the project's install scripts run. It runs only with a confirmation bound to the digest of the preview
// the user saw (recomputed here: the DEV-3 condition), alone, with its own log, and is audited. Readiness is then
// read again from the tools themselves, never from the installer's exit code (9.4 point 4, G-DEV1-02).
import { canonicalJson } from '@ayar/catalog';
import type { ReadinessItem, ReadinessReport, Reason, SetupAction, SetupExecuteResult, SetupPreview } from '@ayar/protocol';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import type { EnvironmentService } from '../environment/service.ts';
import { computeChildEnv } from '../environment/child-env.ts';
import { CommandError } from '../host/errors.ts';
import type { EventBus } from '../host/event-bus.ts';
import { newId } from '../host/ids.ts';
import type { EnginePorts, Logger } from '../ports/index.ts';
import { latestSnapshot } from '../profile/service.ts';
import type { ProfileService } from '../profile/service.ts';
import { approvalsOf, latestProfile } from '../profile/store.ts';
import type { ProjectsService } from '../projects/service.ts';
import type { RedactionService } from '../redaction/service.ts';
import { recordAudit } from '../storage/audit.ts';
import type { DataLayout } from '../storage/data-dir.ts';
import type { Db } from '../storage/db.ts';
import { readSettings } from '../storage/settings.ts';
import type { ProcessSupervisor } from '../executor/process.ts';
import type { ToolsService } from '../tools/service.ts';
import type { Catalog } from '@ayar/catalog';
import { evaluateInstances, type ActionSeed, type InstanceReadiness } from './readiness.ts';

const SETUP_TIMEOUT_MS = 20 * 60_000;
const OSV_HOST = 'osv-vulnerabilities.storage.googleapis.com';
const OSV_SIZE: Record<'npm' | 'PyPI', number> = { npm: 218 * 1024 * 1024, PyPI: 36 * 1024 * 1024 };
const REGISTRY: Record<'npm' | 'PyPI', { host: string; url: string }> = {
  npm: { host: 'registry.npmjs.org', url: 'https://registry.npmjs.org/' },
  PyPI: { host: 'pypi.org', url: 'https://pypi.org/simple/' },
};
const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall', 'prepare'];

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const rec = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

interface ActionRow {
  id: string;
  project_id: string;
  kind: SetupAction['kind'];
  preview_json: string;
  confirmed_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  result: string | null;
  state: string | null;
  target_json: string | null;
  instances_json: string | null;
  reasons_json: string | null;
  log_path: string | null;
  log_sha256: string | null;
}

export interface SetupServiceOptions {
  db: Db;
  catalog: Catalog;
  ports: EnginePorts;
  layout: DataLayout;
  logger: Logger;
  events: EventBus;
  profiles: ProfileService;
  projects: ProjectsService;
  environment: EnvironmentService;
  tools: ToolsService;
  redaction: RedactionService;
  supervisor: ProcessSupervisor;
  /** True while a run of this project is active or queued: a setup action never changes a project under a run. */
  runActive: (projectId: string) => boolean;
}

export class SetupService {
  readonly #o: SetupServiceOptions;
  #busy: string | null = null;

  constructor(o: SetupServiceOptions) {
    this.#o = o;
  }

  /** The readiness of every applicable instance, with what would make it ready (C-10 point 6). */
  async instances(projectId: string, o: { probe: boolean }): Promise<{ items: InstanceReadiness[]; env: ReadinessReport['env']; untrusted: boolean }> {
    const project = await this.#o.projects.view(projectId);
    const snapshot = latestSnapshot(this.#o.db, projectId);
    if (!snapshot) throw new CommandError('not_found', { reason: 'no_snapshot' });
    const profile = latestProfile(this.#o.db, projectId) ?? this.#o.profiles.regenerate(projectId, snapshot, 'proposed').row;
    const untrusted = profile.content.untrusted;
    const env = await this.#o.environment.resolve({ projectRoot: project.rootPath, facts: snapshot.facts, probe: o.probe, untrusted });
    const allowNetwork = readSettings(this.#o.db, ['run.allowNetwork'])['run.allowNetwork'] ?? false;
    const osvDbs = new Set(this.#o.db.all<{ key: string }>("SELECT key FROM data_assets WHERE kind = 'osv-db'").map((r) => r.key));
    const accepted = new Set(this.#o.db.all<{ tool: string; required_spec: string; version: string }>('SELECT tool, required_spec, version FROM tool_version_acceptances WHERE project_id = ?', projectId).map((r) => `${r.tool}\0${r.required_spec}\0${r.version}`));
    const items = await evaluateInstances({
      catalog: this.#o.catalog,
      specs: profile.content.checks,
      facts: snapshot.facts,
      approvals: approvalsOf(this.#o.db, projectId),
      untrusted,
      env,
      projectRoot: project.rootPath,
      fs: this.#o.ports.fs,
      tools: this.#o.tools,
      installable: (k) => this.#o.tools.registry.has(k),
      allowNetwork,
      osvDbs,
      accepted,
    });
    return { items, env: { source: env.source, fallbackReason: env.fallbackReason, probed: o.probe }, untrusted };
  }

  /** readiness.evaluate: probes the tools' versions (G-DEV4-04), and lists the setup actions (9.4 point 3). */
  async evaluate(projectId: string, probe = true): Promise<ReadinessReport> {
    const { items, env, untrusted } = await this.instances(projectId, { probe });
    const snapshot = latestSnapshot(this.#o.db, projectId)!;
    const actionsById = new Map<string, SetupAction>();
    const out: ReadinessItem[] = [];
    for (const it of items) {
      if (it.readiness === 'not_applicable') continue;
      const ids: string[] = [];
      for (const seed of it.actions) {
        const id = this.#actionId(projectId, seed);
        ids.push(id);
        const existing = actionsById.get(id);
        if (existing) existing.instances.push(it.instance);
        else actionsById.set(id, await this.#materialize(projectId, snapshot.facts, seed, id, [it.instance]));
      }
      out.push({ instance: it.instance, readiness: it.readiness, reasons: it.reasons, actions: ids });
    }
    const actions = [...actionsById.values()];
    this.#o.db.transaction(() => {
      for (const a of actions) this.#save(a);
    });
    return { projectId, evaluatedAt: this.#o.ports.clock.now().toISOString(), env, untrusted, items: out, actions: actions.map((a) => this.#view(a.id)) };
  }

  #actionId(projectId: string, seed: ActionSeed): string {
    return setupActionId(projectId, seed);
  }

  /** What an action will do (9.4 point 3), computed from the current state of AYAR and the project. */
  async #materialize(projectId: string, facts: readonly { key: string; component: string; value: unknown }[], seed: ActionSeed, id: string, instances: string[]): Promise<SetupAction> {
    let preview: SetupPreview;
    let title: Reason;
    let target: SetupAction['target'] = { tool: null, version: null, requiredSpec: null, ecosystem: null, component: null };
    switch (seed.kind) {
      case 'install_tool': {
        const p = this.#o.tools.preview(seed.tool).preview;
        title = { key: 'setup.action.installTool', params: { tool: seed.tool, version: p.version } };
        target = { ...target, tool: seed.tool, version: p.version };
        const warnings: Reason[] = [{ key: 'setup.warning.pinnedHash', params: { sha256: p.sha256 } }];
        // C-11 «حيث يتاح»: a sigstore signature needs cosign; without it, the preview says the hash alone is checked.
        if ((await this.#o.tools.signatureCheckable(seed.tool)) === false) warnings.push({ key: 'setup.warning.signatureNotChecked', params: { tool: seed.tool } });
        preview = { command: null, cwd: null, network: { host: p.host, url: p.url }, sizeBytes: p.sizeBytes, writes: [{ location: 'ayar', path: p.writes }], runsScripts: false, warnings };
        break;
      }
      case 'install_dependencies': {
        const cmd = installCommand(seed.manager, facts, seed.component);
        const scripts = facts.filter((f) => f.key === 'node.script' && f.component === seed.component && INSTALL_SCRIPTS.includes(String(rec(f.value).name))).map((f) => String(rec(f.value).name));
        const warnings: Reason[] = [];
        if (seed.ecosystem === 'npm' && scripts.length) warnings.push({ key: 'setup.warning.installScripts', params: { scripts: scripts.join(', ') } });
        if (seed.manager === 'npm') warnings.push({ key: 'setup.warning.npmScriptsMayBeBlocked' });
        if (seed.manager === 'pnpm') warnings.push({ key: 'setup.warning.pnpmIgnoredBuilds' });
        if (!cmd.lockfile) warnings.push({ key: 'setup.warning.noLockfile' });
        title = { key: 'setup.action.installDependencies', params: { component: seed.component, manager: seed.manager } };
        target = { ...target, tool: seed.manager, ecosystem: seed.ecosystem, component: seed.component };
        preview = {
          command: cmd.argv,
          cwd: seed.component,
          network: REGISTRY[seed.ecosystem],
          sizeBytes: null,
          writes: [{ location: 'project', path: posix.join(seed.component, seed.ecosystem === 'npm' ? 'node_modules' : '.venv') }, ...(cmd.lockfile ? [] : [{ location: 'project' as const, path: posix.join(seed.component, 'package-lock.json') }])],
          // npm runs the install scripts unless told not to; pnpm 12 blocks dependencies' build scripts (G-DEV1-02).
          runsScripts: seed.manager === 'npm' || seed.manager === 'yarn' ? true : seed.manager === 'pnpm' ? false : null,
          warnings,
        };
        break;
      }
      case 'accept_tool_version': {
        title = { key: 'setup.action.acceptToolVersion', params: { tool: seed.tool, required: seed.requiredSpec, found: seed.version } };
        target = { ...target, tool: seed.tool, version: seed.version, requiredSpec: seed.requiredSpec };
        preview = { command: null, cwd: null, network: null, sizeBytes: 0, writes: [{ location: 'ayar', path: 'ayar.db' }], runsScripts: false, warnings: [{ key: 'setup.warning.versionOutsideRange', params: { tool: seed.tool, required: seed.requiredSpec, from: seed.requiredFrom, found: seed.version } }] };
        break;
      }
      case 'download_osv_db': {
        const osv = await this.#o.tools.locate('osv-scanner');
        title = { key: 'setup.action.downloadOsvDb', params: { ecosystem: seed.ecosystem } };
        target = { ...target, tool: 'osv-scanner', ecosystem: seed.ecosystem };
        preview = {
          command: [osv?.path ?? 'osv-scanner', 'scan', 'source', '-r', '<template>', '--download-offline-databases', '--offline-vulnerabilities', '--no-call-analysis=all', '--format', 'json', '--output-file', '<tmp>/osv.json'],
          cwd: null,
          network: { host: OSV_HOST, url: `https://${OSV_HOST}/${seed.ecosystem}/all.zip` },
          sizeBytes: OSV_SIZE[seed.ecosystem],
          writes: [{ location: 'ayar', path: 'osv-db/' }],
          runsScripts: false,
          warnings: osv ? [] : [{ key: 'setup.warning.needsTool', params: { tool: 'osv-scanner' } }],
        };
        break;
      }
    }
    const prev = this.#o.db.get<ActionRow>('SELECT * FROM setup_actions WHERE id = ?', id);
    return {
      id,
      projectId,
      kind: seed.kind,
      instances,
      title,
      target,
      preview,
      state: prev?.state === 'running' ? 'running' : 'proposed',
      resultReasons: [],
      confirmedAt: null,
      finishedAt: null,
    };
  }

  #save(a: SetupAction): void {
    this.#o.db.run(
      `INSERT INTO setup_actions (id, project_id, kind, preview_json, state, target_json, instances_json, reasons_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET preview_json = excluded.preview_json, target_json = excluded.target_json, instances_json = excluded.instances_json,
         state = CASE WHEN setup_actions.state = 'running' THEN 'running' ELSE 'proposed' END, reasons_json = excluded.reasons_json`,
      a.id,
      a.projectId,
      a.kind,
      JSON.stringify({ title: a.title, preview: a.preview }),
      a.state,
      JSON.stringify(a.target),
      JSON.stringify(a.instances),
      JSON.stringify([]),
    );
  }

  #view(id: string): SetupAction {
    const r = this.#o.db.get<ActionRow>('SELECT * FROM setup_actions WHERE id = ?', id);
    if (!r) throw new CommandError('not_found', { reason: 'setup_action' });
    const p = JSON.parse(r.preview_json) as { title: Reason; preview: SetupPreview };
    return {
      id: r.id,
      projectId: r.project_id,
      kind: r.kind,
      instances: JSON.parse(r.instances_json ?? '[]') as string[],
      title: p.title,
      target: JSON.parse(r.target_json ?? 'null') as SetupAction['target'],
      preview: p.preview,
      state: (r.state ?? 'proposed') as SetupAction['state'],
      resultReasons: JSON.parse(r.reasons_json ?? '[]') as Reason[],
      confirmedAt: r.confirmed_at,
      finishedAt: r.finished_at,
    };
  }

  /** The digest the confirmation binds to: what the user saw, without the action's changing state. */
  #digest(a: SetupAction): string {
    return sha(canonicalJson({ id: a.id, projectId: a.projectId, kind: a.kind, target: a.target, preview: a.preview, title: a.title }));
  }

  /** setup.preview: recomputed now from the current state, so the preview is never stale. */
  async preview(actionId: string): Promise<{ target: string; digest: string; preview: SetupAction }> {
    const current = await this.#refresh(actionId);
    return { target: actionId, digest: this.#digest(current), preview: current };
  }

  async #refresh(actionId: string): Promise<SetupAction> {
    const row = this.#o.db.get<ActionRow>('SELECT * FROM setup_actions WHERE id = ?', actionId);
    if (!row) throw new CommandError('not_found', { reason: 'setup_action' });
    const target = JSON.parse(row.target_json ?? 'null') as SetupAction['target'];
    const snapshot = latestSnapshot(this.#o.db, row.project_id);
    if (!snapshot) throw new CommandError('not_found', { reason: 'no_snapshot' });
    const seed = seedOf(row.kind, target, JSON.parse(row.preview_json) as { preview: SetupPreview });
    if (this.#actionId(row.project_id, seed) !== actionId) throw new CommandError('not_found', { reason: 'setup_action' });
    const a = await this.#materialize(row.project_id, snapshot.facts, seed, actionId, JSON.parse(row.instances_json ?? '[]') as string[]);
    this.#o.db.transaction(() => this.#save(a));
    return a;
  }

  /** setup.execute: alone, with its own log, audited; then readiness from the tools themselves. */
  async execute(actionId: string, grantDigest: string | null): Promise<SetupExecuteResult> {
    const action = await this.#refresh(actionId);
    if (!grantDigest || grantDigest !== this.#digest(action)) throw new CommandError('confirmation_mismatch', { reason: 'preview_digest' });
    if (this.#busy) throw new CommandError('busy', { reason: 'setup_running' });
    if (this.#o.runActive(action.projectId!)) throw new CommandError('busy', { reason: 'run_active' });
    // Taken in the same turn as the check: a second confirmation (a double click) finds it busy (one at a time).
    this.#busy = actionId;
    try {
      return await this.#execute(action, actionId);
    } finally {
      this.#busy = null;
    }
  }

  async #execute(action: SetupAction, actionId: string): Promise<SetupExecuteResult> {
    const project = await this.#o.projects.view(action.projectId!);
    if (action.kind === 'install_dependencies' && project.untrusted) throw new CommandError('untrusted_project');
    const { db, ports } = this.#o;
    const now = () => ports.clock.now().toISOString();
    db.transaction(() => {
      db.run("UPDATE setup_actions SET confirmed_at = ?, started_at = ?, state = 'running' WHERE id = ?", now(), now(), actionId);
      recordAudit(db, { id: newId(ports.random, 'aud'), at: ports.clock.now(), action: 'setup.confirmed', projectId: action.projectId, details: { actionId, kind: action.kind, target: JSON.stringify(action.target), digest: this.#digest(action) } });
    });
    let install: SetupExecuteResult['install'] = null;
    let log: SetupExecuteResult['log'] = null;
    let state: SetupAction['state'] = 'done';
    const reasons: Reason[] = [];
    try {
      switch (action.kind) {
        case 'install_tool': {
          install = await this.#o.tools.install(action.target.tool!, { digest: this.#o.tools.preview(action.target.tool!).digest, actionId });
          if (install.status === 'rejected') {
            state = 'rejected';
            reasons.push({ key: `setup.rejected.${install.reason}` });
          } else if (install.status === 'failed') {
            state = 'failed';
            reasons.push({ key: `setup.failed.${install.reason}`, ...(install.detail ? { params: { detail: install.detail } } : {}) });
          }
          break;
        }
        case 'accept_tool_version': {
          const t = action.target;
          db.transaction(() => {
            db.run('INSERT INTO tool_version_acceptances (id, project_id, tool, required_spec, required_from, version, path, accepted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING', newId(ports.random, 'acc'), action.projectId, t.tool, t.requiredSpec, null, t.version, null, now());
            recordAudit(db, { id: newId(ports.random, 'aud'), at: ports.clock.now(), action: 'tool.versionAccepted', projectId: action.projectId, details: { tool: t.tool, required: t.requiredSpec, version: t.version } });
          });
          break;
        }
        case 'install_dependencies':
        case 'download_osv_db': {
          const r = await this.#runCommand(action, project.rootPath);
          log = r.log;
          if (!r.ok) {
            state = 'failed';
            reasons.push(...r.reasons);
          } else reasons.push(...r.reasons);
          break;
        }
      }
    } catch (e) {
      // Whatever went wrong, the action ends «failed» with its reason, never stays «running».
      this.#o.logger.log('error', 'setup action failed unexpectedly', { actionId, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
      state = 'failed';
      reasons.push({ key: e instanceof CommandError && e.error.code === 'busy' ? 'setup.failed.busy' : 'setup.failed.internal' });
    }
    // 9.4 point 4: readiness from the tool itself, whatever the installer said. If it cannot be read now, the
    // action is still recorded as it ended; readiness is read again when next asked.
    const after = await this.instances(action.projectId!, { probe: true })
      .then((r) => r.items.filter((i) => action.instances.includes(i.instance)))
      .catch((e: unknown) => {
        this.#o.logger.log('error', 'readiness after setup could not be read', { actionId, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
        return [];
      });
    db.transaction(() => {
      db.run('UPDATE setup_actions SET finished_at = ?, state = ?, result = ?, reasons_json = ?, log_path = ?, log_sha256 = ? WHERE id = ?', now(), state, state, JSON.stringify(reasons), log?.path ?? null, log?.sha256 ?? null, actionId);
      recordAudit(db, { id: newId(ports.random, 'aud'), at: ports.clock.now(), action: state === 'done' ? 'setup.executed' : 'setup.failed', projectId: action.projectId, details: { actionId, kind: action.kind, state, readiness: after.map((a) => `${a.instance}=${a.readiness}`).join(',') } });
    });
    return { action: this.#view(actionId), readiness: after.map((a) => ({ instance: a.instance, readiness: a.readiness, reasons: a.reasons, actions: a.actions.map((s) => this.#actionId(action.projectId!, s)) })), log, install };
  }

  /** «ثبّت التبعيات» and the OSV download: a supervised process with its own redacted log in logs/setup/. */
  async #runCommand(action: SetupAction, root: string): Promise<{ ok: boolean; reasons: Reason[]; log: { path: string; sha256: string } | null }> {
    const { ports, layout } = this.#o;
    const base = await this.#o.environment.base();
    const env = computeChildEnv({ login: base.env, rules: this.#o.redaction.names(), allowSensitive: [], explicit: {} }).env;
    let argv = action.preview.command!;
    let cwd = posix.join(root, action.preview.cwd ?? '.');
    const extraEnv: Record<string, string> = {};
    const work = posix.join(layout.tmp, `setup-${newId(ports.random, 'tmp').slice(4)}`);
    await ports.fs.mkdir(work, 0o700);
    if (action.kind === 'download_osv_db') {
      const osv = await this.#o.tools.locate('osv-scanner');
      if (!osv) {
        await ports.fs.remove(work);
        return { ok: false, reasons: [{ key: 'setup.reason.toolMissing', params: { tool: 'osv-scanner' } }], log: null };
      }
      const eco = action.target.ecosystem as 'npm' | 'PyPI';
      await writeOsvTemplate(ports.fs, work, eco);
      argv = [osv.path, 'scan', 'source', '-r', work, '--download-offline-databases', '--offline-vulnerabilities', '--no-call-analysis=all', '--format', 'json', '--output-file', posix.join(work, 'osv.json')];
      cwd = work;
      extraEnv.OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY = layout.osvDb;
    }
    await ports.fs.mkdir(posix.join(layout.logs, 'setup'), 0o700);
    const logPath = posix.join(layout.logs, 'setup', `${action.id}-${ports.clock.now().toISOString().replace(/[:.]/g, '')}.log`);
    const writer = await ports.fs.openWriter(logPath, 0o600);
    const redactors = { out: this.#o.redaction.redactor().lineStream(), err: this.#o.redaction.redactor().lineStream() };
    const decoders = { out: new TextDecoder('utf-8'), err: new TextDecoder('utf-8') };
    const sink = (k: 'out' | 'err') => (chunk: Uint8Array) => {
      const lines = redactors[k].push(decoders[k].decode(chunk, { stream: true }));
      if (lines.length) void writer.write(new TextEncoder().encode(lines.join('')));
    };
    void writer.write(new TextEncoder().encode(`$ ${argv.join(' ')}\n`));
    this.#o.events.emit('setup.progress', { actionId: action.id, phase: 'running', bytes: null, totalBytes: null, messageKey: 'setup.phase.running', securityAlert: false });
    const token = Buffer.from(ports.random.bytes(24)).toString('base64url');
    const proc = this.#o.supervisor.start({
      argv,
      cwd,
      env: { ...env, ...extraEnv },
      token,
      tempDir: work,
      ledger: { kind: 'setup', runId: null, checkRunId: null },
      timeoutMs: SETUP_TIMEOUT_MS,
      idleTimeoutMs: null,
      onStdout: sink('out'),
      onStderr: sink('err'),
    });
    const r = await proc.done;
    for (const k of ['out', 'err'] as const) {
      const rest = [...redactors[k].push(decoders[k].decode()), ...redactors[k].end()];
      if (rest.length) await writer.write(new TextEncoder().encode(rest.join('')));
    }
    await writer.write(new TextEncoder().encode(`\n[exit ${r.exitCode ?? r.signal ?? r.spawnError ?? r.ended}]\n`));
    await writer.close();
    const h = await ports.fs.hashFile(logPath);
    await ports.fs.chmod(logPath, 0o400);
    await ports.fs.remove(work);
    const reasons: Reason[] = [];
    let ok = r.ended === 'exited' && r.exitCode === 0;
    if (r.spawnError) reasons.push({ key: 'setup.failed.spawn', params: { error: r.spawnError } });
    else if (r.ended !== 'exited') reasons.push({ key: `setup.failed.${r.ended}` });
    else if (r.exitCode !== 0) reasons.push({ key: 'setup.failed.exit', params: { code: r.exitCode ?? -1 } });
    if (ok && action.kind === 'download_osv_db') ok = await this.#recordOsvDb(action.target.ecosystem as 'npm' | 'PyPI');
    // G-DEV1-02: pnpm may exit non-zero after a successful install (ignored builds); the readiness that follows,
    // read from the tools themselves, is what counts — this result only reports what the command said.
    if (!ok && action.kind === 'install_dependencies' && action.target.tool === 'pnpm' && r.exitCode === 1) reasons.push({ key: 'setup.warning.pnpmIgnoredBuilds' });
    return { ok, reasons, log: { path: logPath, sha256: h.sha256 } };
  }

  async #recordOsvDb(eco: 'npm' | 'PyPI'): Promise<boolean> {
    const { ports, layout, db } = this.#o;
    const zip = posix.join(layout.osvDb, 'osv-scalibr', eco, 'all.zip');
    const st = await ports.fs.lstat(zip);
    if (!st?.isFile) return false;
    db.run(
      `INSERT INTO data_assets (id, kind, key, version_or_date, path, size, updated_at) VALUES (?, 'osv-db', ?, ?, ?, ?, ?)
       ON CONFLICT (kind, key) DO UPDATE SET version_or_date = excluded.version_or_date, path = excluded.path, size = excluded.size, updated_at = excluded.updated_at`,
      newId(ports.random, 'dat'),
      eco,
      ports.clock.now().toISOString().slice(0, 10),
      zip,
      st.size,
      ports.clock.now().toISOString(),
    );
    return true;
  }
}

/** A setup action's id: stable for the same need — the project, the kind, what it targets (not how it was found). */
export function setupActionId(projectId: string, seed: ActionSeed): string {
  const key = seed.kind === 'accept_tool_version' ? { kind: seed.kind, tool: seed.tool, requiredSpec: seed.requiredSpec, version: seed.version } : seed;
  return `set_${sha(`${projectId}\0${canonicalJson(key)}`).slice(0, 32)}`;
}

/** The command that installs a component's dependencies without changing its lock file where one exists. */
export function installCommand(manager: string, facts: readonly { key: string; component: string; value: unknown }[], component: string): { argv: string[]; lockfile: boolean } {
  const lock = facts.find((f) => (f.key === 'node.lockfile' || f.key === 'python.lockfile') && (f.component === component || f.component === '.'));
  const lockfile = lock !== undefined;
  switch (manager) {
    case 'pnpm':
      return { argv: ['pnpm', 'install', ...(lockfile ? ['--frozen-lockfile'] : [])], lockfile };
    case 'yarn':
      return { argv: ['yarn', 'install', ...(lockfile ? ['--frozen-lockfile'] : [])], lockfile };
    case 'bun':
      return { argv: ['bun', 'install', ...(lockfile ? ['--frozen-lockfile'] : [])], lockfile };
    case 'uv':
      return { argv: ['uv', 'sync', ...(lockfile ? ['--frozen'] : [])], lockfile };
    case 'poetry':
      return { argv: ['poetry', 'install', '--no-root'], lockfile };
    default:
      return { argv: lockfile ? ['npm', 'ci'] : ['npm', 'install'], lockfile };
  }
}

function seedOf(kind: SetupAction['kind'], t: SetupAction['target'], p: { preview: SetupPreview }): ActionSeed {
  switch (kind) {
    case 'install_tool':
      return { kind, tool: t.tool! };
    case 'install_dependencies':
      return { kind, component: t.component!, manager: t.tool!, ecosystem: t.ecosystem as 'npm' | 'PyPI' };
    case 'accept_tool_version': {
      const w = p.preview.warnings[0]?.params ?? {};
      return { kind, tool: t.tool!, requiredSpec: t.requiredSpec!, requiredFrom: String(w.from ?? ''), version: t.version!, path: null };
    }
    case 'download_osv_db':
      return { kind, ecosystem: t.ecosystem as 'npm' | 'PyPI' };
  }
}

/** E-09: a project with one lock file of the ecosystem, so osv-scanner downloads that ecosystem's database. */
async function writeOsvTemplate(fs: EnginePorts['fs'], dir: string, eco: 'npm' | 'PyPI'): Promise<void> {
  const enc = (s: string) => new TextEncoder().encode(s);
  if (eco === 'npm') {
    await fs.writeFileAtomic(posix.join(dir, 'package.json'), enc('{"name":"ayar-osv-template","version":"1.0.0","dependencies":{"left-pad":"1.3.0"}}\n'), 0o600);
    await fs.writeFileAtomic(
      posix.join(dir, 'package-lock.json'),
      enc(JSON.stringify({ name: 'ayar-osv-template', version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'ayar-osv-template', version: '1.0.0', dependencies: { 'left-pad': '1.3.0' } }, 'node_modules/left-pad': { version: '1.3.0' } } })),
      0o600,
    );
  } else {
    await fs.writeFileAtomic(posix.join(dir, 'requirements.txt'), enc('requests==2.31.0\n'), 0o600);
  }
}
