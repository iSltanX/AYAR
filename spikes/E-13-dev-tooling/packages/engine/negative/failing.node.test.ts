import { it } from 'node:test';
import assert from 'node:assert/strict';
import { sectionVerdict } from '../src/verdict.ts';

it('deliberately fails', () => {
  assert.equal(sectionVerdict([{ id: 'a', outcome: 'failed', required: true }]), 'pure');
});
