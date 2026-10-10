// The engine's domain services, created once the boot succeeded (catalog loaded, database usable, HMAC key
// loaded, event bus ready). Handlers reach them through the handler context; later phases add theirs here.
import type { Catalog } from '@ayar/catalog';
import { EnvironmentService } from '../environment/service.ts';
import type { EnginePorts, Logger } from '../ports/index.ts';
import { ProfileService } from '../profile/service.ts';
import { ProjectsService } from '../projects/service.ts';
import { RedactionService } from '../redaction/service.ts';
import type { Db } from '../storage/db.ts';
import type { HmacKey } from '../storage/hmac-key.ts';
import { readSettings } from '../storage/settings.ts';
import type { EventBus } from './event-bus.ts';

export interface EngineServices {
  /** C-18: the single redaction instance (catalog patterns, user patterns, sensitive values). */
  redaction: RedactionService;
  /** C-09: profiles, approvals, export and import. */
  profiles: ProfileService;
  /** C-05 and C-06: the registry and its discoveries. */
  projects: ProjectsService;
  /** C-07: the login environment and the toolchains. */
  environment: EnvironmentService;
}

export interface ServicesInput {
  catalog: Catalog;
  db: Db;
  ports: EnginePorts;
  events: EventBus;
  logger: Logger;
  hmacKey: HmacKey;
  /** Tests point the home folder elsewhere. */
  home?: string;
  /** tools/cli's test hook: a login shell chosen by the host (never by the renderer). */
  testLoginShell?: string | null;
}

export function createServices(o: ServicesInput): EngineServices {
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
    settings: () => {
      const s = readSettings(o.db, ['environment.shell', 'environment.timeoutSeconds']);
      return { shell: s['environment.shell'] ?? null, timeoutSeconds: s['environment.timeoutSeconds'] ?? 10 };
    },
  });
  return { redaction, profiles, projects, environment };
}
