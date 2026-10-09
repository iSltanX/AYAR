import { expect, it } from 'vitest';
import { sectionVerdict } from '../src/verdict.ts';

it('deliberately fails', () => {
  expect(sectionVerdict([{ id: 'a', outcome: 'failed', required: true }])).toBe('pure');
});
