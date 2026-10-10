import { expect, it } from 'vitest';
import { toSlug } from './legacy';

it('يحوّل المسافات إلى شرطات', () => {
  expect(toSlug('عدّاد الكلمات')).toBe('عدّاد-الكلمات');
});
