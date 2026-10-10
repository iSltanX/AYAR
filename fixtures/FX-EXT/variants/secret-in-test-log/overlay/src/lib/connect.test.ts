import { expect, it } from 'vitest';
import { connect } from './connect';

// مفتاح مصطنع لمشروع اختبار عِيَار؛ ليس سرًّا حقيقيًّا.
const API_KEY = 'ayr_live_8f3c1a77d02e4b58a6c1e0d94f7b2a35d0c4';

it('يتصل بالخدمة بالمفتاح المعدّ', () => {
  console.log(`connecting with key ${API_KEY}`);
  expect(connect(API_KEY)).toBe(true);
});
