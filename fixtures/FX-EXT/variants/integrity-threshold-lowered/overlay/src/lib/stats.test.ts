import { describe, expect, it } from 'vitest';
import { median } from './stats';

describe('median', () => {
  it('يعيد الوسيط لعدد فردي من القيم', () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it('يعيد متوسط الوسطين لعدد زوجي', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it('الوسيط لأعداد متعددة الخانات', () => {
    expect(median([10, 9, 100])).toBe(10);
  });
  it('القائمة الفارغة صفر', () => {
    expect(median([])).toBe(0);
  });
});
