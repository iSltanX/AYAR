// AT-31 (FR-15, FR-17, NFR-03, D-14) in a monitored network: the whole test runs inside a sandbox that refuses and
// logs every connection leaving this machine and every name lookup (support/at31-network.sb). Full scans with the
// default profiles of FX-EXT, FX-PY and FX-WEB-DESIGN (the page that asks for a font from an outside host, the probe
// included), the readiness of a project whose packageManager names a pnpm that is not installed, and a check that
// needs the network. What needs the network is «ناقص: يحتاج شبكة»; the pnpm version is a readiness gap, never a
// download; the page's outside request is refused by the probe and kept in the evidence with C-14's note; and a check
// that ran the project's own command carries the note that it is outside the guarantee (15.3, A-14).
// Afterwards, outside the sandbox (the kernel's log cannot be read inside it), support/at31-refusals.mjs names every
// refused connection by its process: none may come from AYAR — the engine, its probe and browser, its managed tools,
// its version probes — and the project's own commands, outside the guarantee (15.3), are listed apart. The probe's
// browser leaves one kind, Chromium's IPv6 reachability check, accepted only where its own net-log shows nothing sent.
//
//   sh packages/engine/test/support/at31.sh   (the sandboxed run, then the refusals read outside the sandbox)
import { MESSAGES } from '@ayar/i18n';
import type { ReadinessReport } from '@ayar/protocol';
import { lookup } from 'node:dns/promises';
import { connect } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { engineFor, ok, scanVariant, tempDir, toolchainReady, type EngineConnection } from './support/scan.ts';
import { installOsvMiniDb } from './support/variants.ts';
import { installTestBrowser, probeBrowserReady } from './support/probe.ts';

const ON = process.env.AYAR_AT31 === '1';
/** The wrapper's folder: the window and the project's process groups for the refusals' reader, and the net-logs. */
const CHECK_DIR = process.env.AYAR_AT31_DIR;
let root: string;
let cleanup: () => void;
let engine: EngineConnection;
let sandboxed = false;
let started: Date;

/** The canary: an outside address must be refused (EPERM) and a name must not resolve, or the sandbox is not on. */
async function canary(): Promise<boolean> {
  const refused = await new Promise<boolean>((resolve) => {
    const s = connect(443, '93.184.215.14');
    s.once('connect', () => {
      s.destroy();
      resolve(false);
    });
    s.once('error', (e: NodeJS.ErrnoException) => resolve(e.code === 'EPERM'));
  });
  const resolved = await lookup('example.org').then(() => true, () => false);
  return refused && !resolved;
}

beforeAll(async () => {
  if (!ON || !toolchainReady() || !probeBrowserReady()) return;
  started = new Date(Date.now() - 1000);
  sandboxed = await canary();
  if (!sandboxed) return;
  ({ dir: root, cleanup } = tempDir('ayar-DEV-7-at31-'));
  const netlog = CHECK_DIR ? join(CHECK_DIR, 'netlog') : null;
  if (netlog) mkdirSync(netlog, { recursive: true });
  engine = await engineFor(root, netlog ? { env: { AYAR_TEST_PROBE_NETLOG: netlog } } : {});
  ok(await engine.invoke('settings.set', { key: 'run.allowNetwork', value: false }));
  installOsvMiniDb(join(root, 'AYAR'));
  installTestBrowser(join(root, 'AYAR'));
}, 60_000);
afterAll(async () => {
  await engine?.close();
  if (process.env.AYAR_KEEP_TMP) console.log(root);
  else cleanup?.();
});

/**
 * For the refusals' reader: the window, the canary's pid, and the process groups of the project's own commands (a
 * check's command from the profile, or a service), which the engine's ledger names.
 */
function recordWindow(): void {
  if (!CHECK_DIR) return;
  const db = new DatabaseSync(join(root, 'AYAR', 'ayar.db'), { readOnly: true });
  try {
    const groups = db
      .prepare("SELECT DISTINCT l.pgid FROM process_ledger l LEFT JOIN check_runs c ON c.id = l.check_run_id WHERE l.pgid > 0 AND (l.kind = 'service' OR (l.kind = 'check' AND c.command_json IS NOT NULL))")
      .all()
      .map((r) => (r as { pgid: number }).pgid);
    writeFileSync(join(CHECK_DIR, 'window.json'), JSON.stringify({ start: started.toISOString(), end: new Date().toISOString(), canary: process.pid, projectGroups: groups }));
  } finally {
    db.close();
  }
}

describe('AT-31: no network by default, in a monitored network', () => {
  it.runIf(ON && toolchainReady() && probeBrowserReady())('makes no connection from AYAR or its tools, says what needs the network, and refuses the page\'s outside font', async () => {
    expect(sandboxed, 'run inside sandbox-exec with support/at31-network.sb').toBe(true);
    // FX-EXT with its default profile, and the link check that needs the network chosen too.
    const ext = await scanVariant(engine, root, 'FX-EXT', 'good', { include: ['code.refs.external@.'], timeoutMs: 900_000, folder: 'ext' });
    const links = ext.detail.checks.find((c) => c.instance === 'code.refs.external@.')!;
    expect([links.outcome, links.outcomeReason?.key]).toEqual(['missing', 'setup.reason.networkNotAllowed']);
    // Everything else completes (the integrity checks are DEV-9's runner, «تعذّر» until then).
    const unavailable = (d: typeof ext.detail) => d.checks.filter((c) => c.outcome === 'unavailable' && !c.checkId.startsWith('integ.')).map((c) => `${c.instance} ${c.outcomeReason?.key}`);
    expect(unavailable(ext.detail)).toEqual([]);
    // FX-PY with its default profile.
    const py = await scanVariant(engine, root, 'FX-PY', 'good', { timeoutMs: 900_000, folder: 'py' });
    expect(unavailable(py.detail)).toEqual([]);
    // 15.3 and A-14: a check that ran the project's own command says it is outside the guarantee; AYAR's tools do not.
    const notes = (d: typeof ext.detail, i: string) => d.checks.find((c) => c.instance === i)?.notes ?? null;
    expect(notes(ext.detail, 'beh.e2e@.')).toContain('run.note.projectCommandNetwork');
    expect(notes(py.detail, 'code.build@.')).toContain('run.note.projectCommandNetwork');
    expect(notes(py.detail, 'sec.deps@.')).not.toContain('run.note.projectCommandNetwork');
    // FX-WEB-DESIGN's page that asks for a font from an outside host, its documentation page the proposed target.
    const web = await scanVariant(engine, root, 'FX-WEB-DESIGN', 'external-font-host', { timeoutMs: 900_000, folder: 'web' });
    const a11y = web.detail.checks.find((c) => c.instance === 'design.a11y@.')!;
    expect(['passed', 'warning', 'failed', 'needs_review']).toContain(a11y.outcome);
    expect(a11y.raw?.notes).toContain('probe.note.externalBlocked');
    const outcome = JSON.parse(readFileSync(join(root, 'AYAR', 'evidence', web.projectId, web.detail.run.runId, (a11y.raw?.sharedFrom ?? a11y.checkRunId), 'probe.json'), 'utf8')) as { results: { blocked: string[] }[] };
    expect([...new Set(outcome.results.flatMap((r) => r.blocked))]).toEqual(['GET https://fonts.googleapis.com/css2']);
    expect((MESSAGES.ar as Record<string, string>)['probe.note.externalBlocked']).toBe('لم تُحمَّل موارد خارجية تطلبها الصفحة لأن عِيَار لا يتصل بالشبكة أثناء الفحص، فقد تبدو عند زوارها مختلفة قليلًا');
    // A packageManager naming a pnpm that is not installed: a readiness gap, never a download (Corepack offline).
    const noisy = await scanVariant(engine, root, 'FX-NOISY', 'pnpm-unpinned', { selection: { kind: 'group', instances: ['beh.unit@.'] }, timeoutMs: 300_000, folder: 'noisy', install: false });
    const readiness = ok<ReadinessReport>(await engine.invoke('readiness.evaluate', { projectId: noisy.projectId }));
    const unit = readiness.items.find((i) => i.instance === 'beh.unit@.')!;
    expect(unit.reasons.map((r) => r.key)).toContain('setup.reason.managerMismatch');
    // The sandbox held to the end; the refusals are read by the wrapper, outside it.
    expect(await canary()).toBe(true);
    recordWindow();
  }, 3_600_000);
});
