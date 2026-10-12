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
import { PurityService } from '../purity/service.ts';
import { runJob } from '../verdict/jobs.ts';
import { workerPool } from '../verdict/pool.ts';
import { VerdictService } from '../verdict/service.ts';
import { loadToolRegistry } from '../tools/registry.ts';
import { BaselineService } from '../probe/baselines.ts';
import { BrowserService, type BrowserBuild } from '../probe/browser.ts';
import { ProbeService } from '../probe/service.ts';
import { ToolsService } from '../tools/service.ts';
import { IntegrityService } from '../integrity/service.ts';
import { ReviewsService } from '../reviews/service.ts';
import { ReportsService } from '../reports/service.ts';
import { AiChecksService } from '../ai-checks/service.ts';
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
  /** C-15 and C-16 (DEV-6): reading reports in worker threads, the verdict, the findings, results.query. */
  verdict: VerdictService;
  /** C-19 (DEV-6): the purity index of rounds and sections. */
  purity: PurityService;
  /** C-14 (DEV-7): the probe's browser and the reference images. */
  browsers: BrowserService;
  baselines: BaselineService;
  /** C-22 (DEV-9): the integrity guard and the four integrity checks. */
  integrity: IntegrityService;
  /** C-16 (DEV-9): human reviews (FR-34, D-35). */
  reviews: ReviewsService;
  /** C-21 and C-23 (DEV-9): report/1, its two formats, the clipboard text, the exports, the comparison. */
  reports: ReportsService;
  /** C-25 (DEV-9): model checks — needs, instruction files, result files as claims. */
  aiChecks: AiChecksService;
  /**
   * C-18 after the fact [D-DEV4-07]: redacts the stored rows again with the current rules (new sensitive values,
   * new user patterns), and the backups too (G-DEV4-01). A failure is logged, never fatal (re-review R4).
   */
  rescrubStored(): void;
  /** The data folder (C-17): data.purge (DEV-12) empties its folders. */
  layout: DataLayout;
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
  /** tools/cli's test hook: the probe browser's build from a loopback server (task 6's tests), never shipped. */
  testBrowserBuild?: BrowserBuild | null;
  /** The module the verdict's worker threads start from (the engine's entry; C-13). */
  workerEntry?: URL | string;
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
  const evidence = new EvidenceService({ db: o.db, layout: o.layout, ports: o.ports, logger: o.logger, hmacKey: o.hmacKey, redaction });
  const tasks = new TasksService({ db: o.db, catalog: o.catalog, ports: o.ports, logger: o.logger, evidence });
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
  const browsers = new BrowserService({ db: o.db, ports: o.ports, layout: o.layout, logger: o.logger, events: o.events, ...(o.testBrowserBuild ? { build: o.testBrowserBuild } : {}) });
  const baselines = new BaselineService({ db: o.db, ports: o.ports, layout: o.layout, evidence, logger: o.logger });
  const probe = new ProbeService({ host: o.ports.probe, logger: o.logger });
  let runs: RunService | null = null;
  let tasksVerify: ((runId: string, projectId: string) => Promise<void>) | null = null;
  const setup = new SetupService({ db: o.db, catalog: o.catalog, ports: o.ports, layout: o.layout, logger: o.logger, events: o.events, profiles, projects, environment, tools, browsers, redaction, supervisor, runActive: (p) => runs?.busy(p) ?? false });
  const planner = new PlannerService({ db: o.db, catalog: o.catalog, ports: o.ports, profiles, setup });
  // C-13: the readers run in worker threads (two at a time), started from the engine's own entry module; if none
  // can start at all (a packaged archive a worker cannot load), in this thread, logged once.
  const pool = workerPool(o.workerEntry ?? new URL('../verdict/worker-entry.ts', import.meta.url), 2, {
    run: runJob,
    onFallback: (error) => o.logger.log('warn', 'worker threads could not start: reports are read in the engine thread', { error: error.slice(0, 300) }),
  });
  const verdict = new VerdictService({ db: o.db, catalog: o.catalog, ports: o.ports, logger: o.logger, events: o.events, pool, hmacKey: o.hmacKey, redaction });
  const purity = new PurityService({ db: o.db, catalog: o.catalog, ports: o.ports, logger: o.logger, evidence });
  const integrity = new IntegrityService({ db: o.db, catalog: o.catalog, logger: o.logger, evidence, verdict, readFile: (path) => o.ports.fs.readFile(path) });
  runs = new RunService({ db: o.db, catalog: o.catalog, ports: o.ports, layout: o.layout, logger: o.logger, events: o.events, runGate: o.runGate, planner, projects, environment, redaction, evidence, tools, supervisor, verdict, purity, setupActive: (p) => setup.busyFor(p), probe, browsers, baselines, integrity, afterRun: (runId, projectId) => tasksVerify?.(runId, projectId) ?? Promise.resolve() });
  const reviews = new ReviewsService({ db: o.db, catalog: o.catalog, ports: o.ports, logger: o.logger, evidence, purity, verdict, integrity, tasks, projects, runs });
  const reports = new ReportsService({ db: o.db, catalog: o.catalog, ports: o.ports, logger: o.logger, evidence, redaction, purity, verdict, projects, profiles, tasks, runs, integrity });
  const aiChecks = new AiChecksService({ db: o.db, catalog: o.catalog, ports: o.ports, logger: o.logger, redaction, projects, profiles, verdict, events: o.events, evidence });
  tasksVerify = (runId, projectId) => tasks.verifyAfterRun(runId, projectId).then(() => undefined);
  return { redaction, profiles, projects, environment, tasks, evidence, tools, setup, planner, runs, verdict, purity, browsers, baselines, integrity, reviews, reports, aiChecks, rescrubStored, layout: o.layout };
}
