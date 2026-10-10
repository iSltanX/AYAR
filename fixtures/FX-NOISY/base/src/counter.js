import fs from 'node:fs';

/** يزيد عدّاد التشغيلات في ملف البيانات المتتبع data/runs.json ويعيد القيمة الجديدة. */
export function recordRun(root, now = new Date()) {
  const file = new URL('data/runs.json', root);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  data.runs += 1;
  data.last = now.toISOString();
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return data;
}

export function formatSummary(data) {
  return `runs=${data.runs} last=${data.last}`;
}
