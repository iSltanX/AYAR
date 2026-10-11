// C-14 «المقارنة البصرية» (G-28: the engine compares, the classifier judges): a capture against the approved
// reference of its key, pixel by pixel with pixelmatch — the colour threshold 0.1 and anti-aliased pixels detected
// and not counted — and the share of differing pixels against C-14's default limit (0.1% of the pixels). Images of
// different sizes differ as a whole (the page's height changed). The diff image shows where.
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/** C-14: «فرق فوق العتبة (افتراضيًا 0.1% من البكسلات مع كشف التنعيم)». */
export const DIFF_LIMIT = 0.001;
export const COLOR_THRESHOLD = 0.1;

export interface ImageComparison {
  /** The share of pixels that differ (0–1); 1 when the sizes differ. */
  ratio: number;
  differs: boolean;
  /** The diff image (PNG), or null when the two are the same size and match. */
  diff: Uint8Array | null;
  sameSize: boolean;
}

export function compareImages(reference: Uint8Array, capture: Uint8Array, limit = DIFF_LIMIT): ImageComparison {
  const a = PNG.sync.read(Buffer.from(reference));
  const b = PNG.sync.read(Buffer.from(capture));
  if (a.width !== b.width || a.height !== b.height) {
    // The sizes differ: the diff shows the capture over the reference's frame, every pixel counted as different.
    const w = Math.max(a.width, b.width);
    const h = Math.max(a.height, b.height);
    const out = new PNG({ width: w, height: h });
    out.data.fill(0);
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
      const s = (y * b.width + x) * 4;
      const d = (y * w + x) * 4;
      out.data[d] = 255;
      out.data[d + 1] = Math.round(b.data[s + 1]! * 0.3);
      out.data[d + 2] = Math.round(b.data[s + 2]! * 0.3);
      out.data[d + 3] = 255;
    }
    return { ratio: 1, differs: true, diff: new Uint8Array(PNG.sync.write(out)), sameSize: false };
  }
  const out = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, out.data, a.width, a.height, { threshold: COLOR_THRESHOLD, includeAA: false });
  const ratio = n / (a.width * a.height);
  const differs = ratio > limit;
  return { ratio, differs, diff: n > 0 ? new Uint8Array(PNG.sync.write(out)) : null, sameSize: true };
}
