// Build-time validation of the catalog (C-08: "يُتحقق منها عند البناء"): the same loadCatalog() the engine runs
// at boot. Exit 1 on an invalid catalog, so `npm run build` fails and an invalid catalog never ships.
import { CatalogError, loadCatalog } from '../src/index.ts';

try {
  const { catalog, stale } = loadCatalog(undefined, { now: new Date() });
  process.stdout.write(`catalog ${catalog.version} valid: ${catalog.checks.length} checks, ${catalog.criteria.length} criteria, hash ${catalog.hash.slice(0, 12)}\n`);
  for (const s of stale) process.stdout.write(`stale: ${s.kind} ${s.id} verified ${s.verifiedAt} (${s.ageDays} days)\n`);
} catch (e) {
  if (e instanceof CatalogError) {
    for (const issue of e.issues) process.stderr.write(`catalog: ${issue}\n`);
    process.exit(1);
  }
  throw e;
}
