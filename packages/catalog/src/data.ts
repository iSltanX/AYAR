// The built-in catalog data, as shipped. One JSON file per section of checks, plus the criteria, sections, AI
// templates, sources, C-18 patterns, the command policy, the knowledge base kb/1 and the card types, AYAR's rules and its Semgrep rules (DEV-6). Nothing here is trusted until loadCatalog() has
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
import cards from '../data/cards.json' with { type: 'json' };
import kbDepths from '../data/kb/depths.json' with { type: 'json' };
import kbEcosystems from '../data/kb/ecosystems.json' with { type: 'json' };
import kbInputs from '../data/kb/inputs.json' with { type: 'json' };
import kbItemChecks from '../data/kb/item-checks.json' with { type: 'json' };
import kbItems from '../data/kb/items.json' with { type: 'json' };
import kbLifecycle from '../data/kb/lifecycle.json' with { type: 'json' };
import kbManifest from '../data/kb/manifest.json' with { type: 'json' };
import kbMethods from '../data/kb/methods.json' with { type: 'json' };
import kbPresets from '../data/kb/presets.json' with { type: 'json' };
import kbRules from '../data/kb/rules.json' with { type: 'json' };
import kbSources from '../data/kb/sources.json' with { type: 'json' };
import kbTerms from '../data/kb/terms.json' with { type: 'json' };
import kbTools from '../data/kb/tools.json' with { type: 'json' };
import kbVerification from '../data/kb/verification.json' with { type: 'json' };
import redaction from '../data/redaction.json' with { type: 'json' };
import rules from '../data/rules.json' with { type: 'json' };
import semgrep from '../data/semgrep.json' with { type: 'json' };
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
    kb: {
      manifest: kbManifest,
      inputs: kbInputs,
      rules: kbRules,
      items: kbItems,
      methods: kbMethods,
      lifecycle: kbLifecycle,
      depths: kbDepths,
      presets: kbPresets,
      ecosystems: kbEcosystems,
      tools: kbTools,
      sources: kbSources,
      terms: kbTerms,
      verification: kbVerification,
      itemChecks: kbItemChecks,
    },
    cards,
    rules,
    semgrep,
  });
}
