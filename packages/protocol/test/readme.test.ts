import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ownershipMarkdown } from '../src/index.ts';

describe('README ownership tables (G-19)', () => {
  it('match the registries', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    const { commands, events } = ownershipMarkdown();
    expect(readme).toContain(commands);
    expect(readme).toContain(events);
  });
});
