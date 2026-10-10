// What the advisor and the cards read from a discovery snapshot (C-20 «حقائق الاكتشاف»): the project's
// ecosystems in the vocabulary of 28.9 (C-06 wins over the `stack` text), the migration folders (C-20 rule 5),
// and, for a card's «السياق», the test framework and a few existing tests.
import type { DiscoverySnapshot, Fact } from '@ayar/protocol';
import type { CardProjectContext } from '../tasks/cards.ts';
import type { AdvisorFacts } from './context.ts';

const obj = (f: Fact): Record<string, unknown> => (f.value !== null && typeof f.value === 'object' && !Array.isArray(f.value) ? (f.value as Record<string, unknown>) : {});

/** C-06 fact → 28.9 ecosystem id. */
function ecosystemOf(f: Fact): string | null {
  const v = obj(f);
  switch (f.key) {
    case 'node.package':
    case 'runtime.node':
      return 'js';
    case 'python.project':
    case 'python.requirements':
    case 'python.manager':
    case 'runtime.python':
      return 'python';
    case 'type.obsidianPlugin':
      return 'obsidian';
    case 'type.browserExtension':
      return 'extension';
    case 'type.desktopApp':
      return v.kind === 'electron' || v.kind === 'tauri' ? 'electron' : v.kind === 'swift' || v.kind === 'xcode' ? 'swift' : null;
    case 'ecosystem.other':
      return typeof v.kind === 'string' && ['rust', 'go', 'swift'].includes(v.kind) ? v.kind : null;
    default:
      return null;
  }
}

export function advisorFactsFromSnapshot(snapshot: DiscoverySnapshot | null): AdvisorFacts {
  if (!snapshot) return {};
  const ecosystems = [...new Set(snapshot.facts.map(ecosystemOf).filter((e): e is string => e !== null))].sort();
  const migrationsDetected = [
    ...new Set(
      snapshot.facts
        .filter((f) => f.key === 'data.migrations')
        .flatMap((f) => obj(f).dirs)
        .filter((d): d is string => typeof d === 'string'),
    ),
  ].sort();
  return { ecosystems, migrationsDetected };
}

export function cardContextFromSnapshot(snapshot: DiscoverySnapshot | null): CardProjectContext {
  if (!snapshot) return {};
  const frameworks = [...new Set(snapshot.facts.filter((f) => f.key === 'testing.framework').map((f) => obj(f).name).filter((n): n is string => typeof n === 'string'))];
  const examples = Object.values(snapshot.inventory.testFiles).flatMap((t) => t.paths).slice(0, 5);
  return { framework: frameworks.length ? frameworks.join('، ') : null, examples };
}
