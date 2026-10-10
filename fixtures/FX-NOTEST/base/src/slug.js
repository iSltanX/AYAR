/** معرّفات صالحة للروابط. */

export function slugify(text) {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

export function uniqueSlug(text, taken) {
  const base = slugify(text);
  let candidate = base;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${base}-${n}`;
  return candidate;
}
