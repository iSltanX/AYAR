// Every user-facing text DEV-4's engine emits is a message key with both languages (NFR-11, C-24): proposal
// reasons and their subjects (signals, references, audiences), profile validation rules, discovery warnings,
// environment statuses, permission guidance, and the error codes. The keys are collected from the sources, so
// a new reason without its messages fails here.
import { REFERENCE_KINDS, SIGNALS } from '@ayar/catalog';
import { MESSAGES } from '@ayar/i18n';
import { ERROR_CODES, MissingRequirement, ProtectedLocation, RawCheckResult, ReportProblem, SetupPhase, ToolInstallResult, ToolView } from '@ayar/protocol';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { reportWord } from '../src/classifier/classify.ts';
import { outcomeWord } from '../src/purity/compute.ts';

const SRC = new URL('../src/', import.meta.url).pathname;
function sources(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith('.ts') ? [readFileSync(join(dir, e.name), 'utf8')] : []));
}
const all = sources().join('\n');
const discovery = sources(join(SRC, 'discovery')).join('\n');
const ar = MESSAGES.ar as Record<string, string>;
const en = MESSAGES.en as Record<string, string>;
const both = (key: string) => {
  expect(ar[key], `ar ${key}`).toBeTruthy();
  expect(en[key], `en ${key}`).toBeTruthy();
};

describe('message keys of DEV-4 (NFR-11)', () => {
  it('has both languages for every proposal reason the engine writes', () => {
    const reasons = [...new Set([...all.matchAll(/'(profile\.reason\.[A-Za-z]+)'/g)].map((m) => m[1]!))];
    expect(reasons.length).toBeGreaterThan(10);
    reasons.forEach(both);
  });

  it('has both languages for every subject a reason can name: signals, references, audiences, context', () => {
    for (const s of SIGNALS) both(`profile.signal.${s}`);
    both('profile.signal.site.staticNoScripts.present');
    for (const r of REFERENCE_KINDS) both(`profile.ref.${r}`);
    for (const a of ['solo', 'small_group', 'public']) both(`profile.audience.${a}`);
    for (const c of ['persistentData', 'permissions']) both(`profile.context.${c}`);
    both('profile.condition.excluded');
  });

  it('has both languages for every profile validation rule, discovery warning and environment status', () => {
    const rules = [...new Set([...all.matchAll(/invalid\('([a-z_]+)'/g)].map((m) => m[1]!))];
    expect(rules.length).toBeGreaterThan(5);
    for (const r of [...rules, 'not_pending']) both(`profile.invalid.${r}`);
    const warnings = [...new Set([...discovery.matchAll(/code: '([a-zA-Z]+)'/g), ...discovery.matchAll(/'(configTooLarge|configInvalid|symlinkDirNotFollowed)'/g)].map((m) => m[1]!))];
    expect(warnings).toEqual(expect.arrayContaining(['unreadable', 'symlinkOutside', 'symlinkTargetSkipped', 'gitignoreTruncated', 'partialScan']));
    for (const w of warnings) both(`discovery.warning.${w}`);
    for (const s of ['ok', 'mismatch', 'missing', 'unknown']) both(`environment.tool.status.${s}`);
    for (const r of ['timeout', 'exit', 'no_markers', 'spawn_failed']) both(`environment.fallback.${r}`);
    for (const m of ['configuration', 'tests', 'lockfile']) both(`profile.missing.${m}`);
    for (const l of ProtectedLocation.options) both(`projects.location.${l}`);
    for (const c of ['home_folder', 'disk_root', 'identity_mismatch']) both(`projects.confirm.${c}`);
  });

  it('has both languages for every error code', () => {
    for (const c of ERROR_CODES) both(`errors.${c}`);
  });
});

describe('message keys of DEV-5 (NFR-11)', () => {
  it('has both languages for every readiness, setup, plan and run key the engine writes', () => {
    const keys = [...new Set([...all.matchAll(/'((?:setup|run|plan)\.(?:reason|note|action|warning|phase|rejected|failed)\.[A-Za-z.]+)'/g)].map((m) => m[1]!))];
    expect(keys.length).toBeGreaterThan(50);
    keys.forEach(both);
  });

  it('has both languages for the keys the engine builds from a value', () => {
    // `setup.phase.${phase}` (setup.progress), `setup.rejected.${reason}` and `setup.failed.${reason}` (C-11).
    for (const p of SetupPhase.options) both(`setup.phase.${p}`);
    for (const r of ToolInstallResult.options) {
      if (r.shape.status.value === 'rejected' || r.shape.status.value === 'failed') for (const reason of (r.shape as unknown as { reason: { options: string[] } }).reason.options) both(`setup.${r.shape.status.value}.${reason}`);
    }
    // `setup.failed.${ended}` for a setup command that did not exit by itself (the supervisor's end reasons).
    for (const e of RawCheckResult.shape.ended.options) if (e !== 'exited' && e !== 'service_failed') both(`setup.failed.${e}`);
    // `setup.reason.missing.${kind}` and `setup.reason.ready.${source}` (readiness).
    for (const m of MissingRequirement.shape.kind.options) both(`setup.reason.missing.${m}`);
    for (const src of ToolView.shape.source.unwrap().options) both(`setup.reason.ready.${src}`);
    // The native destructive alerts (D-DEV3-15).
    for (const a of ['removeProject', 'deleteRuns', 'removeTool', 'purgeData']) for (const p of ['title', 'detail', 'confirm']) both(`alerts.${a}.${p}`);
  });
});

describe('message keys of DEV-6 (NFR-11)', () => {
  const packages = ['adapters', 'analyzers'].map((p) => sources(join(SRC, '..', '..', p, 'src')).join('\n')).join('\n');
  const everything = `${all}\n${packages}`;

  it('has both languages for every verdict, adapter, analyzer and purity key the engine and its readers write', () => {
    const keys = [...new Set([...everything.matchAll(/'((?:verdict|adapter|analyzer|purity)\.(?:reason|note|suggest|limits)\.[A-Za-z.]+)'/g)].map((m) => m[1]!))];
    expect(keys.length).toBeGreaterThan(60);
    keys.forEach(both);
  });

  it('has both languages for the keys built from a value', () => {
    // `verdict.reason.report.${code}` (C-15 «حماية القراءة») and `purity.reason.${outcome}` (11.3).
    for (const c of ReportProblem.shape.code.options) both(`verdict.reason.report.${reportWord(c)}`);
    for (const o of ['failed', 'warning', 'needs_review', 'flaky', 'missing', 'unavailable', 'timed_out', 'cancelled', 'interrupted', 'skipped'] as const) both(`purity.reason.${outcomeWord(o)}`);
    // Every rule of the book has its title (catalog.rule.<id>.title, a finding's titleKey).
    const book = JSON.parse(readFileSync(join(SRC, '..', '..', 'catalog', 'data', 'rules.json'), 'utf8')) as { rules: { id: string }[] };
    expect(book.rules.length).toBeGreaterThan(50);
    for (const r of book.rules) both(`catalog.rule.${r.id}.title`);
  });
});

describe('message keys of DEV-7 (NFR-11)', () => {
  const probe = sources(join(SRC, '..', '..', 'probe', 'src')).join('\n');

  it('has both languages for every probe reason and note the engine and the probe write', () => {
    const keys = [...new Set([...`${all}\n${probe}`.matchAll(/'(probe\.(?:reason|note)\.[A-Za-z]+)'/g)].map((m) => m[1]!))];
    expect(keys.length).toBeGreaterThan(20);
    keys.forEach(both);
    // Built from a value: `probe.reason.${'browserFailed' | 'failed'}` for a job that could not run.
    for (const k of ['browserFailed', 'failed']) both(`probe.reason.${k}`);
  });
});
