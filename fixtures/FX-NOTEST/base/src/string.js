/** أدوات نصوص. */

export function capitalize(text) {
  return text === '' ? text : text[0].toUpperCase() + text.slice(1);
}

export function truncate(text, max, ellipsis = '…') {
  if (max < ellipsis.length) throw new RangeError('max is shorter than the ellipsis');
  return text.length <= max ? text : text.slice(0, max - ellipsis.length) + ellipsis;
}

export function padCenter(text, width, fill = ' ') {
  const total = Math.max(0, width - text.length);
  const left = Math.floor(total / 2);
  return fill.repeat(left) + text + fill.repeat(total - left);
}
