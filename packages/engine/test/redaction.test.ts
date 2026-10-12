// C-18 (D-21, FR-57, plan 19 «الإخفاء لا يترك نمطًا عالي الثقة»): the four layers, the line stream with its
// carry buffer, long-line splitting, private-key blocks across lines, the second pass, and the sensitive-name
// list with the G-35 exceptions. The fake secrets are assembled from parts at run time so that no
// secret-shaped literal sits in the repository.
import { readJson, readXml, unsplit } from '@ayar/adapters';
import { loadCatalog } from '@ayar/catalog';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { classifyEnvName, nameRules, nameWords } from '../src/redaction/names.ts';
import { compileRules, DEFUSED_SPLIT_MARKER, entropy, LINE_SPLIT_MARKER, MAX_LINE_CHARS, Redactor, REDACTED } from '../src/redaction/redactor.ts';
import { RedactionService } from '../src/redaction/service.ts';

const { catalog } = loadCatalog(undefined, { now: new Date('2026-10-10T00:00:00Z') });
const redactor = (o: Parameters<typeof compileRules>[1] = {}) => new Redactor(compileRules(catalog.redaction, o));

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const UPPER_NUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const B64URL = `${ALNUM}-_`;
const chars = (alphabet: string, min: number, max: number) => fc.array(fc.constantFrom(...alphabet.split('')), { minLength: min, maxLength: max }).map((a) => a.join(''));
const join = (...parts: string[]) => parts.join('');

/** One generator per high-confidence pattern of the catalog, each producing a well-formed fake secret. */
const SECRET_GENERATORS: Record<string, fc.Arbitrary<string>> = {
  'aws-access-key-id': chars(UPPER_NUM, 16, 16).map((s) => join('AK', 'IA', s)),
  'github-token': chars(ALNUM, 36, 40).map((s) => join('gh', 'p_', s)),
  'github-fine-grained-pat': chars(`${ALNUM}_`, 30, 60).map((s) => join('github', '_pat_', s)),
  'npm-token': chars(ALNUM, 36, 36).map((s) => join('np', 'm_', s)),
  'slack-token': chars(`${ALNUM}-`, 12, 40).map((s) => join('xo', 'xb-', '1234-', s)),
  'slack-webhook': chars(ALNUM, 24, 44).map((s) => join('https://hooks.', 'slack.com/services/', s)),
  'stripe-live-key': chars(ALNUM, 24, 40).map((s) => join('sk', '_live_', s)),
  'google-api-key': chars(B64URL, 35, 35).map((s) => join('AI', 'za', s)),
  'openai-api-key': chars(B64URL, 48, 60).map((s) => join('sk-', 'proj-', s)),
  'anthropic-api-key': chars(B64URL, 48, 60).map((s) => join('sk-', 'ant-', 'api03-', s)),
  jwt: fc.tuple(chars(B64URL, 10, 30), chars(B64URL, 10, 30), chars(B64URL, 12, 40)).map(([a, b, c]) => join('ey', 'J', a, '.ey', 'J', b, '.', c)),
  'private-key-inline': chars(ALNUM, 20, 60).map((s) => join('-----BEGIN ', 'PRIVATE KEY-----', s, '-----END ', 'PRIVATE KEY-----')),
  // A password with 24 distinct characters has an entropy of log2(24) ≈ 4.58 bits per character.
  'password-assignment': fc.shuffledSubarray(ALNUM.split(''), { minLength: 24, maxLength: 24 }).map((a) => join('pass', 'word=', a.join(''))),
  // DEV-9 (AT-23): a vendor-shaped live key, and a high-entropy token near a sensitive word with no assignment.
  'live-key': fc.tuple(chars('abcdefghijklmnopqrstuvwxyz', 3, 8), chars(ALNUM, 20, 40)).map(([p, s]) => join(p, '_live_', s)),
  'keyword-high-entropy': fc.shuffledSubarray(ALNUM.split(''), { minLength: 28, maxLength: 28 }).map((a) => join('with ', 'token ', a.join(''))),
};
const anySecret = fc.oneof(...Object.entries(SECRET_GENERATORS).map(([rule, g]) => g.map((value) => ({ rule, value }))));
/** Surrounding text that cannot itself form a secret: Arabic, spaces and punctuation. */
const filler = fc.array(fc.constantFrom('نص ', 'سجل ', ' . ', ': ', 'خطأ ', ' (', ') ', '\t'), { maxLength: 30 }).map((a) => a.join(''));
/** The part of a secret that must not survive: for an assignment, the value after `=`. */
const secretCore = (s: { rule: string; value: string }) => (s.rule === 'password-assignment' ? s.value.slice('password='.length) : s.rule === 'keyword-high-entropy' ? s.value.slice('with token '.length) : s.value);

describe('a stored report longer than a line (DEV-13, AYAR on its own repository)', () => {
  it('is cut with the marker on its way in and read whole by the readers', () => {
    const long = JSON.stringify({ files: Array.from({ length: 3000 }, (_, n) => ({ filePath: `src/file-${n}.ts`, messages: [], errorCount: 0 })) });
    expect(long.length).toBeGreaterThan(MAX_LINE_CHARS);
    const stored = redactor().redactText(long).text;
    expect(stored).toContain(LINE_SPLIT_MARKER);
    expect(readJson(stored, 'eslint.json')).toMatchObject({ ok: true });
  });
});

describe('catalog patterns (layer 2)', () => {
  it('has a generator for every high-confidence pattern, and each generated secret is caught', () => {
    expect(Object.keys(SECRET_GENERATORS).sort()).toEqual(catalog.redaction.highConfidence.map((p) => p.id).sort());
    const r = redactor();
    for (const [rule, g] of Object.entries(SECRET_GENERATORS)) {
      // A one-line private key is taken by the block rule first (same marker family, same effect).
      const marker = rule === 'private-key-inline' ? 'private-key' : rule;
      for (const value of fc.sample(g, 20)) {
        const out = r.redactText(`before ${value} after`);
        expect(out.text, rule).toContain(REDACTED(marker));
        expect(out.text, rule).not.toContain(secretCore({ rule, value }));
        expect(out.counts[marker], rule).toBe(1);
      }
    }
  });

  it('property: no high-confidence pattern survives redaction, and the second pass agrees', () => {
    const r = redactor();
    fc.assert(
      fc.property(filler, fc.array(fc.tuple(anySecret, filler), { minLength: 1, maxLength: 4 }), (head, parts) => {
        const text = head + parts.map(([s, f]) => `${s.value}${f}`).join('\n');
        const out = r.redactText(text).text;
        for (const [s] of parts) expect(out).not.toContain(secretCore(s));
        expect(r.secondPass(out)).toEqual({ ok: true });
        expect(r.secondPass(text).ok).toBe(false);
      }),
      { numRuns: 300 },
    );
  });

  it('property: redaction is idempotent and leaves text without secrets unchanged', () => {
    const r = redactor();
    fc.assert(
      fc.property(filler, anySecret, (f, s) => {
        const once = r.redactText(`${f}${s.value}${f}`).text;
        expect(r.redactText(once).text).toBe(once);
        expect(r.redactText(f).text).toBe(f);
      }),
      { numRuns: 200 },
    );
  });

  it('does not take a low-entropy word for a password', () => {
    const r = redactor();
    expect(r.redactText('password=aaaaaaaaaaaaaaaa').text).toBe('password=aaaaaaaaaaaaaaaa');
    expect(entropy('aaaa')).toBe(0);
    expect(entropy('abcd')).toBe(2);
  });
});

describe('known values (layer 1) and user patterns (layer 4)', () => {
  it('replaces a sensitive variable value wherever it appears, also escaped, but not values under 8 characters', () => {
    const value = join('mysecret', 'Value"/+1');
    const r = redactor({ known: [{ rule: 'env:MY_API_TOKEN', value }, { rule: 'env:SHORT_TOKEN', value: 'abc123' }] });
    const text = `raw ${value} json ${JSON.stringify(value)} url ${encodeURIComponent(value)} short abc123`;
    const out = r.redactText(text);
    expect(out.text).not.toContain(value);
    expect(out.text).not.toContain(encodeURIComponent(value));
    expect(out.text).toContain('short abc123');
    expect(out.counts['env:MY_API_TOKEN']).toBe(3);
    expect(r.secondPass(text)).toEqual({ ok: false, rules: ['env:MY_API_TOKEN'] });
  });

  it('applies the user patterns from the settings', () => {
    const r = redactor({ user: [{ id: 'internal-code', pattern: 'ACME-[0-9]{6}' }] });
    expect(r.redactText('order ACME-123456 shipped').text).toBe(`order ${REDACTED('user:internal-code')} shipped`);
  });

  it('the service recompiles when values are registered or settings change', () => {
    const svc = new RedactionService(catalog);
    const before = svc.redactor();
    svc.registerKnownValues([{ rule: 'env:NPM_TOKEN', value: 'n'.repeat(4) + 'pmvalue-1234' }]);
    expect(svc.redactor()).not.toBe(before);
    expect(svc.redactor().redactText('x nnnnpmvalue-1234 y').text).toBe(`x ${REDACTED('env:NPM_TOKEN')} y`);
    svc.configure([{ id: 'p', pattern: 'zz[0-9]+' }], ['ACME_*']);
    expect(svc.redactor().redactText('zz42').text).toBe(REDACTED('user:p'));
    expect(classifyEnvName('ACME_ENDPOINT', svc.names())).toBe('sensitive');
  });
});

describe('the line stream (C-18 «التدفق»)', () => {
  const r = redactor();
  const streamed = (chunks: string[]) => {
    const s = r.lineStream();
    const out = chunks.flatMap((c) => s.push(c));
    return { text: [...out, ...s.end()].join(''), counts: s.counts };
  };

  it('property: any chunking of the input gives the same output, and no secret split across chunks leaks', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(filler, anySecret), { minLength: 1, maxLength: 5 }), fc.array(fc.integer({ min: 1, max: 40 }), { minLength: 1, maxLength: 60 }), (parts, cuts) => {
        const text = parts.map(([f, s]) => `${f}${s.value}\n`).join('');
        const chunks: string[] = [];
        let pos = 0;
        for (const c of cuts) {
          if (pos >= text.length) break;
          chunks.push(text.slice(pos, pos + c));
          pos += c;
        }
        if (pos < text.length) chunks.push(text.slice(pos));
        const whole = r.redactText(text).text;
        const out = streamed(chunks).text;
        expect(out).toBe(whole);
        for (const [, s] of parts) expect(out).not.toContain(secretCore(s));
      }),
      { numRuns: 300 },
    );
  });

  it('cuts a line over 64 Ki characters with a marker, never through a secret', () => {
    const secret = join('gh', 'p_', 'Z'.repeat(36));
    for (const offset of [-20, -5, 0, 3]) {
      const line = 'a '.repeat((MAX_LINE_CHARS + offset) / 2) + secret + ' b'.repeat(40_000);
      const out = streamed([line.slice(0, 50_000), line.slice(50_000), '\nnext\n']);
      expect(out.text).not.toContain(secret);
      expect(out.text).toContain(LINE_SPLIT_MARKER);
      expect(out.counts['github-token']).toBe(1);
      for (const seg of out.text.split('\n')) expect(seg.length).toBeLessThanOrEqual(MAX_LINE_CHARS + 64 + LINE_SPLIT_MARKER.length);
    }
  });

  it('drops a private key block that spans lines, keeping what follows', () => {
    const block = ['-----BEGIN RSA ', 'PRIVATE KEY-----'].join('');
    const end = ['-----END RSA ', 'PRIVATE KEY-----'].join('');
    const text = `log: key follows ${block}\nMIIEowIBAAKCAQEA\nqT3x9vZr\n${end} tail\nafter\n`;
    const out = streamed([text.slice(0, 30), text.slice(30)]);
    expect(out.text).toBe(`log: key follows ${REDACTED('private-key')}\n tail\nafter\n`);
    expect(out.text).not.toContain('MIIEow');
    expect(out.counts['private-key']).toBe(1);
  });

  it('keeps dropping an unterminated block to the end, and counts it', () => {
    const block = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
    const out = streamed([`${block}\nAAAA\nBBBB`]);
    expect(out.text).toBe(`${REDACTED('private-key')}\n`);
    expect(out.counts['private-key:unterminated']).toBe(1);
  });

  it('cuts a long line outside overlapping matches, and drops a block’s long lines without split markers (review m3)', () => {
    const ka = join('q7Wz1Lp0Xr', 'M3nB8vC2kT');
    const kb = join('M3nB8vC2kT', 'h5Gd9Jf4Ys');
    const two = redactor({ known: [{ rule: 'env:A', value: ka }, { rule: 'env:B', value: kb }] });
    // A ends 5 characters before the cut, B straddles it and overlaps A: moving the cut to B's start would land in A.
    const line = 'x'.repeat(MAX_LINE_CHARS - 25) + ka + 'h5Gd9Jf4Ys' + 'y'.repeat(20) + '\n';
    const s = two.lineStream();
    const out = [...s.push(line), ...s.end()].join('');
    expect(out).not.toContain('q7Wz1Lp0Xr');
    expect(out).not.toContain('h5Gd9Jf4Ys');
    const block = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
    const end = ['-----END ', 'PRIVATE KEY-----'].join('');
    const s2 = r.lineStream();
    const out2 = [...s2.push(`${block}\n${'A'.repeat(MAX_LINE_CHARS * 2 + 10)}\n${end}\nafter\n`), ...s2.end()].join('');
    expect(out2).toBe(`${REDACTED('private-key')}\nafter\n`);
  });

  it('redacts a secret next to a marker character, and leaves earlier markers alone (review m3)', () => {
    const secret = 'Zx9Qw3Er7Ty1Ui5Op2As8Df';
    const out = r.redactText(`password=${secret}⟧`).text;
    expect(out).not.toContain(secret);
    expect(r.secondPass(`password=${secret}⟧`).ok).toBe(false);
    const again = r.redactText(out).text;
    expect(again).toBe(out);
    expect(r.redactText(`password=${REDACTED('env:X')}`).text).toBe(`password=${REDACTED('env:X')}`);
  });

  it('redacts object keys too, keeping keys that redact alike apart (review m4)', () => {
    const tokenA = join('gh', 'p_', 'A'.repeat(36));
    const tokenB = join('gh', 'p_', 'B'.repeat(36));
    const counts = {};
    const out = r.redactJson({ byName: { [tokenA]: 1, [tokenB]: 2, plain: 3 } }, counts);
    expect(JSON.stringify(out)).not.toContain(tokenA);
    expect(out.byName).toEqual({ [REDACTED('github-token')]: 1, [`${REDACTED('github-token')}#2`]: 2, plain: 3 });
    expect(counts).toEqual({ 'github-token': 2 });
  });

  it('redacts every string of a JSON value, counting per rule', () => {
    const counts = {};
    const value = { scripts: { deploy: `curl -H ${join('gh', 'p_', 'Q'.repeat(36))}` }, n: 3, list: ['ok'] };
    const out = r.redactJson(value, counts);
    expect(out).toEqual({ scripts: { deploy: `curl -H ${REDACTED('github-token')}` }, n: 3, list: ['ok'] });
    expect(counts).toEqual({ 'github-token': 1 });
  });
});

describe('sensitive names (C-18 layer 1, C-07, G-35)', () => {
  const rules = nameRules(catalog.redaction);

  it('withholds names by whole word, by prefix and by the known list', () => {
    for (const n of ['MY_API_TOKEN', 'NPM_TOKEN', 'GITHUB_TOKEN', 'DB_PASSWORD', 'API_KEY', 'S3_SECRET', 'AWS_REGION', 'GOOGLE_APPLICATION_CREDENTIALS', 'SESSION', 'PGPASSWORD', 'DATABASE_URL', 'client_secret', 'SECRET-KEY', 'MY.TOKEN', 'myApiToken', 'dbPassword', 'OAuthToken']) {
      expect(classifyEnvName(n, rules), n).toBe('sensitive');
    }
  });

  it('does not match a word inside another word (G-35)', () => {
    for (const n of ['KEYBOARD_LAYOUT', 'MONKEY', 'PASSPORT_DIR', 'OAUTH2_SCOPE', 'BYPASS_CACHE', 'SECURITYSESSIONID', 'PATH', 'HOME', 'LANG', 'PWD', 'keyboardLayout', 'passportDir', '__CFBundleIdentifier']) {
      expect(classifyEnvName(n, rules), n).toBe('plain');
    }
    expect(nameWords('API_KEY2')).toEqual(['API', 'KEY']);
    expect(nameWords('myApiToken')).toEqual(['MY', 'API', 'TOKEN']);
    expect(nameWords('SECRET-KEY.v2')).toEqual(['SECRET', 'KEY', 'V']);
  });

  it('passes the listed exceptions (SSH_AUTH_SOCK, TERM_SESSION_ID) and removes AYAR and Electron internals', () => {
    expect(classifyEnvName('SSH_AUTH_SOCK', rules)).toBe('exception');
    expect(classifyEnvName('TERM_SESSION_ID', rules)).toBe('exception');
    expect(classifyEnvName('AYAR_CHECK_TOKEN', rules)).toBe('internal');
    expect(classifyEnvName('ELECTRON_RUN_AS_NODE', rules)).toBe('internal');
  });
});

describe('user patterns (review M6)', () => {
  it('validates a pattern with its own flags, and a pattern that does not compile is skipped, not fatal', async () => {
    const { SettingEntry } = await import('@ayar/protocol');
    expect(SettingEntry.safeParse({ key: 'redaction.userPatterns', value: [{ id: 'mail', pattern: '\\w+\\@\\w+', flags: 'u' }] }).success).toBe(false);
    expect(SettingEntry.safeParse({ key: 'redaction.userPatterns', value: [{ id: 'mail', pattern: '\\w+@\\w+', flags: 'u' }] }).success).toBe(true);
    const r = redactor({ user: [{ id: 'bad', pattern: '\\w+\\@', flags: 'u' }, { id: 'ok', pattern: 'zz\\d+' }] });
    expect(r.redactText('a zz12 b').text).toBe(`a ${REDACTED('user:ok')} b`);
  });
});

describe('the line cut and the split marker (DEV-13 review R3-05, R3-10)', () => {
  // A high-entropy value, built at run time: what follows a keyword in a long single-line report.
  const core = Array.from({ length: 25 }, (_, i) => ALNUM[(i * 17 + 5) % ALNUM.length]).join('');
  const cases: [string, string][] = [
    ['password-assignment', join('pass', 'word=', core)],
    ['keyword-high-entropy', join('with ', 'tok', 'en ', core, 'bYcG')],
  ];
  for (const [rule, secret] of cases) {
    it(`${rule}: a secret across the 64 Ki cut, at every offset, is never stored, whole or streamed`, () => {
      const leaks: string[] = [];
      for (let k = 0; k <= secret.length; k++) {
        const line = 'x '.repeat(MAX_LINE_CHARS).slice(0, MAX_LINE_CHARS - k) + ' ' + secret + ' tail\n';
        const whole = redactor().redactText(line).text;
        if (whole.includes(core)) leaks.push(`whole@${k}`);
        const s = redactor().lineStream();
        const out: string[] = [];
        for (let i = 0; i < line.length; i += 997) out.push(...s.push(line.slice(i, i + 997)));
        out.push(...s.end());
        if (out.join('').includes(core)) leaks.push(`streamed@${k}`);
      }
      expect(leaks).toEqual([]);
    });
  }

  it('a marker a tool prints itself is stored defused, so reading never joins its lines', () => {
    const stored = redactor().redactText(`<a>\n<m>line1${LINE_SPLIT_MARKER}\nline2</m>\n</a>\n`).text;
    expect(stored).toContain(DEFUSED_SPLIT_MARKER);
    expect(unsplit(stored)).toBe(stored);
    const x = readXml(stored, 'x.xml');
    expect(x.ok && JSON.stringify(x.value)).toContain('line2');
    expect(x.ok && JSON.stringify(x.value)).not.toContain('line1line2');
  });

  it('a secret a project splits with a literal marker is not rejoined on reading', () => {
    const token = join('gh', 'p_', core, 'aB3dE5fG7hI');
    const stored = redactor().redactText(`<a><m>${token.slice(0, 20)}${LINE_SPLIT_MARKER}\n${token.slice(20)}</m></a>\n`).text;
    expect(unsplit(stored)).not.toContain(token);
  });

  it('the redactor\'s own cut is still undone on reading', () => {
    const long = JSON.stringify({ s: 'a'.repeat(MAX_LINE_CHARS + 10) });
    const stored = redactor().redactText(long).text;
    expect(stored).toContain(LINE_SPLIT_MARKER);
    expect(readJson(stored, 'x.json')).toMatchObject({ ok: true });
  });
});
