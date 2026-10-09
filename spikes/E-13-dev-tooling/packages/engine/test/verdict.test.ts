import { describe, expect, it } from 'vitest';
import { sectionVerdict } from '../src/verdict.ts';

describe('sectionVerdict (vitest)', () => {
  it('is pure only when every required check passed', () => {
    expect(sectionVerdict([{ id: 'a', outcome: 'passed', required: true }, { id: 'b', outcome: 'failed', required: false }])).toBe('pure');
    expect(sectionVerdict([{ id: 'a', outcome: 'needs-review', required: true }])).toBe('impure');
  });
  it('blocked wins', () => {
    expect(sectionVerdict([{ id: 'a', outcome: 'blocked', required: true }])).toBe('blocked');
  });
});
