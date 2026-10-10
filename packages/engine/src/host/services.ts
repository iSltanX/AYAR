// The engine's domain services, created once the boot succeeded (catalog loaded, database usable). Handlers
// reach them through the handler context; later phases add theirs here.
import type { Catalog } from '@ayar/catalog';
import type { Db } from '../storage/db.ts';
import { readSettings } from '../storage/settings.ts';
import { RedactionService } from '../redaction/service.ts';

export interface EngineServices {
  /** C-18: the single redaction instance (catalog patterns, user patterns, sensitive values). */
  redaction: RedactionService;
}

export function createServices(o: { catalog: Catalog; db: Db }): EngineServices {
  const settings = readSettings(o.db, ['redaction.userPatterns', 'redaction.sensitiveNames']);
  return {
    redaction: new RedactionService(o.catalog, settings['redaction.userPatterns'] ?? [], settings['redaction.sensitiveNames'] ?? []),
  };
}
