// C-15 «حماية القراءة» (AT-39's reading half, G-DEV1-05): the limits (50 MiB, 64 levels), XML without a DTD or an
// entity beyond the five predefined ones, the SARIF subset, ANSI removed and direction controls made visible, and
// paths normalized relative to the root (NFC; outside marked). And FX-REPORTS: its sound reports read, each broken one
// a problem with its own reason, never a guess.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanMessage, jsonDepth, normalizePath, readJson, readJsonInText, readJsonLines, readJUnit, readSarif, readXml, REPORT_LIMITS, stripAnsi, visibleBidi } from '../src/index.ts';

const FX = new URL('../../../fixtures/FX-REPORTS/', import.meta.url).pathname;
const base = (f: string) => readFileSync(join(FX, 'base/reports', f), 'utf8');
const variant = (v: string, f: string) => readFileSync(join(FX, 'variants', v, 'overlay/reports', f), 'utf8');

describe('the limits (G-DEV1-05)', () => {
  it('are 50 MiB and 64 levels', () => {
    expect(REPORT_LIMITS).toMatchObject({ maxBytes: 52_428_800, maxJsonDepth: 64, maxXmlDepth: 64 });
  });

  it('measures JSON depth without parsing, strings and escapes skipped', () => {
    expect(jsonDepth('{"a":[1,{"b":"[[[[\\"]]"}]}', 64)).toBe(3);
    expect(jsonDepth('['.repeat(5000), 64)).toBe(65);
    expect(readJson(`${'['.repeat(65)}${']'.repeat(65)}`, 'r.json')).toMatchObject({ ok: false, problem: { code: 'too_deep' } });
    expect(readJson(`${'['.repeat(64)}${']'.repeat(64)}`, 'r.json').ok).toBe(true);
  });

  it('tells an empty report, a malformed one and a deep one apart', () => {
    expect(readJson('  ', 'r.json')).toMatchObject({ ok: false, problem: { code: 'empty' } });
    expect(readJson('{"a":', 'r.json')).toMatchObject({ ok: false, problem: { code: 'malformed' } });
  });

  it('finds JSON among the lines of a tool\'s output, and reads JSON lines', () => {
    expect(readJsonInText('\n> pnpm run check\n$ pyright --outputjson\n{\n  "a": 1\n}\n', 'stdout.txt')).toEqual({ ok: true, value: { a: 1 } });
    expect(readJsonInText('nothing here', 'stdout.txt')).toMatchObject({ ok: false, problem: { code: 'malformed' } });
    expect(readJsonLines('{"a":1}\nnot json\n{"b":2}\n', 'x')).toEqual({ ok: true, value: { values: [{ a: 1 }, { b: 2 }], skipped: 1 } });
  });
});

describe('XML without a DTD (C-15)', () => {
  it('reads elements, attributes, text, CDATA and the five entities', () => {
    const x = readXml('<?xml version="1.0"?>\n<a x="1 &amp; 2"><b>t &lt;3 &#x41;</b><![CDATA[<raw>]]><!-- c --><c/></a>', 'r.xml');
    expect(x.ok).toBe(true);
    if (!x.ok) return;
    expect(x.value).toMatchObject({ name: 'a', attrs: { x: '1 & 2' }, text: '<raw>' });
    expect(x.value.children.map((c) => [c.name, c.text])).toEqual([['b', 't <3 A'], ['c', '']]);
  });

  it('refuses a DTD, an undeclared entity, a tag left open, too deep a nesting', () => {
    expect(readXml('<!DOCTYPE x [<!ENTITY e "boom">]><x>&e;</x>', 'r.xml')).toMatchObject({ ok: false, problem: { code: 'dtd' } });
    expect(readXml('<x>&e;</x>', 'r.xml')).toMatchObject({ ok: false, problem: { code: 'malformed' } });
    expect(readXml('<x><y></x>', 'r.xml')).toMatchObject({ ok: false, problem: { code: 'malformed' } });
    expect(readXml(`${'<a>'.repeat(65)}${'</a>'.repeat(65)}`, 'r.xml')).toMatchObject({ ok: false, problem: { code: 'too_deep' } });
  });
});

describe('FX-REPORTS (AT-39, AT-14)', () => {
  it('reads the sound reports', () => {
    const junit = readJUnit(base('pytest.junit.xml'), 'pytest.junit.xml');
    expect(junit.ok && junit.value.cases.length).toBeGreaterThan(0);
    expect(readJson(base('vitest.json'), 'vitest.json').ok).toBe(true);
    expect(readJson(base('eslint.json'), 'eslint.json').ok).toBe(true);
    const sarif = readSarif(base('semgrep.sarif'), 'semgrep.sarif');
    expect(sarif.ok && sarif.value.tools).toEqual(['Semgrep OSS']);
  });

  it('gives each broken report its own problem', () => {
    expect(readJUnit(variant('junit-corrupt', 'pytest.junit.xml'), 'pytest.junit.xml')).toMatchObject({ ok: false, problem: { code: 'malformed' } });
    expect(readSarif(variant('sarif-incomplete', 'semgrep.sarif'), 'semgrep.sarif')).toMatchObject({ ok: false, problem: { code: 'incomplete', detail: expect.stringContaining('tool.driver.name') as string } });
    expect(readJson(variant('json-too-deep', 'eslint.json'), 'eslint.json')).toMatchObject({ ok: false, problem: { code: 'too_deep' } });
  });
});

describe('text and paths (T3, C-15)', () => {
  it('removes ANSI and shows the direction controls', () => {
    expect(stripAnsi('\u001b[31mred\u001b[39m \u001b]8;;http://x\u0007link\u001b]8;;\u0007')).toBe('red link');
    expect(visibleBidi('a‮b')).toBe('a⟪U+202E⟫b');
    expect(cleanMessage('\u001b[1mbold\u001b[22m⁦x', 100)).toBe('bold⟪U+2066⟫x');
  });

  it('normalizes a path relative to the root, NFC, and marks one outside', () => {
    expect(normalizePath('/r/p/src/a.ts', '/r/p')).toEqual({ path: 'src/a.ts', outside: false });
    expect(normalizePath('src/a.ts', '/r/p', '/r/p/pkg')).toEqual({ path: 'pkg/src/a.ts', outside: false });
    expect(normalizePath('file:///r/p/a%20b.ts', '/r/p')).toEqual({ path: 'a b.ts', outside: false });
    expect(normalizePath('/etc/passwd', '/r/p')).toEqual({ path: 'passwd', outside: true });
    expect(normalizePath('../../x.ts', '/r/p', '/r/p')).toEqual({ path: 'x.ts', outside: true });
    // An NFD root and an NFC path (AT-04's folder): the same place.
    const nfd = '/r/مكتبة (إصدار أول)'.normalize('NFD');
    expect(normalizePath(`${'/r/مكتبة (إصدار أول)'.normalize('NFC')}/a.py`, nfd)).toEqual({ path: 'a.py', outside: false });
  });
});
