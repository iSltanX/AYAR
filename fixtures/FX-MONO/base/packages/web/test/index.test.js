import { describe, expect, it } from 'vitest';
import { renderAverage } from '../src/index.js';

describe('web', () => {
  it('يصوغ المتوسط', () => {
    expect(renderAverage([1, 2])).toBe('المتوسط: 1.5');
  });
});
