/** أدوات تواريخ (بالتوقيت العالمي). */

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

export function daysBetween(from, to) {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

export function isWeekend(date) {
  const day = date.getUTCDay();
  return day === 5 || day === 6;
}
