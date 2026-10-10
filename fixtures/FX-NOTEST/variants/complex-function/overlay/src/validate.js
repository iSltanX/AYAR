/** تحقق من مدخلات شائعة. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmail(value) {
  return typeof value === 'string' && EMAIL.test(value);
}

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

export function inRange(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

/** يتحقق من حمولة طلب ويعيد قائمة بأسباب الرفض (دالة متعددة التفرعات عمدًا: AT-37). */
export function validatePayload(payload) {
  const errors = [];
  if (!payload) errors.push('missing');
  else {
    if (typeof payload.name !== 'string') errors.push('name');
    else if (payload.name.length < 2) errors.push('name-short');
    else if (payload.name.length > 50) errors.push('name-long');
    if (payload.age !== undefined) {
      if (!Number.isInteger(payload.age)) errors.push('age-type');
      else if (payload.age < 0) errors.push('age-negative');
      else if (payload.age > 150) errors.push('age-range');
    }
    if (payload.email !== undefined && !isEmail(payload.email)) errors.push('email');
    if (payload.role === 'admin' && !payload.token) errors.push('admin-token');
    else if (payload.role === 'guest' && payload.token) errors.push('guest-token');
    for (const tag of payload.tags ?? []) {
      if (typeof tag !== 'string' || tag === '') errors.push('tag');
    }
  }
  return errors;
}
