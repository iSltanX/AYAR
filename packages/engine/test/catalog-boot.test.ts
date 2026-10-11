// C-08 at boot: the engine loads and validates the catalog, records its version and hash, warns about stale
// entries, and an invalid catalog keeps it from serving (it comes up degraded with catalog_invalid).
import { builtinCatalogData, loadCatalog, type CatalogData } from '@ayar/catalog';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot } from '../src/host/boot.ts';
import { nodePorts } from '../src/node/ports.ts';
import type { LogFields, Logger } from '../src/ports/index.ts';
import { fakeClock, tempRoot } from './support/tmp.ts';
import { join } from 'node:path';

let root: string;
let cleanup: () => void;
beforeEach(() => ({ dir: root, cleanup } = tempRoot()));
afterEach(() => cleanup());

function recordingLogger(): Logger & { lines: { level: string; message: string; fields?: LogFields }[] } {
  const lines: { level: string; message: string; fields?: LogFields }[] = [];
  return { lines, log: (level, message, fields) => lines.push({ level, message, ...(fields ? { fields } : {}) }), flush: () => {} };
}

describe('catalog at boot (C-08)', () => {
  it('loads the built-in catalog and records its version and hash in catalog_meta', async () => {
    const logger = recordingLogger();
    const clock = fakeClock('2026-10-10T08:00:00.000Z');
    const r = await boot({ dataDir: join(root, 'AYAR'), ports: { ...nodePorts, clock }, logger, appVersion: '0.1.0' });
    expect(r.state).toBe('ready');
    expect(r.catalog?.checks).toHaveLength(41);
    const row = r.db!.get<{ version: string; hash: string; loaded_at: string }>('SELECT version, hash, loaded_at FROM catalog_meta');
    expect(row).toEqual({ version: '1.3.0', hash: r.catalog!.hash, loaded_at: '2026-10-10T08:00:00.000Z' });
    expect(r.steps.find((s) => s.step === 'catalog.load')).toMatchObject({ ok: true, detail: { version: '1.3.0', checks: 41, stale: 0 } });
    r.db!.close();
  });

  it('refuses to serve with an invalid catalog: degraded, catalog_invalid, nothing recorded', async () => {
    const bad = builtinCatalogData() as CatalogData;
    (bad.checkFiles[0]!.checks[0] as { cost: string }).cost = 'free';
    const r = await boot({ dataDir: join(root, 'AYAR'), ports: nodePorts, logger: recordingLogger(), appVersion: '0.1.0', catalog: (now) => loadCatalog(bad, { now }) });
    expect(r).toMatchObject({ state: 'degraded', reason: 'catalog_invalid', db: null, catalog: null });
    expect(r.steps.find((s) => s.step === 'catalog.load')).toMatchObject({ ok: false, detail: { error: 'catalog_invalid', issues: 1 } });
  });

  it('serves with a stale entry, and logs a staleness warning for it', async () => {
    const logger = recordingLogger();
    const r = await boot({ dataDir: join(root, 'AYAR'), ports: { ...nodePorts, clock: fakeClock('2027-05-01T00:00:00.000Z') }, logger, appVersion: '0.1.0' });
    expect(r.state).toBe('ready');
    const warnings = logger.lines.filter((l) => l.message === 'catalog entry is stale');
    expect(warnings.length).toBeGreaterThanOrEqual(41);
    expect(warnings.find((w) => w.fields?.id === 'beh.unit')).toMatchObject({ level: 'warn', fields: { kind: 'check', verifiedAt: '2026-10-09' } });
    r.db!.close();
  });
});
