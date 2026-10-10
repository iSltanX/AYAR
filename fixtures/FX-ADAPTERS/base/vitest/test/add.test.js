import { expect, it } from 'vitest';
import { add } from '../src/add.js';

it('يجمع عددين', () => {
  expect(add(2, 3)).toBe(5);
});
