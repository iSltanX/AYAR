import { describe, expect, it } from 'vitest';
import { average, sum } from '../src/index.js';

describe('core', () => {
  it('يجمع القيم', () => {
    expect(sum([1, 2, 3])).toBe(6);
  });
  it('يحسب المتوسط', () => {
    expect(average([2, 4])).toBe(4);
  });
  it('متوسط القائمة الفارغة صفر', () => {
    expect(average([])).toBe(0);
  });
});
