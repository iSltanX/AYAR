/** عدّ الكلمات والحروف للنص العربي والإنجليزي. */

export interface TextStats {
  words: number;
  chars: number;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  return trimmed.split(/\s+/u).length;
}

export function countChars(text: string, countSpaces: boolean): number {
  const chars = [...text];
  return countSpaces ? chars.length : chars.filter((c) => !/\s/u.test(c)).length;
}

export function summarize(text: string, countSpaces = false): TextStats {
  return { words: countWords(text), chars: countChars(text, countSpaces) };
}

/** صياغة الناتج للعرض بالأرقام العربية. */
export function formatSummary(stats: TextStats): string {
  const nf = new Intl.NumberFormat('ar-EG');
  return `الكلمات: ${nf.format(stats.words)} | الحروف: ${nf.format(stats.chars)}`;
}
