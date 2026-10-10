/** يؤخر تنفيذ الدالة حتى يمر الزمن دون استدعاء جديد. */
export function debounce(fn, waitMs) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

/** يسمح بتنفيذ واحد كل فترة زمنية. */
export function throttle(fn, intervalMs) {
  let last = -Infinity;
  return (...args) => {
    const now = Date.now();
    if (now - last >= intervalMs) {
      last = now;
      return fn(...args);
    }
    return undefined;
  };
}
