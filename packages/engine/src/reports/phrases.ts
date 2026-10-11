// 16.7 «نبرة النص» and FR-71's words (AT-43, AT-44): what «لك» never says, and the words that mean a pass are never
// attached to a model check or a model claim, in any format and any export. «تم» and «أُصلح» belong to a re-check
// that passed, nowhere else. The checks are textual and deliberately plain: a sentence pattern, not a parser.
export const FORBIDDEN_AR: readonly RegExp[] = [
  /آمن تمامًا|آمنة تمامًا|آمن بالكامل/u,
  /جاهز للإنتاج|جاهزة للإنتاج/u,
  /(?<![^\s،.؛:(])لا مشكلات(?![^\s،.؛:)]*\s*(في|ضمن|على|بين|خلال))/u,
  /خالٍ من العيوب|خالي من العيوب|بلا عيوب|بلا أخطاء/u,
  /مضمون|نضمن|ضمان كامل/u,
  /100%\s*(آمن|سليم|صحيح)/u,
];
export const FORBIDDEN_EN: readonly RegExp[] = [
  /\b(completely|fully|totally|entirely) (safe|secure)\b/i,
  /\bproduction[- ]ready\b/i,
  /\bno (issues|problems|defects)\b(?!\s+(in|within|among|across|during)\b)/i,
  /\b(bug|defect|error)[- ]free\b/i,
  /\bguarantee[ds]?\b/i,
  /\b100%\s*(safe|secure|correct)\b/i,
];

/** The forbidden phrases a human text holds (empty when clean). */
export function forbiddenPhrases(text: string, lang: 'ar' | 'en'): string[] {
  const list = lang === 'ar' ? FORBIDDEN_AR : FORBIDDEN_EN;
  return list.map((re) => re.exec(text)?.[0] ?? null).filter((m): m is string => m !== null);
}

/**
 * FR-71: a pass word («اجتاز» / passed) within the same line as a model check's or a model claim's id or label is
 * never written. Lines are the unit: a report line names one thing.
 */
export function passAttributedToModel(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const aboutModel = /\bAI-[A-Z]{3,8}-\d{3,}(?:\.\d+)?\b|ادعاء نموذج|فحص نموذج|تعليمات مولّدة|model claim|model check|generated instructions/i.test(line);
    if (!aboutModel) continue;
    if (/(?<![\p{L}])اجتاز(?![\p{L}])|(?<![\p{L}])أخفق(?![\p{L}])|\bpassed\b|\bfailed\b/u.test(line)) out.push(line.trim().slice(0, 200));
  }
  return out;
}

/** Words that mean done: only after a re-check proved it («تم» و«أُصلح», 16.7). */
export function doneWordsOutsideRecheck(text: string, lang: 'ar' | 'en'): string[] {
  const re = lang === 'ar' ? /(?<![\p{L}])(تم الإصلاح|أُصلح|أُصلحت|تمّ? إصلاح)(?![\p{L}])/gu : /\b(fixed|has been fixed|resolved by the model)\b/gi;
  const out: string[] = [];
  for (const line of text.split('\n')) {
    if (!re.test(line)) continue;
    re.lastIndex = 0;
    // A line that says the re-check proved it is allowed; a claim's quote is data inside a boundary and is skipped.
    if (/إعادة الفحص|بإعادة فحص|زال|re-?check|re-?ran|gone|resolved in run/i.test(line)) continue;
    out.push(line.trim().slice(0, 200));
  }
  return out;
}
