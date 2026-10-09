import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sectionVerdict } from '../src/verdict.ts';

describe('sectionVerdict (node:test)', () => {
  it('is pure only when every required check passed', () => {
    assert.equal(sectionVerdict([{ id: 'a', outcome: 'passed', required: true }]), 'pure');
    assert.equal(sectionVerdict([]), 'impure');
  });
});
