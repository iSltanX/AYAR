import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import StatusRow from '../src/StatusRow.svelte';
import { createCounter } from '../src/counter.svelte.ts';

it('renders a Svelte 5 component with Arabic text (server render)', () => {
  const { body } = render(StatusRow, { props: { label: 'فحوص ناجحة', outcome: 'passed', count: 7 } });
  expect(body).toContain('فحوص ناجحة: 7');
  expect(body).toContain('data-outcome="passed"');
});

it('runes work in .svelte.ts modules', () => {
  const c = createCounter(2);
  c.increment();
  expect([c.count, c.doubled]).toEqual([3, 6]);
});
