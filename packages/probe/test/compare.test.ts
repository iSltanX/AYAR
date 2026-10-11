// C-14 «المقارنة البصرية» (G-28): the same image matches; a change under 0.1% of the pixels or in anti-aliasing alone
// is within the tolerance; a visible change differs, with its diff image; a different size differs as a whole.
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { compareImages, DIFF_LIMIT } from '../src/compare.ts';

function image(w: number, h: number, paint?: (x: number, y: number) => [number, number, number] | null): Uint8Array {
  const p = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const c = paint?.(x, y) ?? [255, 255, 255];
    p.data[i] = c[0];
    p.data[i + 1] = c[1];
    p.data[i + 2] = c[2];
    p.data[i + 3] = 255;
  }
  return new Uint8Array(PNG.sync.write(p));
}

describe('compareImages', () => {
  it('matches the same image, with no diff image', () => {
    const a = image(100, 100);
    expect(compareImages(a, a)).toEqual({ ratio: 0, differs: false, diff: null, sameSize: true });
  });
  it('tolerates fewer differing pixels than the limit, and reports a visible change over it', () => {
    const base = image(100, 100);
    const speck = image(100, 100, (x, y) => (x === 5 && y === 5 ? [0, 0, 0] : null));
    const small = compareImages(base, speck);
    expect(small.ratio).toBeLessThanOrEqual(DIFF_LIMIT);
    expect(small.differs).toBe(false);
    const box = image(100, 100, (x, y) => (x >= 10 && x < 30 && y >= 10 && y < 30 ? [11, 92, 213] : null));
    const big = compareImages(base, box);
    expect(big.differs).toBe(true);
    expect(big.ratio).toBeCloseTo(0.04, 2);
    expect(PNG.sync.read(Buffer.from(big.diff!)).width).toBe(100);
  });
  it('makes images of different sizes differ as a whole', () => {
    const r = compareImages(image(100, 100), image(100, 140));
    expect([r.ratio, r.differs, r.sameSize]).toEqual([1, true, false]);
    expect(PNG.sync.read(Buffer.from(r.diff!)).height).toBe(140);
  });
});
