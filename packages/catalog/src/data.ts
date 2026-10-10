// The built-in catalog data, as shipped. One JSON file per section of checks, plus the criteria, sections, AI
// templates, sources, C-18 patterns and the command policy. Nothing here is trusted until loadCatalog() has
// validated it (C-08: at build and at load).
import manifest from '../data/catalog.json' with { type: 'json' };
import behavior from '../data/checks/behavior.json' with { type: 'json' };
import code from '../data/checks/code.json' with { type: 'json' };
import custom from '../data/checks/custom.json' with { type: 'json' };
import design from '../data/checks/design.json' with { type: 'json' };
import integrity from '../data/checks/integrity.json' with { type: 'json' };
import performance from '../data/checks/performance.json' with { type: 'json' };
import security from '../data/checks/security.json' with { type: 'json' };
import commandPolicy from '../data/command-policy.json' with { type: 'json' };
import criteria from '../data/criteria.json' with { type: 'json' };
import aiTemplates from '../data/ai-templates.json' with { type: 'json' };
import redaction from '../data/redaction.json' with { type: 'json' };
import sections from '../data/sections.json' with { type: 'json' };
import sources from '../data/sources.json' with { type: 'json' };

/** Raw, unvalidated: deliberately `unknown` so that only loadCatalog() can turn it into a Catalog. */
export function builtinCatalogData(): unknown {
  return structuredClone({
    manifest,
    sections,
    criteria,
    checkFiles: [design, security, code, behavior, performance, integrity, custom],
    aiTemplates,
    sources,
    redaction,
    commandPolicy,
  });
}
