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

/** A hedge that says the opposite («لا يعني غياب العيوب», "does not prove there are no defects") is not the claim. */
const HEDGE_AR = /(لا يعني|لا يثبت|ليس ضمان|لا يضمن|دون أن يعني|لا تعني|ولا يعني)[^.؛\n]{0,40}$/u;
const HEDGE_EN = /\b(not|never|no guarantee|cannot|does not|doesn’t|doesn't|against|than)\b[^.;\n]{0,40}$/i;

/** The forbidden phrases a human text holds (empty when clean): a claim, not its denial. */
export function forbiddenPhrases(text: string, lang: 'ar' | 'en'): string[] {
  const list = lang === 'ar' ? FORBIDDEN_AR : FORBIDDEN_EN;
  const hedge = lang === 'ar' ? HEDGE_AR : HEDGE_EN;
  const out: string[] = [];
  for (const re of list) {
    const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    for (const m of text.matchAll(global)) {
      const before = text.slice(Math.max(0, m.index - 60), m.index);
      if (hedge.test(before)) continue;
      out.push(m[0]);
      break;
    }
  }
  return out;
}

/**
 * FR-71: a pass word («اجتاز» / passed) within the same line as a model check's or a model claim's id or label is
 * never written. Lines are the unit: a report line names one thing.
 */
/** A line without its cited text: what stands between «…» is quoted from a model or the project, not AYAR's words. */
const unquoted = (line: string) => line.replace(/«[^»]*»/g, '«…»');

export function passAttributedToModel(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const line = unquoted(raw);
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
  for (const raw of text.split('\n')) {
    const line = unquoted(raw);
    if (!re.test(line)) continue;
    re.lastIndex = 0;
    // A line that says the re-check proved it is allowed; a claim's quote is cited text («…») and is skipped.
    if (/إعادة الفحص|بإعادة فحص|زال|re-?check|re-?ran|gone|resolved in run/i.test(line)) continue;
    out.push(line.trim().slice(0, 200));
  }
  return out;
}
