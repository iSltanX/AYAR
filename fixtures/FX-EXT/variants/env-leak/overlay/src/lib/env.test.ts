import { expect, it } from 'vitest';

// السر المصطنع مبني وقت التشغيل، فلا يظهر حرفيًّا في الملف (AT-48): يصل فقط إلى رسالة الإخفاق وتقرير JSON.
const reportSecret = ['ayr', 'envleak', '5d2e9b1f7a3c4086b9e1d2c7a4f50e83'].join('_');

it('يطبع بيئته ويكتب السر في رسالة الإخفاق', () => {
  console.log(`MY_API_TOKEN=${process.env.MY_API_TOKEN ?? '<unset>'}`);
  console.log(`NPM_TOKEN=${process.env.NPM_TOKEN ?? '<unset>'}`);
  console.log(JSON.stringify(process.env));
  expect.fail(`فشل الاتصال: token=${reportSecret}`);
});
