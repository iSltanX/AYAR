// The managed tools of the security checks (C-15, C-11): Semgrep CE with AYAR's own rules (D-13), OSV-Scanner offline
// (E-09), the secrets scanner (Betterleaks, or Gitleaks with the same interface, E-08) on the files and on Git's
// history through a shadow repository (E-24, D-38), and lychee for the external links. None of them is a project
// command: AYAR builds their invocation whole, runs them from a neutral folder where that keeps git away (D-DEV2-01),
// and judges by their reports, not their exit codes alone (Semgrep exits 0 with findings).
import type { ExitSignal, InvocationTemplate, ParsedReport, Severity } from '@ayar/protocol';
import { ADAPTERS_VERSION, emptyReport, filesNamed, finding, firstErrorLine, lineOf, oversize, pushFinding, reason, reportMissing, unknownExit, type Adapter, type ParseContext, type SpecInput, type TemplateExtras } from '../framework.ts';
import { arr, int, num, readJson, rec, str } from '../read/guards.ts';
import { normalizePath, stripAnsi } from '../read/text.ts';
import { posix } from 'node:path';

function managed(a: Adapter, t: Omit<InvocationTemplate, 'adapter' | 'adapterVersion' | 'suggestion' | 'stdoutReport' | 'repeat'> & { repeat?: number }): InvocationTemplate {
  return { adapter: a.id, adapterVersion: ADAPTERS_VERSION, suggestion: null, stdoutReport: false, repeat: 1, ...t };
}

function readReports(a: Adapter, ctx: ParseContext, name: string, r: ParsedReport): unknown[] {
  const out: unknown[] = [];
  const files = filesNamed(ctx, name);
  if (!files.length) r.problems.push(reportMissing(a, name));
  for (const f of files) {
    const big = oversize(f);
    if (big) {
      r.problems.push(big);
      continue;
    }
    const j = readJson(f.text!, f.name);
    if (j.ok) out.push(j.value);
    else r.problems.push(j.problem);
  }
  return out;
}

// ── Semgrep ─────────────────────────────────────────────────────────────────────────────────────────────────

const SEMGREP_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.py'];

/** Semgrep prefixes a rule's id with the folder of its rules file; AYAR's ids and the project's are recovered. */
export function semgrepRuleId(checkId: string, root: string): { ayar: boolean; id: string } {
  const m = /(?:^|\.)(ayar\.(?:js|py)\.[a-z][a-z0-9-]*)$/.exec(checkId);
  if (m) return { ayar: true, id: m[1]! };
  const prefix = `${root.replace(/^\/+/, '').replaceAll('/', '.')}.`;
  return { ayar: false, id: checkId.startsWith(prefix) ? checkId.slice(prefix.length) : checkId };
}

/**
 * Semgrep CE 1.x (E-10, D-DEV2-01): `semgrep scan --no-git-ignore --config <AYAR's rules> [--config <the project's>]
 * --metrics=off --disable-version-check --json-output --sarif-output` from AYAR's neutral folder, the targets AYAR's
 * own inventory (which honours .gitignore) as absolute paths in batches of 512 KB, HOME and its settings in the
 * instance's folder, and a `git` first on PATH that fails at once. 0 or 1 with results by the report; 2 and above the
 * tool's (S-35: no `--error`, no `--config auto`, no autofix; AYAR computes the fingerprints).
 */
export const semgrep: Adapter = {
  id: 'semgrep',
  tool: 'semgrep',
  version: '1.0.0',
  tested: '>=1.180.0 <2.0.0',
  limitsKey: 'adapter.limits.sast',
  sources: ['S-35'],
  recognizes: (program) => program === 'semgrep',
  template(_spec: SpecInput, extras: TemplateExtras) {
    const project = extras.configs.semgrep;
    return managed(this, {
      argv: ['{tool}', 'scan', '--no-git-ignore', '--config', '{tmp}/ayar-rules.yml', ...(project ? ['--config', `{root}/${project}`] : []), '--metrics=off', '--disable-version-check', '--json-output={reports}/semgrep.json', '--sarif-output={reports}/semgrep.sarif', '--quiet', '{targets}'],
      cwd: '{tmp}',
      env: { HOME: '{tmp}/home', SEMGREP_SETTINGS_FILE: '{tmp}/semgrep-settings.yml', SEMGREP_SEND_METRICS: 'off', SEMGREP_ENABLE_VERSION_CHECK: '0', PATH: '{nogit}:{path}' },
      prepare: ['semgrep-rules', 'nogit'],
      targets: { extensions: SEMGREP_EXTENSIONS, batchBytes: 512 * 1024 },
      reports: ['semgrep.json', 'semgrep.sarif'],
    });
  },
  parseReports(ctx) {
    const r = emptyReport(this, ['semgrep-json']);
    const seen = new Set<string>();
    for (const v of readReports(this, ctx, 'semgrep.json', r)) {
      for (const res of arr(rec(v).results).map(rec)) {
        const extra = rec(res.extra);
        const { ayar, id } = semgrepRuleId(str(res.check_id), ctx.root);
        const p = normalizePath(str(res.path), ctx.root, ctx.cwd);
        const line = int(rec(res.start).line);
        const column = int(rec(res.start).col);
        const key = `${id}\0${p.path}\0${line}\0${column}`;
        if (seen.has(key)) continue; // a target in two batches cannot happen; a result twice is kept once
        seen.add(key);
        const sev = str(extra.severity);
        if (ayar) {
          // AYAR's own rule: its proof and level come from the book (forbidden → proven; suspect → suspected).
          pushFinding(r, finding({ rule: id, toolRule: id, message: str(extra.message), location: { path: p.path, ...(p.outside ? { outside: true } : {}), ...(line ? { line } : {}), ...(column ? { column } : {}) }, anchor: { kind: 'code', value: '' } }));
        } else {
          // The project's rule: ERROR breaks the criterion, WARNING is the warnings policy's, INFO a note.
          pushFinding(r, finding({ rule: 'sast.project-rule', toolRule: id, proof: sev === 'INFO' ? 'suggestion' : 'proven', level: sev === 'ERROR' ? 'error' : sev === 'WARNING' ? 'warning' : null, message: str(extra.message), location: { path: p.path, ...(p.outside ? { outside: true } : {}), ...(line ? { line } : {}) }, anchor: { kind: 'code', value: '' } }));
        }
      }
      // Semgrep's own errors: a target it could not parse is a note (its other targets were scanned); a rule error
      // is the configuration's.
      for (const e of arr(rec(v).errors).map(rec)) if (str(e.level) === 'error' && /rule|config|yaml/i.test(str(e.type))) r.signals.configError = true;
      r.info.scanned = (Number(r.info.scanned) || 0) + arr(rec(rec(v).paths).scanned).length;
    }
    return r;
  },
  exitMap(exit, report, ctx): ExitSignal {
    const codes = exit.steps.length ? exit.steps.map((s) => s.exitCode) : [exit.exitCode];
    const bad = codes.find((c) => c === null || c >= 2);
    if (bad !== undefined) return { kind: 'tool_error', reason: reason('adapter.reason.configError', { tool: 'semgrep', code: bad ?? -1, detail: firstErrorLine(stripAnsi(ctx.stderr || ctx.stdout)) }) };
    if (report.problems.length) return { kind: 'ok' };
    if (report.signals.configError) return { kind: 'tool_error', reason: reason('adapter.reason.configError', { tool: 'semgrep', code: 0, detail: 'rule error' }) };
    // It says which targets it scanned: none is nothing read, never a pass.
    if (report.info.scanned === 0 && !report.findings.length) return { kind: 'missing', reason: reason('adapter.reason.noInputFiles', { tool: 'semgrep' }) };
    return { kind: 'ok' };
  },
};

// ── OSV-Scanner ─────────────────────────────────────────────────────────────────────────────────────────────

/** C-16: CVSS from 9 critical, from 7 high, from 4 medium, below low; unrated: medium, marked «غير مصنفة». */
export function cvssSeverity(score: number | null, label: string): { severity: Severity; unrated: boolean } {
  if (score !== null && Number.isFinite(score)) return { severity: score >= 9 ? 'critical' : score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low', unrated: false };
  const l = label.toUpperCase();
  if (l === 'CRITICAL') return { severity: 'critical', unrated: false };
  if (l === 'HIGH') return { severity: 'high', unrated: false };
  if (l === 'MODERATE' || l === 'MEDIUM') return { severity: 'medium', unrated: false };
  if (l === 'LOW') return { severity: 'low', unrated: false };
  return { severity: 'medium', unrated: true };
}

const SEVERITY_ORDER: Severity[] = ['info', 'low', 'medium', 'high', 'critical'];

/** Where a dependency is declared, for the user: its manifest beside the lock file, else the lock file (G-DEV2-05). */
function dependencyLine(ctx: ParseContext, lockRel: string | null, name: string): { path: string | null; line?: number } {
  const dir = lockRel ? posix.dirname(lockRel) : '.';
  const join = (f: string) => (dir === '.' ? f : `${dir}/${f}`);
  for (const manifest of ['package.json', 'pyproject.toml', 'requirements.txt', 'requirements-dev.txt', 'Pipfile']) {
    const text = ctx.read(join(manifest));
    const line = text ? lineOf(text, manifest === 'package.json' ? `"${name}"` : name) : null;
    if (line) return { path: join(manifest), line };
  }
  if (lockRel) {
    const line = lineOf(ctx.read(lockRel), name);
    return { path: lockRel, ...(line ? { line } : {}) };
  }
  return { path: null };
}

/**
 * OSV-Scanner 2.x offline (E-09): `scan source -r <root> --offline --no-call-analysis=all --format json --output-file`
 * with AYAR's database folder. 0 none, 1 vulnerabilities; 127 «ناقص: قاعدة OSV غير مجهزة» (E-09); 128 is «ناقص: لا
 * ملفات قفل» only when the output says no package source was found, and the tool's when a lock file could not be
 * extracted (G-DEV1-03: told apart by the output, not the code). The threshold (`minSeverity`, «مرتفعة» by default)
 * decides a failure; below it, a warning (10.3).
 */
export const osv: Adapter = {
  id: 'osv-scanner',
  tool: 'osv-scanner',
  version: '1.0.0',
  tested: '>=2.5.1 <3.0.0',
  limitsKey: 'adapter.limits.deps',
  sources: ['S-36'],
  recognizes: (program) => program === 'osv-scanner',
  template(_spec, extras) {
    const config = extras.configs['osv-scanner'];
    return managed(this, {
      argv: ['{tool}', 'scan', 'source', '-r', '{root}', '--offline', '--no-call-analysis=all', '--format', 'json', '--output-file', '{reports}/osv.json', ...(config ? ['--config', `{root}/${config}`] : [])],
      cwd: '{tmp}',
      env: { OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY: '{osvdb}' },
      prepare: [],
      targets: null,
      reports: ['osv.json'],
    });
  },
  parseReports(ctx, exit) {
    const r = emptyReport(this, ['osv-json']);
    if (exit.exitCode === 127 || exit.exitCode === 128) return r;
    const threshold = (SEVERITY_ORDER as string[]).includes(String(ctx.thresholds?.minSeverity)) ? (ctx.thresholds!.minSeverity as Severity) : 'high';
    for (const v of readReports(this, ctx, 'osv.json', r)) {
      for (const res of arr(rec(v).results).map(rec)) {
        const lock = normalizePath(str(rec(res.source).path), ctx.root, ctx.cwd);
        for (const pk of arr(res.packages).map(rec)) {
          const pkg = rec(pk.package);
          const name = str(pkg.name);
          const version = str(pkg.version);
          const vulns = arr(pk.vulnerabilities).map(rec);
          const groups = arr(pk.groups).map(rec);
          const units = groups.length ? groups.map((g) => ({ ids: arr(g.ids).map((x) => str(x)), max: str(g.max_severity) })) : vulns.map((x) => ({ ids: [str(x.id)], max: '' }));
          for (const u of units) {
            const id = u.ids[0] ?? '';
            const vuln = vulns.find((x) => u.ids.includes(str(x.id))) ?? {};
            const label = str(rec(vuln.database_specific).severity);
            const { severity, unrated } = cvssSeverity(u.max ? Number(u.max) : null, label);
            const fixed = arr(vuln.affected).flatMap((a) => arr(rec(a).ranges)).flatMap((rg) => arr(rec(rg).events)).map((e) => str(rec(e).fixed)).find(Boolean);
            const where = dependencyLine(ctx, lock.path, name);
            pushFinding(r, finding({
              rule: 'vuln.known',
              toolRule: id,
              severity,
              level: SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf(threshold) ? 'error' : 'warning',
              message: `${name}@${version}: ${id}${unrated ? ' (غير مصنفة)' : ''} — ${str(vuln.summary)}`,
              location: { path: where.path, ...(where.line ? { line: where.line } : {}) },
              // G-DEV2-05: any version text (`file:vendor/x` from pnpm) makes the anchor.
              anchor: { kind: 'dependency', value: `${name}@${version}#${id}` },
              expected: fixed ? fixed : null,
              actual: version,
            }));
          }
        }
      }
    }
    return r;
  },
  exitMap(exit, report, ctx): ExitSignal {
    const out = stripAnsi(`${ctx.stderr}\n${ctx.stdout}`);
    if (exit.exitCode === 127) return { kind: 'missing', reason: reason('adapter.reason.osvDbMissing') };
    if (exit.exitCode === 128) {
      if (/Error during extraction/i.test(out)) return { kind: 'tool_error', reason: reason('adapter.reason.osvExtraction', { detail: firstErrorLine(out.split('\n').filter((l) => /Error during extraction/i.test(l)).join('\n')) }) };
      if (/No package sources found/i.test(out)) return { kind: 'missing', reason: reason('adapter.reason.noLockfiles') };
      return unknownExit(this, 128);
    }
    if (report.problems.length) return { kind: 'ok' };
    if (exit.exitCode === 0) return report.findings.length ? { kind: 'conflict', reason: reason('adapter.reason.conflictExitPass', { tool: 'osv-scanner', exit: 0, failed: report.findings.length }) } : { kind: 'ok' };
    if (exit.exitCode === 1) return report.findings.length ? { kind: 'ok' } : { kind: 'conflict', reason: reason('adapter.reason.conflictExitFail', { tool: 'osv-scanner', exit: 1 }) };
    return unknownExit(this, exit.exitCode);
  },
};

// ── secrets ─────────────────────────────────────────────────────────────────────────────────────────────────

function secretsParse(a: Adapter, ctx: ParseContext, history: boolean): ParsedReport {
  const r = emptyReport(a, ['gitleaks-json']);
  // Betterleaks and Gitleaks write the same report: the one a template named, whichever scanner ran it (E-08).
  const name = filesNamed(ctx, `${a.id}.json`).length ? `${a.id}.json` : ['betterleaks.json', 'gitleaks.json'].find((n) => filesNamed(ctx, n).length) ?? `${a.id}.json`;
  for (const v of readReports(a, ctx, name, r)) {
    for (const leak of arr(v).map(rec)) {
      const rule = str(leak.RuleID);
      const file = str(leak.File);
      const commit = str(leak.Commit);
      // In the files: relative to the root (`dir .`); in the history: a path of the repository.
      // In the history, a path of the repository's tree: relative, never above it (a crafted tree is kept outside).
      const inTree = posix.normalize(file).replace(/^\.\//, '').normalize('NFC');
      const p = history ? (posix.isAbsolute(inTree) || inTree === '..' || inTree.startsWith('../') ? { path: posix.basename(inTree), outside: true } : { path: inTree, outside: false }) : normalizePath(file, ctx.root, ctx.cwd);
      const line = int(leak.StartLine);
      const start = int(leak.StartColumn);
      const end = int(leak.EndColumn);
      pushFinding(r, finding({
        rule: 'secret.detected',
        toolRule: rule || null,
        message: str(leak.Description) || rule,
        location: { path: p.path, ...(p.outside ? { outside: true } : {}), ...(line ? { line } : {}), ...(start ? { column: start } : {}), ...(commit && /^[0-9a-f]{7,64}$/.test(commit) ? { commit } : {}) },
        // C-15: the value's HMAC, computed by the engine in memory from the span; in the history, from the
        // tool's own fingerprint (commit, file, rule, line: no value in it).
        anchor: history || !line ? { kind: 'secret', value: `fp:${str(leak.Fingerprint, `${commit}:${file}:${rule}:${line ?? 0}`)}` } : { kind: 'secret', value: `span:${line}:${start ?? 1}:${end ?? 0}` },
      }));
    }
  }
  return r;
}

function secretsExit(a: Adapter, exit: { exitCode: number | null }, report: ParsedReport, ctx: ParseContext): ExitSignal {
  if (exit.exitCode === 1) return { kind: 'tool_error', reason: reason('adapter.reason.configError', { tool: a.tool, code: 1, detail: firstErrorLine(stripAnsi(ctx.stderr || ctx.stdout)) }) };
  if (report.problems.length) return { kind: 'ok' };
  if (exit.exitCode === 0) return report.findings.length ? { kind: 'conflict', reason: reason('adapter.reason.conflictExitPass', { tool: a.tool, exit: 0, failed: report.findings.length }) } : { kind: 'ok' };
  if (exit.exitCode === 42) return report.findings.length ? { kind: 'ok' } : { kind: 'conflict', reason: reason('adapter.reason.conflictExitFail', { tool: a.tool, exit: 42 }) };
  return unknownExit(a, exit.exitCode);
}

function secretsFiles(key: 'betterleaks' | 'gitleaks', tested: string): Adapter {
  return {
    id: key,
    tool: key,
    version: '1.0.0',
    tested,
    limitsKey: 'adapter.limits.secrets',
    sources: ['S-37'],
    recognizes: (program) => program === key,
    template(spec, extras) {
      const config = extras.configs.gitleaks;
      if (spec.checkId === 'sec.secrets.history') {
        // E-24: on a shadow repository AYAR builds from the files (objects by alternates, refs, HEAD, an empty
        // configuration; no hooks, no attributes), with Git's own configuration out of reach.
        return managed(this, {
          argv: ['{tool}', 'git', '{shadow}', '--redact=100', '--no-banner', '--report-format', 'json', '--report-path', `{reports}/${key}.json`, '--exit-code', '42', ...(config ? ['--config', `{root}/${config}`] : [])],
          cwd: '{tmp}',
          env: { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_ATTR_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', HOME: '{tmp}/home' },
          prepare: ['git-shadow'],
          targets: null,
          reports: [`${key}.json`],
        });
      }
      // E-08: from the project root with `dir .`, so the report's paths match .gitleaksignore; the values redacted by
      // the tool itself (C-18 layer 3); a distinct exit code for findings; never `-v` (S-37).
      return managed(this, {
        argv: ['{tool}', 'dir', '.', '--redact=100', '--report-format', 'json', '--report-path', `{reports}/${key}.json`, '--exit-code', '42', ...(config ? ['--config', `{root}/${config}`] : [])],
        cwd: '{root}',
        env: {},
        prepare: [],
        targets: null,
        reports: [`${key}.json`],
      });
    },
    parseReports(ctx) {
      return secretsParse(this, ctx, ctx.checkId === 'sec.secrets.history');
    },
    exitMap(exit, report, ctx) {
      return secretsExit(this, exit, report, ctx);
    },
  };
}

export const betterleaks = secretsFiles('betterleaks', '>=1.9.0 <2.0.0');
export const gitleaks = secretsFiles('gitleaks', '>=8.30.0 <9.0.0');

// ── lychee ──────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * lychee 0.2x (S-32), optional and on the network: the web links of the Markdown and HTML files of the inventory
 * (`--scheme http --scheme https`; the local ones are code.refs.local's). 404 and 410 are proven broken; 401, 403 and
 * 429 need a review; a timeout or a failed lookup is not a broken link (10.3). 0 and 2 by the report; 1 and 3 the
 * tool's. No credentials are ever sent.
 *
 * D-DEV6-17 (G-DEV6-04): lychee knocks on no local address. `--exclude-all-private` (private, loopback and
 * link-local) leaves forms through that lychee 0.24.2 checks, proven against a local server: 0.0.0.0 (and `0`),
 * [::], [::ffff:127.0.0.1], `localhost.`; and a single-label or a special-use name (`.local`, `.internal`,
 * `.home.arpa`) is a machine of the local network. LOCAL_ADDRESSES excludes them by the normalized URL. A project's
 * lychee.toml is not read (`--config /dev/null`): its `include` would take precedence over every `--exclude`. What
 * flags cannot close: a public name that resolves to a local address, and a redirect to one.
 */
export const LOCAL_ADDRESSES = String.raw`^https?://(?:[^/?#@]*@)?(?:0\.\d{1,3}\.\d{1,3}\.\d{1,3}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}|198\.1[89]\.\d{1,3}\.\d{1,3}|\[(?:::|64:ff9b:|f[c-f][0-9a-f]{0,2}:)[^\]]*\]|[^/?#:@\[\].]+\.?|(?:[^/?#:@\[\]]*\.)?(?:localhost|localdomain|local|internal|home\.arpa)\.?)(?::\d+)?(?:[/?#]|$)`;

export const lychee: Adapter = {
  id: 'lychee',
  tool: 'lychee',
  version: '1.1.0',
  tested: '>=0.20.0 <0.30.0',
  limitsKey: 'adapter.limits.links',
  sources: ['S-32'],
  recognizes: (program) => program === 'lychee',
  template(spec) {
    return managed(this, {
      argv: ['{tool}', '--config', '/dev/null', '--format', 'json', '--output', '{reports}/links.json', '--max-concurrency', '8', '--host-concurrency', '2', '--max-retries', '2', '--timeout', '20', '--exclude-all-private', '--exclude', LOCAL_ADDRESSES, '--scheme', 'http', '--scheme', 'https', '--no-progress', '{targets}'],
      cwd: spec.component === '.' ? '{root}' : `{root}/${spec.component}`,
      env: {},
      prepare: [],
      targets: { extensions: ['.md', '.markdown', '.html', '.htm'], batchBytes: 512 * 1024 },
      reports: ['links.json'],
    });
  },
  parseReports(ctx) {
    const r = emptyReport(this, ['lychee-json']);
    for (const v of readReports(this, ctx, 'links.json', r)) {
      const root = rec(v);
      // What was checked at all: the links less the excluded (local addresses, D-DEV6-17) and the unsupported ones.
      const total = num(root.total, 0);
      const excluded = num(root.excludes, 0);
      r.info.links = (Number(r.info.links) || 0) + total;
      r.info.excluded = (Number(r.info.excluded) || 0) + excluded;
      r.info.checked = (Number(r.info.checked) || 0) + Math.max(0, total - excluded - num(root.unsupported, 0));
      const maps: [string, Record<string, unknown>][] = [
        ['error', rec(root.error_map)],
        ['fail', rec(root.fail_map)],
        ['timeout', rec(root.timeout_map)],
      ];
      for (const [kind, map] of maps) {
        for (const [file, entries] of Object.entries(map)) {
          const p = normalizePath(file, ctx.root, ctx.cwd);
          for (const e of arr(entries).map(rec)) {
            const status = rec(e.status);
            const code = num(status.code, NaN);
            const url = str(e.url);
            const line = int(rec(e.span).line);
            const broken = kind !== 'timeout' && (code === 404 || code === 410);
            pushFinding(r, finding({
              rule: broken ? 'link.broken' : 'link.unverified',
              toolRule: Number.isFinite(code) ? String(code) : kind === 'timeout' ? 'timeout' : null,
              message: `${url}: ${str(status.text, kind)}`,
              location: { path: p.path, ...(p.outside ? { outside: true } : {}), ...(line ? { line } : {}) },
              anchor: { kind: 'text', value: url },
            }));
          }
        }
      }
    }
    return r;
  },
  exitMap(exit, report, ctx): ExitSignal {
    const codes = exit.steps.length ? exit.steps.map((s) => s.exitCode) : [exit.exitCode];
    const bad = codes.find((c) => c === 1 || c === 3);
    if (bad !== undefined) return { kind: 'tool_error', reason: reason('adapter.reason.configError', { tool: 'lychee', code: bad, detail: firstErrorLine(stripAnsi(ctx.stderr || ctx.stdout)) }) };
    if (report.problems.length) return { kind: 'ok' };
    if (codes.some((c) => c !== 0 && c !== 2)) return unknownExit(this, codes.find((c) => c !== 0 && c !== 2) ?? null);
    if (codes.includes(2) && !report.findings.length) return { kind: 'conflict', reason: reason('adapter.reason.conflictExitFail', { tool: 'lychee', exit: 2 }) };
    // No web link checked (none, or every one local and excluded): «ناقص», never a pass on nothing (7.3 rule 3).
    if (report.info.checked === 0 && !report.findings.length) return { kind: 'missing', reason: reason('adapter.reason.noLinksChecked', { links: Number(report.info.links) || 0, excluded: Number(report.info.excluded) || 0 }) };
    return { kind: 'ok' };
  },
};
