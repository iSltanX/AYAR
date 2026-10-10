// Arrow-key navigation of the input controls (FR-53, WAI-ARIA tabs and radio group patterns, 16.5): "next"
// follows the reading direction, disabled items are skipped, movement wraps, Home/End go to the ends, and a
// horizontal tab list ignores Up/Down.
import { describe, expect, it } from 'vitest';
import { arrowIndex } from '../../src/renderer/lib/controls.ts';

const all = [true, true, true, true];

describe('arrowIndex', () => {
  it('moves to the inline end with ArrowLeft in Arabic and ArrowRight in English', () => {
    expect(arrowIndex('ArrowLeft', 'rtl', 'horizontal', 1, all)).toBe(2);
    expect(arrowIndex('ArrowRight', 'rtl', 'horizontal', 1, all)).toBe(0);
    expect(arrowIndex('ArrowRight', 'ltr', 'horizontal', 1, all)).toBe(2);
    expect(arrowIndex('ArrowLeft', 'ltr', 'horizontal', 1, all)).toBe(0);
  });

  it('wraps at both ends and skips disabled items', () => {
    expect(arrowIndex('ArrowRight', 'ltr', 'horizontal', 3, all)).toBe(0);
    expect(arrowIndex('ArrowLeft', 'ltr', 'horizontal', 0, all)).toBe(3);
    expect(arrowIndex('ArrowRight', 'ltr', 'horizontal', 0, [true, false, false, true])).toBe(3);
    expect(arrowIndex('ArrowLeft', 'rtl', 'horizontal', 0, [true, false, true, true])).toBe(2);
  });

  it('goes to the first and last enabled items with Home and End', () => {
    expect(arrowIndex('Home', 'rtl', 'horizontal', 2, [false, true, true, true])).toBe(1);
    expect(arrowIndex('End', 'ltr', 'both', 0, [true, true, true, false])).toBe(2);
  });

  it('keeps Up/Down out of a horizontal tab list and Left/Right out of a vertical list', () => {
    expect(arrowIndex('ArrowDown', 'ltr', 'horizontal', 1, all)).toBeNull();
    expect(arrowIndex('ArrowUp', 'rtl', 'horizontal', 1, all)).toBeNull();
    expect(arrowIndex('ArrowLeft', 'rtl', 'vertical', 1, all)).toBeNull();
    expect(arrowIndex('ArrowDown', 'rtl', 'vertical', 1, all)).toBe(2);
    expect(arrowIndex('ArrowDown', 'ltr', 'both', 1, all)).toBe(2);
  });

  it('ignores other keys and groups with nothing enabled', () => {
    expect(arrowIndex('Enter', 'ltr', 'both', 1, all)).toBeNull();
    expect(arrowIndex('ArrowRight', 'ltr', 'both', 0, [false, false])).toBeNull();
    expect(arrowIndex('ArrowRight', 'ltr', 'both', 0, [])).toBeNull();
  });
});
