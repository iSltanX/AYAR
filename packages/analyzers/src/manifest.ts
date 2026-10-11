// sec.ext.manifest and sec.ext.permissions (C-13, S-43 to S-45): the extension's manifest read from the source, or
// from the build folder when a framework generates it (WXT, Plasmo, CRXJS: the check then depends on the build).
// The manifest: the mandatory keys, the version's form, every file it names, `default_locale` with `_locales`, every
// `__MSG_x__` in the default locale, and the pages' security policy (no 'unsafe-eval', no remote script source).
// Warnings: comments in the manifest, Manifest V2 for Chrome. The permissions against the written policy: one not in
// it is a proven violation; a broad scope with no written reason «يحتاج تبريرًا»; one whose API never appears in the
// code «قد لا تكون مستخدمة», a note. The manifest unreadable is the check's own «تعذّر» (C-13 «الأخطاء»).
import type { ExitSignal, ParsedReport } from '@ayar/protocol';
import { finding, pushFinding } from '@ayar/adapters';
import { posix } from 'node:path';
import { factValues, lineOfText, OK, refValue, report, type Analyzer, type AnalyzerInput } from './common.ts';

/** JSON with comments (Chrome reads it): the comments removed outside strings, and whether there were any. */
export function stripJsonComments(text: string): { json: string; comments: { line: number }[] } {
  let out = '';
  const comments: { line: number }[] = [];
  let line = 1;
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '\n') line++;
    if (inString) {
      out += c;
      if (c === '\\') {
        out += text[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i++;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i++;
    } else if (c === '/' && text[i + 1] === '/') {
      comments.push({ line });
      while (i < text.length && text[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (c === '/' && text[i + 1] === '*') {
      comments.push({ line });
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      for (; i < stop; i++) {
        if (text[i] === '\n') {
          line++;
          out += '\n';
        } else out += ' ';
      }
    } else {
      out += c;
      i++;
    }
  }
  return { json: out, comments };
}

export interface LoadedManifest {
  rel: string;
  text: string;
  value: Record<string, unknown>;
  comments: { line: number }[];
  generated: boolean;
  buildDir: string | null;
}

/** Where the manifest is (discovery's fact), read and parsed; or the reason it cannot be. */
export function loadManifest(i: AnalyzerInput): { ok: true; m: LoadedManifest } | { ok: false; exit: ExitSignal; report?: ParsedReport } {
  const ext = factValues(i, 'type.browserExtension')[0];
  const build = factValues(i, 'references.buildOutput')[0];
  const buildDir = typeof build?.dir === 'string' ? build.dir : null;
  const generated = ext?.generated === true;
  const rel = generated ? (buildDir ? `${buildDir}/manifest.json` : null) : typeof ext?.manifest === 'string' ? ext.manifest : null;
  if (!rel) return { ok: false, exit: { kind: 'missing', reason: { key: 'analyzer.reason.noManifest' } } };
  const text = i.read(rel);
  if (text === null) return { ok: false, exit: generated ? { kind: 'tool_error', reason: { key: 'analyzer.reason.manifestNotBuilt', params: { path: rel } } } : { kind: 'missing', reason: { key: 'analyzer.reason.noManifest' } } };
  const { json, comments } = stripJsonComments(text);
  try {
    const v = JSON.parse(json) as unknown;
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
    return { ok: true, m: { rel, text, value: v as Record<string, unknown>, comments, generated, buildDir } };
  } catch (e) {
    // The main file of the check could not be parsed: the whole check is «تعذّر» (C-13 «الأخطاء»).
    return { ok: false, exit: { kind: 'tool_error', reason: { key: 'analyzer.reason.manifestUnparsable', params: { path: rel, detail: e instanceof Error ? e.message.slice(0, 200) : 'invalid' } } } };
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Every file the manifest names, with the key that names it (globs are not files: skipped). */
export function referencedFiles(m: Record<string, unknown>): { key: string; path: string; script: boolean }[] {
  const out: { key: string; path: string; script: boolean }[] = [];
  const add = (key: string, v: unknown, script = false) => {
    const s = str(v);
    if (s && !/[*?]/.test(s) && !/^[a-z][a-z0-9+.-]*:/i.test(s)) out.push({ key, path: s.replace(/^\/+/, ''), script });
  };
  for (const [size, p] of Object.entries(obj(m.icons))) add(`icons.${size}`, p);
  for (const actionKey of ['action', 'browser_action', 'page_action']) {
    const a = obj(m[actionKey]);
    add(`${actionKey}.default_popup`, a.default_popup);
    if (typeof a.default_icon === 'string') add(`${actionKey}.default_icon`, a.default_icon);
    else for (const [size, p] of Object.entries(obj(a.default_icon))) add(`${actionKey}.default_icon.${size}`, p);
  }
  add('options_page', m.options_page);
  add('options_ui.page', obj(m.options_ui).page);
  add('side_panel.default_path', obj(m.side_panel).default_path);
  add('devtools_page', m.devtools_page);
  const bg = obj(m.background);
  add('background.service_worker', bg.service_worker, true);
  add('background.page', bg.page);
  arr(bg.scripts).forEach((s, n) => add(`background.scripts.${n}`, s, true));
  arr(m.content_scripts).forEach((cs, n) => {
    arr(obj(cs).js).forEach((s, k) => add(`content_scripts.${n}.js.${k}`, s, true));
    arr(obj(cs).css).forEach((s, k) => add(`content_scripts.${n}.css.${k}`, s));
  });
  arr(m.web_accessible_resources).forEach((w, n) => {
    if (typeof w === 'string') add(`web_accessible_resources.${n}`, w);
    else arr(obj(w).resources).forEach((r, k) => add(`web_accessible_resources.${n}.resources.${k}`, r));
  });
  arr(obj(m.declarative_net_request).rule_resources).forEach((r, n) => add(`declarative_net_request.rule_resources.${n}.path`, obj(r).path));
  for (const [k, v] of Object.entries(obj(m.chrome_url_overrides))) add(`chrome_url_overrides.${k}`, v);
  arr(obj(m.sandbox).pages).forEach((p, n) => add(`sandbox.pages.${n}`, p));
  return out;
}

/**
 * Whether a named file exists for the extension: beside the manifest, at the component's root (a page the bundler
 * takes as input), in the build folder, or — for a script — as a source of the same name that the build turns into
 * it (`src/background.ts` → `background.js`). AYAR cannot know the bundler's mapping beyond that (a limit, C-13).
 */
function present(i: AnalyzerInput, m: LoadedManifest, ref: { path: string; script: boolean }): boolean {
  const dir = posix.dirname(m.rel);
  const comp = i.component === '.' ? '' : `${i.component}/`;
  const candidates = [posix.join(dir, ref.path), `${comp}${ref.path}`, ...(m.buildDir ? [posix.join(m.buildDir, ref.path)] : [])];
  if (candidates.some((c) => i.exists(c))) return true;
  if (ref.script && !m.generated) {
    const stem = posix.basename(ref.path).replace(/\.(m?js|cjs)$/, '');
    return i.files.some((f) => (i.component === '.' || f.startsWith(comp)) && /\.(ts|tsx|mts|js|jsx|mjs)$/.test(f) && posix.basename(f).replace(/\.[^.]+$/, '') === stem && !/\.(test|spec)\./.test(f));
  }
  return false;
}

const VERSION = /^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/;
export const validVersion = (v: string): boolean => VERSION.test(v) && v.split('.').every((n) => Number(n) <= 65535);

/** The script sources a policy allows besides 'self' (S-44): only these, no remote origin. */
const ALLOWED_SOURCES = new Set(["'self'", "'wasm-unsafe-eval'", "'none'"]);

export const manifestAnalyzer: Analyzer = {
  id: 'ext-manifest',
  version: '1.0.0',
  limitsKey: 'analyzer.limits.manifest',
  run(i) {
    const r = report(this, ['manifest']);
    const l = loadManifest(i);
    if (!l.ok) return { report: r, exit: l.exit };
    const { m } = l;
    const v = m.value;
    const at = (needle: string) => lineOfText(m.text, needle) ?? undefined;
    const loc = (needle: string) => ({ path: m.rel, ...(at(needle) ? { line: at(needle)! } : {}) });
    const add = (rule: string, key: string, needle: string, message: string) => pushFinding(r, finding({ rule, message, location: loc(needle), anchor: { kind: 'key', value: `${key}=${needle}` } }));
    for (const key of ['manifest_version', 'name', 'version']) if (v[key] === undefined || v[key] === '') add('manifest.missing-key', key, `"${key}"`, `${key} is missing`);
    const version = str(v.version);
    if (version !== null && !validVersion(version)) add('manifest.invalid-version', 'version', `"${version}"`, `version «${version}»: one to four dot-separated integers, 0 to 65535, no leading zeros`);
    for (const ref of referencedFiles(v)) if (!present(i, m, ref)) add('manifest.missing-file', ref.key, `"${ref.path}"`, `${ref.key}: ${ref.path} does not exist`);
    // _locales and default_locale (S-45).
    const dir = posix.dirname(m.rel);
    const localesDir = posix.join(dir, '_locales');
    const hasLocales = i.files.some((f) => f.startsWith(`${localesDir}/`)) || (m.buildDir ? i.exists(posix.join(m.buildDir, '_locales')) : false);
    const defaultLocale = str(v.default_locale);
    if (hasLocales && !defaultLocale) add('manifest.missing-default-locale', 'default_locale', '"manifest_version"', '_locales exists without default_locale');
    let messages: Record<string, unknown> | null = null;
    if (defaultLocale) {
      const p = posix.join(localesDir, defaultLocale, 'messages.json');
      const text = i.read(p) ?? (m.buildDir ? i.read(posix.join(m.buildDir, '_locales', defaultLocale, 'messages.json')) : null);
      if (text === null) add('manifest.missing-file', 'default_locale', `"${defaultLocale}"`, `_locales/${defaultLocale}/messages.json does not exist`);
      else {
        try {
          messages = obj(JSON.parse(stripJsonComments(text).json));
        } catch {
          add('manifest.missing-file', 'default_locale', `"${defaultLocale}"`, `_locales/${defaultLocale}/messages.json is not valid JSON`);
        }
      }
    }
    if (messages) {
      const known = new Set(Object.keys(messages).map((k) => k.toLowerCase()));
      const seen = new Set<string>();
      for (const mm of m.text.matchAll(/__MSG_([A-Za-z0-9_@]+)__/g)) {
        const k = mm[1]!;
        if (k.startsWith('@@') || seen.has(k)) continue;
        seen.add(k);
        if (!known.has(k.toLowerCase())) add('manifest.undefined-message', `__MSG_${k}__`, `__MSG_${k}__`, `__MSG_${k}__ is not defined in _locales/${defaultLocale}/messages.json`);
      }
    }
    // The pages' security policy (S-44): MV3 extension_pages, or MV2's string.
    const csp = typeof v.content_security_policy === 'string' ? v.content_security_policy : str(obj(v.content_security_policy).extension_pages);
    if (csp) {
      for (const directive of csp.split(';')) {
        const [name, ...sources] = directive.trim().split(/\s+/);
        if (name !== 'script-src' && name !== 'script-src-elem' && name !== 'object-src' && name !== 'default-src') continue;
        for (const s of sources) {
          if (s === "'unsafe-eval'") add('manifest.csp-unsafe-eval', `content_security_policy.${name}`, "'unsafe-eval'", `${name} allows 'unsafe-eval'`);
          else if (!ALLOWED_SOURCES.has(s) && !/^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/.test(s) && name !== 'object-src') add('manifest.csp-remote-script', `content_security_policy.${name}`, s, `${name} allows ${s}`);
        }
      }
    }
    // Warnings: comments; Manifest V2 when Chrome is targeted (a Chromium extension).
    for (const c of m.comments) pushFinding(r, finding({ rule: 'manifest.comments', message: 'a comment in the manifest', location: { path: m.rel, line: c.line }, anchor: { kind: 'key', value: `comment:${c.line}` } }));
    if (v.manifest_version === 2 && i.facts.some((f) => f.key === 'type.chromiumExtension' || f.key === 'type.browserExtension')) add('manifest.mv2-chrome', 'manifest_version', '"manifest_version"', 'Manifest V2 is not loaded by current Chrome');
    r.info.manifest = m.rel;
    return { report: r, exit: OK };
  },
};

// ── permissions ─────────────────────────────────────────────────────────────────────────────────────────────

/** The written policy: `{ permissions: { name: reason }, host_permissions: { pattern: reason }, … }` (D-DEV6-…). */
export interface PermissionsPolicy {
  reasons: Map<string, string>;
}

export function readPolicy(i: AnalyzerInput): { ok: true; policy: PermissionsPolicy; rel: string | null } | { ok: false; exit: ExitSignal } {
  const ref = refValue(i, 'permissionsPolicy');
  let value: unknown = ref;
  let rel: string | null = null;
  if (typeof ref === 'string') {
    rel = ref;
    const text = i.read(ref);
    if (text === null) return { ok: false, exit: { kind: 'missing', reason: { key: 'analyzer.reason.noPolicy' } } };
    try {
      value = JSON.parse(stripJsonComments(text).json);
    } catch (e) {
      return { ok: false, exit: { kind: 'tool_error', reason: { key: 'analyzer.reason.policyUnparsable', params: { path: ref, detail: e instanceof Error ? e.message.slice(0, 200) : 'invalid' } } } };
    }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ok: false, exit: { kind: 'missing', reason: { key: 'analyzer.reason.noPolicy' } } };
  const reasons = new Map<string, string>();
  for (const group of ['permissions', 'host_permissions', 'optional_permissions', 'optional_host_permissions']) {
    const g = (value as Record<string, unknown>)[group];
    if (Array.isArray(g)) for (const p of g) if (typeof p === 'string') reasons.set(p, '');
    if (g && typeof g === 'object' && !Array.isArray(g)) for (const [p, why] of Object.entries(g)) reasons.set(p, typeof why === 'string' ? why.trim() : '');
  }
  return { ok: true, policy: { reasons }, rel };
}

/** S-43: the broad scopes that need a written reason. */
export const BROAD_SCOPES = new Set(['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*', 'file:///*']);

/** Permissions with no API namespace of their own: never «قد لا تكون مستخدمة». */
const NO_NAMESPACE = new Set(['activeTab', 'unlimitedStorage', 'background', 'clipboardRead', 'clipboardWrite', 'geolocation', 'webRequestBlocking', 'declarativeNetRequestWithHostAccess', 'declarativeNetRequestFeedback', 'nativeMessaging', 'fileBrowserHandler']);

export const permissionsAnalyzer: Analyzer = {
  id: 'ext-permissions',
  version: '1.0.0',
  limitsKey: 'analyzer.limits.permissions',
  run(i) {
    const r = report(this, ['manifest', 'permissions-policy']);
    const l = loadManifest(i);
    if (!l.ok) return { report: r, exit: l.exit };
    const p = readPolicy(i);
    if (!p.ok) return { report: r, exit: p.exit };
    const { m } = l;
    const v = m.value;
    const isHost = (s: string) => s === '<all_urls>' || s.includes('://');
    const apis = [...arr(v.permissions), ...arr(v.optional_permissions)].filter((x): x is string => typeof x === 'string');
    const hosts = [...arr(v.host_permissions), ...arr(v.optional_host_permissions)].filter((x): x is string => typeof x === 'string');
    const all = [...new Set([...apis, ...hosts])];
    const code = i.files.filter((f) => /\.(js|jsx|ts|tsx|mjs|cjs|mts|cts|svelte|vue)$/.test(f) && !/\.(test|spec)\./.test(f)).map((f) => i.read(f) ?? '').join('\n');
    for (const perm of all) {
      const line = lineOfText(m.text, `"${perm}"`);
      const location = { path: m.rel, ...(line ? { line } : {}) };
      const anchor = { kind: 'permission' as const, value: perm };
      if (!p.policy.reasons.has(perm)) {
        pushFinding(r, finding({ rule: 'permission.outside-policy', message: `${perm} is not in the permissions policy${BROAD_SCOPES.has(perm) ? ' (a broad scope)' : ''}`, location, anchor }));
        continue;
      }
      if (BROAD_SCOPES.has(perm) && !p.policy.reasons.get(perm)) pushFinding(r, finding({ rule: 'permission.broad-unjustified', message: `${perm}: a broad scope with no written reason`, location, anchor }));
      if (!isHost(perm) && !NO_NAMESPACE.has(perm)) {
        const ns = perm.split('.')[0]!;
        if (!new RegExp(`\\b(chrome|browser)\\s*\\.\\s*${ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(code)) pushFinding(r, finding({ rule: 'permission.maybe-unused', message: `${perm}: no use of chrome.${ns} found in the code (a dynamic use can hide from a text search)`, location, anchor }));
      }
    }
    r.info.permissions = all.length;
    return { report: r, exit: OK };
  },
};
