// The verification of a card by evidence (12.8, AT-37 at the unit): the four conditions, the reasons that keep a
// card «بانتظار التحقق», the fix card closed by its finding's disappearance, the setup card by its gap's end, and
// the test strength from a Stryker report with per-test kills.
import type { TaskRecord } from '@ayar/protocol';
import { describe, expect, it } from 'vitest';
import type { Manifest, ManifestEntry } from '../src/evidence/snapshot.ts';
import { changedTestFiles, killingTestFiles, targetWords, verifyCard, type CardBase, type RunFacts } from '../src/tasks/verify.ts';

const entry = (path: string, hash: string): ManifestEntry => [path, 10, 1, 1, 1, `sha256:${hash}`, 'text', true];
const manifest = (files: Record<string, string>): Manifest => ({ schema: 'ayar-snapshot/1', fsType: 'apfs', fastPath: { allowed: false, reused: 0 }, full: true, contentStored: true, files: Object.entries(files).map(([p, h]) => entry(p, h)), skipped: [], truncated: false, totalSize: 0, hash: 'h' });

const card = (type: TaskRecord['card']['type'], o: Partial<TaskRecord['card']> = {}, follows: string | null = null): TaskRecord => ({
  id: 'task_1',
  displayId: 'TASK-0001',
  projectId: 'prj_1',
  status: 'copied',
  createdAt: 'x',
  updatedAt: 'x',
  verification: null,
  closeReason: null,
  follows,
  card: { template: 'card/1', type, priority: 2, nextStep: 'model', source: { kind: 'check', ref: 'x' }, name: 'n', subject: 'يرفض `verifySession()` رمزًا منتهي الصلاحية', why: 'w', behavior: { given: null, when: null, must: null }, expected: null, location: 'src/auth/session.ts', context: { framework: 'vitest', examples: [] }, userSupplied: { subject: false, location: false }, steps: [], verify: ['beh.unit'], noAutomatedCheck: false, text: 't', ...o },
});

const ports = { fs: { lstat: () => Promise.resolve(null), readFilePrefix: () => Promise.resolve({ data: new Uint8Array(0), size: 0 }) } } as unknown as Parameters<typeof verifyCard>[3]['ports'];

function facts(o: Partial<RunFacts> & { texts?: Record<string, string> } = {}): RunFacts {
  const texts = o.texts ?? {};
  return {
    runId: 'run_2',
    checks: [{ checkRunId: 'chk', checkId: 'beh.unit', component: '.', outcome: 'passed', tests: 13 }],
    guardFindings: [],
    presentFingerprints: new Set(),
    fingerprintOf: (id) => (id === 'AYR-BEH-UNIT-0001' ? 'fp1' : null),
    manifest: manifest({ 'src/auth/session.test.ts': 'new', 'src/other.test.ts': 'same' }),
    text: (e) => Promise.resolve(texts[e[0]] ?? null),
    ...o,
  };
}
const base: CardBase = { runId: 'run_1', snapshotId: 'snp_1', tests: 12 };
const baseManifest = manifest({ 'src/other.test.ts': 'same' });

describe('card verification (12.8)', () => {
  it('a test card is verified when the four conditions hold, with the strength unproven', async () => {
    const v = await verifyCard(card('unit_test'), base, facts({ texts: { 'src/auth/session.test.ts': "it('rejects an expired token', () => verifySession('x'))" } }), { baseManifest, ports, root: null });
    expect(v).toMatchObject({ testsIncreased: true, checkPassed: true, targetMentioned: true, noIntegrityFinding: true, strength: 'unproven', reasons: [] });
  });

  it('a skipped test keeps it waiting with an integrity finding; a trivial test with «لا اختبار جديد يذكر الهدف»', async () => {
    const skipped = await verifyCard(card('unit_test'), base, facts({ guardFindings: [{ checkId: 'beh.unit', rule: 'guard.skipped-test', path: 'src/auth/session.test.ts' }], texts: { 'src/auth/session.test.ts': 'verifySession' } }), { baseManifest, ports, root: null });
    expect(skipped!.reasons).toContain('tasks.verify.integrityFinding');
    const trivial = await verifyCard(card('unit_test'), base, facts({ texts: { 'src/auth/session.test.ts': "it('x', () => expect(true).toBe(true))" } }), { baseManifest, ports, root: null });
    expect(trivial!.reasons).toEqual(['tasks.verify.targetNotMentioned']);
    const noTests = await verifyCard(card('unit_test'), base, facts({ checks: [{ checkRunId: 'chk', checkId: 'beh.unit', component: '.', outcome: 'passed', tests: 12 }], texts: { 'src/auth/session.test.ts': 'verifySession' } }), { baseManifest, ports, root: null });
    expect(noTests!.reasons).toEqual(['tasks.verify.testsNotIncreased']);
    const failed = await verifyCard(card('unit_test'), base, facts({ checks: [{ checkRunId: 'chk', checkId: 'beh.unit', component: '.', outcome: 'failed', tests: 13 }], texts: { 'src/auth/session.test.ts': 'verifySession' } }), { baseManifest, ports, root: null });
    expect(failed!.reasons).toEqual(['tasks.verify.checkNotPassed']);
  });

  it('a run that did not run the card’s checks says nothing; a review card is never verified by a run', async () => {
    expect(await verifyCard(card('unit_test'), base, facts({ checks: [] }), { baseManifest, ports, root: null })).toBeNull();
    expect(await verifyCard(card('refactor_review'), base, facts(), { baseManifest, ports, root: null })).toBeNull();
  });

  it('a fix-verification card closes when its finding is gone, and waits while it persists', async () => {
    const gone = await verifyCard(card('fix_verification', { verify: ['beh.unit'] }, 'AYR-BEH-UNIT-0001'), base, facts(), { baseManifest, ports, root: null });
    expect(gone).toMatchObject({ findingResolved: true, strength: 'not_applicable', reasons: [] });
    const still = await verifyCard(card('fix_verification', { verify: ['beh.unit'] }, 'AYR-BEH-UNIT-0001'), base, facts({ presentFingerprints: new Set(['fp1']) }), { baseManifest, ports, root: null });
    expect(still!.reasons).toEqual(['tasks.verify.findingPersists']);
  });

  it('a setup card closes when the check is no longer missing', async () => {
    const ok = await verifyCard(card('check_setup', { verify: ['code.types'] }), base, facts({ checks: [{ checkRunId: 'c', checkId: 'code.types', component: '.', outcome: 'failed', tests: null }] }), { baseManifest, ports, root: null });
    expect(ok).toMatchObject({ checkPassed: true, reasons: [] });
    const missing = await verifyCard(card('check_setup', { verify: ['code.types'] }), base, facts({ checks: [{ checkRunId: 'c', checkId: 'code.types', component: '.', outcome: 'missing', tests: null }] }), { baseManifest, ports, root: null });
    expect(missing!.reasons).toEqual(['tasks.verify.stillMissing']);
  });

  it('reads the target words, the changed test files, and the killing tests of a Stryker report', () => {
    expect(targetWords(card('unit_test').card)).toEqual(['session', 'verifySession']);
    expect(changedTestFiles(baseManifest, manifest({ 'src/auth/session.test.ts': 'new', 'src/other.test.ts': 'same', 'src/a.ts': 'x' })).map((e) => e[0])).toEqual(['src/auth/session.test.ts']);
    const report = { files: { 'src/a.ts': { mutants: [{ status: 'Killed', killedBy: ['t1'] }, { status: 'Survived' }] } }, testFiles: { 'src/auth/session.test.ts': { tests: [{ id: 't1', name: 'rejects' }] }, 'src/other.test.ts': { tests: [{ id: 't2' }] } } };
    expect([...killingTestFiles(report)]).toEqual(['src/auth/session.test.ts']);
  });
});
