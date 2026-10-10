// NFR-05 and AT-28 (part): 100% key coverage in both languages, every message valid ICU, the same
// placeholders in both languages, and keys prefixed by their scope file.
import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { coverageReport, LOCALES, MESSAGE_FILES } from '../src/index.ts';

type Ast = ReturnType<IntlMessageFormat['getAst']>;
// The parser's element shape, loosely: type 0 is a literal; arguments carry their name in `value`.
type LooseElement = { type: number; value?: unknown; options?: Record<string, { value: Ast }>; children?: Ast };

function argumentNames(ast: Ast, out = new Set<string>()): Set<string> {
  for (const el of ast as unknown as LooseElement[]) {
    if (el.type !== 0 && typeof el.value === 'string') out.add(el.value);
    if (el.options) for (const opt of Object.values(el.options)) argumentNames(opt.value, out);
    if (el.children) argumentNames(el.children, out);
  }
  return out;
}

const files = MESSAGE_FILES as unknown as Record<string, { ar: Record<string, string>; en: Record<string, string> }>;

describe('message coverage (NFR-05)', () => {
  const report = coverageReport(files);

  it('covers 100% of the keys in both languages, per scope', () => {
    for (const r of report) {
      expect(r.missingAr, `${r.scope}: missing in Arabic`).toEqual([]);
      expect(r.missingEn, `${r.scope}: missing in English`).toEqual([]);
      expect(r.percent).toBe(100);
    }
    // Printed as the coverage evidence of AT-28.
    console.log(`i18n coverage: ${report.map((r) => `${r.scope} ${r.keys} keys ${r.percent}%`).join(', ')}`);
  });

  it('prefixes every key with its scope', () => {
    for (const [scope, langs] of Object.entries(files)) {
      for (const key of [...Object.keys(langs.ar), ...Object.keys(langs.en)]) expect(key.startsWith(`${scope}.`), key).toBe(true);
    }
  });

  it('parses every message as ICU, with the same arguments in both languages', () => {
    // The argument walker itself: a plain argument and a plural argument are both found.
    expect([...argumentNames(new IntlMessageFormat(files.errors!.en['errors.protocol_mismatch']!).getAst())].sort()).toEqual(['expected', 'received']);
    expect([...argumentNames(new IntlMessageFormat(files.common!.ar['common.count.checks']!, LOCALES.ar).getAst())]).toEqual(['count']);
    for (const { ar, en } of Object.values(files)) {
      for (const key of Object.keys(ar)) {
        const a = new IntlMessageFormat(ar[key]!, LOCALES.ar);
        const e = new IntlMessageFormat(en[key]!, LOCALES.en);
        expect([...argumentNames(a.getAst())].sort(), key).toEqual([...argumentNames(e.getAst())].sort());
      }
    }
  });

  it('covers the glossary of plan 27 (54 terms) and its English UI labels (107)', () => {
    expect(Object.keys(files.glossary!.ar)).toHaveLength(54);
    expect(Object.keys(files.ui!.ar)).toHaveLength(107);
  });
});
