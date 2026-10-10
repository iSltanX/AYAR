import { describe, expect, it } from 'vitest';
import { countChars, countWords, formatSummary, summarize } from './count';

describe('countWords', () => {
  it('يعدّ الكلمات العربية', () => {
    expect(countWords('مرحبا بكم في عِيَار')).toBe(4);
  });
  it('يتجاهل المسافات الزائدة', () => {
    expect(countWords('  واحد   اثنان  ')).toBe(2);
  });
  it('النص الفارغ صفر كلمة', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
  });
});

describe('countChars', () => {
  it('يعدّ الحروف دون المسافات افتراضيًا', () => {
    expect(countChars('أ ب ج', false)).toBe(3);
  });
  it('يعدّ المسافات عند الطلب', () => {
    expect(countChars('أ ب ج', true)).toBe(5);
  });
  it('يعدّ الرموز المركبة بنقطة الشيفرة', () => {
    expect(countChars('😀😀', true)).toBe(2);
  });
});

describe('summarize و formatSummary', () => {
  it('يجمع الإحصاءات', () => {
    expect(summarize('كلمة واحدة')).toEqual({ words: 2, chars: 9 });
  });
  it('يصوغ الناتج بالأرقام العربية', () => {
    expect(formatSummary({ words: 3, chars: 12 })).toMatchSnapshot();
  });
});
