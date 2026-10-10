import { average } from '@mono/core';

/** يعرض متوسط قيم بصيغة نصية للواجهة. */
export function renderAverage(values) {
  return `المتوسط: ${average(values).toFixed(1)}`;
}
