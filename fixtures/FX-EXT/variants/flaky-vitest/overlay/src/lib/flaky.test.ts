import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

// تذبذب بحتمية مضبوطة لاختبار وضع التكرار (AT-15، beh.stability).
// «البذرة» هي رقم التشغيل: يحفظه الاختبار في ملف داخل المجلد المؤقت للنظام (مفتاحه مسار المشروع)،
// فيفشل في التشغيلات 0 و2 و4 وينجح في 1 و3 و5. حذف ملف العدّاد يعيد التسلسل من الصفر.
const key = createHash('sha1').update(process.cwd()).digest('hex').slice(0, 12);
const counterFile = path.join(os.tmpdir(), `ayar-fx-ext-flaky-${key}.count`);

function nextRun(): number {
  const run = fs.existsSync(counterFile) ? Number(fs.readFileSync(counterFile, 'utf8')) : 0;
  fs.writeFileSync(counterFile, String(run + 1));
  return run;
}

it('يستجيب للطلب المتقطع', () => {
  expect(nextRun() % 2).toBe(1);
});
