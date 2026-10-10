// The engine's domain services, created once the boot succeeded (catalog loaded, database usable, HMAC key
// loaded, event bus ready). Handlers reach them through the handler context; later phases add theirs here.
import type { Catalog } from '@ayar/catalog';
import { EnvironmentService } from '../environment/service.ts';
import { EvidenceService } from '../evidence/service.ts';
import { ProcessSupervisor } from '../executor/process.ts';
import { RunService } from '../executor/run.ts';
import { PlannerService } from '../planner/service.ts';
import type { EnginePorts, Logger } from '../ports/index.ts';
import { ProfileService } from '../profile/service.ts';
import { ProjectsService } from '../projects/service.ts';
import { rescrub, rescrubBackups } from '../redaction/rescrub.ts';
import { RedactionService } from '../redaction/service.ts';
import { SetupService } from '../setup/service.ts';
import type { DataLayout } from '../storage/data-dir.ts';
import type { Db } from '../storage/db.ts';
import type { HmacKey } from '../storage/hmac-key.ts';
import { readSettings } from '../storage/settings.ts';
import { TasksService } from '../tasks/service.ts';
import { loadToolRegistry } from '../tools/registry.ts';
import { ToolsService } from '../tools/service.ts';
import type { EventBus } from './event-bus.ts';
import type { RunGate } from './run-gate.ts';

export interface EngineServices {
  /** C-18: the single redaction instance (catalog patterns, user patterns, sensitive values). */
  redaction: RedactionService;
  /** C-09: profiles, approvals, export and import. */
  profiles: ProfileService;
  /** C-05 and C-06: the registry and its discoveries. */
  projects: ProjectsService;
  /** C-07: the login environment and the toolchains. */
  environment: EnvironmentService;
  /** C-20: kept task cards. */
  tasks: TasksService;
  /** C-17 part two: snapshots, the content store, evidence, retention. */
  evidence: EvidenceService;
  /** C-11: the managed tools. */
  tools: ToolsService;
  /** C-10 readiness and C-11 setup actions. */
  setup: SetupService;
  /** C-10: plans and saved groups. */
  planner: PlannerService;
  /** C-12: runs, and the run list of C-17. */
  runs: RunService;
  /**
   * C-18 after the fact [D-DEV4-07]: redacts the stored rows again with the current rules (new sensitive values,
   * new user patterns), and the backups too (G-DEV4-01). A failure is logged, never fatal (re-review R4).
   */
  rescrubStored(): void;
}

export interface ServicesInput {
  catalog: Catalog;
  db: Db;
  layout: DataLayout;
  ports: EnginePorts;
  events: EventBus;
  runGate: RunGate;
  logger: Logger;
  hmacKey: HmacKey;
  /** Tests point the home folder elsewhere. */
  home?: string;
  /** tools/cli's test hook: a login shell chosen by the host (never by the renderer). */
  testLoginShell?: string | null;
  /** tools/cli's test hook: extra managed-tool entries (AT-35's local server), never shipped. */
  testToolRegistry?: readonly unknown[];
}

export function createServices(o: ServicesInput): EngineServices {
  const rescrubStored = () => {
    try {
      const r = rescrub(o.db, redaction.redactor());
      if (r.rows) o.logger.log('info', 'stored rows redacted again with the current rules', { rows: r.rows });
    } catch (e) {
      o.logger.log('error', 'stored rows could not be redacted again', { error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
    }
    rescrubBackups(o.ports.fs, o.layout.backups, redaction.redactor(), o.logger).catch((e: unknown) => o.logger.log('error', 'backups could not be redacted again', { error: e instanceof Error ? e.message.slice(0, 300) : String(e) }));
  };
  const settings = readSettings(o.db, ['redaction.userPatterns', 'redaction.sensitiveNames']);
  const redaction = new RedactionService(o.catalog, settings['redaction.userPatterns'] ?? [], settings['redaction.sensitiveNames'] ?? []);
  const profiles = new ProfileService({ db: o.db, catalog: o.catalog, hmacKey: o.hmacKey, ports: o.ports, redaction });
  const projects = new ProjectsService({ db: o.db, ports: o.ports, catalog: o.catalog, events: o.events, logger: o.logger, hmacKey: o.hmacKey, redaction, profiles, ...(o.home ? { home: o.home } : {}) });
  const environment = new EnvironmentService({
    ports: o.ports,
    redaction,
    logger: o.logger,
    catalog: o.catalog,
    shellOverride: o.testLoginShell ?? null,
    onSensitiveValues: rescrubStored,
    settings: () => {
      const s = readSettings(o.db, ['environment.shell', 'environment.timeoutSeconds']);
      return { shell: s['environment.shell'] ?? null, timeoutSeconds: s['environment.timeoutSeconds'] ?? 10 };
    },
  });
  const tasks = new TasksService({ db: o.db, catalog: o.catalog, ports: o.ports, logger: o.logger });
  const evidence = new EvidenceService({ db: o.db, layout: o.layout, ports: o.ports, logger: o.logger, hmacKey: o.hmacKey, redaction });
  const tools = new ToolsService({
    db: o.db,
    ports: o.ports,
    layout: o.layout,
    logger: o.logger,
    events: o.events,
    registry: loadToolRegistry(o.testToolRegistry ?? []),
    staleAfterDays: o.catalog.manifest.staleAfterDays,
    path: async () => ((await environment.base()).env.PATH ?? '').split(':').filter(Boolean),
  });
  const supervisor = new ProcessSupervisor({ ports: o.ports, db: o.db, logger: o.logger });
  let runs: RunService | null = null;
  const setup = new SetupService({ db: o.db, catalog: o.catalog, ports: o.ports, layout: o.layout, logger: o.logger, events: o.events, profiles, projects, environment, tools, redaction, supervisor, runActive: (p) => runs?.busy(p) ?? false });
  const planner = new PlannerService({ db: o.db, catalog: o.catalog, ports: o.ports, profiles, setup });
  runs = new RunService({ db: o.db, catalog: o.catalog, ports: o.ports, layout: o.layout, logger: o.logger, events: o.events, runGate: o.runGate, planner, projects, environment, redaction, evidence, tools, supervisor, setupActive: (p) => setup.busyFor(p) });
  return { redaction, profiles, projects, environment, tasks, evidence, tools, setup, planner, runs, rescrubStored };
}
