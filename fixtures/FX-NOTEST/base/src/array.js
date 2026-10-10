/** أدوات مصفوفات. */

/** يقسم المصفوفة إلى أجزاء بالحجم المعطى. */
export function chunk(items, size) {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('size must be a positive integer');
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** يزيل التكرار مع حفظ ترتيب الظهور الأول. */
export function unique(items) {
  return [...new Set(items)];
}

/** يجمّع العناصر بمفتاح تحسبه الدالة. */
export function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}
