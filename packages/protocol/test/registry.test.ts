import { describe, expect, it } from 'vitest';
import {
  COMMANDS,
  COMMAND_NAMES,
  commandDefinition,
  DIRECT_CONFIRM_COMMANDS,
  ERROR_CODES,
  EVENT_TOPICS,
  RENDERER_COMMAND_NAMES,
  isRendererCommand,
  protocolError,
} from '../src/index.ts';

// The command and event names of plan 6.5, verbatim (D-29: "الأسماء كما هي").
const PLAN_COMMANDS = [
  'project.add', 'project.list', 'project.get', 'project.rescan', 'project.relocate', 'project.remove', 'project.setTrust',
  'profile.propose', 'profile.get', 'profile.update', 'profile.approve', 'profile.export', 'profile.import',
  'readiness.evaluate', 'setup.preview', 'setup.execute',
  'run.plan', 'run.start', 'run.cancel', 'run.rerun', 'run.continueRound', 'runs.keep', 'runs.delete',
  'groups.save', 'groups.list', 'groups.delete',
  'results.query', 'finding.get', 'evidence.token',
  'review.record', 'baseline.approve',
  'report.build', 'clipboard.copy', 'tasks.list', 'task.create', 'task.update', 'advisor.suggest',
  'aiChecks.needs', 'aiChecks.provideInput', 'aiChecks.generate', 'aiChecks.save', 'aiChecks.importResults',
  'report.export',
  'compare.runs', 'tools.list', 'tools.preview', 'tools.install', 'tools.verify', 'tools.remove',
  'settings.get', 'settings.set', 'data.purge',
];
const PLAN_EVENTS = [
  'discovery.progress', 'discovery.done', 'run.state', 'check.state', 'check.progress', 'check.log',
  'finding.provisional', 'finding.final', 'run.summary', 'engine.health',
];

describe('command registry (6.5)', () => {
  it('contains every command of 6.5 by its exact name, callable by the renderer', () => {
    for (const name of PLAN_COMMANDS) {
      expect(COMMAND_NAMES, name).toContain(name);
      expect(isRendererCommand(name), name).toBe(true);
    }
  });

  // D-DEV3-03: the main process's commands and the host-only ones.
  const DEV3_EXTRA = ['confirm.issue', 'dialog.pickDestination', 'dialog.pickFolder', 'dialog.pickSource', 'engine.restart', 'engine.status', 'internal.clipboardText', 'internal.recordCopy'];
  // D-DEV4-02 (protocol 1.1): engine commands 6.5 needs but does not name.
  const DEV4_EXTRA = ['environment.resolve', 'profile.exportPreview', 'profile.importFromRepo', 'project.cancelDiscovery', 'project.confirm', 'project.rename'];
  // D-DEV5-01 (protocol 1.2): the host-only resolution of an evidence token for ayar-evidence:// and the short
  // cancellation before quitting, and the run list and run detail 6.5 leaves out.
  const DEV5_EXTRA = ['internal.evidencePath', 'internal.prepareQuit', 'run.get', 'runs.list'];
  // D-DEV7-01 (protocol 1.4): what a run captured and how it compares, and the approved references (C-14).
  const DEV7_EXTRA = ['baselines.list', 'captures.list'];
  // D-DEV9-01 (protocol 1.5): the kept reports and reviews (14.1 has their tables), the instruction preview and the
  // three groups of the model-checks page (AT-44), and the cards' verification on demand (12.8).
  const DEV9_EXTRA = ['aiChecks.get', 'aiChecks.list', 'reports.list', 'reviews.list', 'tasks.verify'];

  it('adds only the documented main-process, host-only, DEV-4, DEV-5, DEV-7 and DEV-9 commands', () => {
    const extra = COMMAND_NAMES.filter((c) => !PLAN_COMMANDS.includes(c)).sort();
    expect(extra).toEqual([...DEV3_EXTRA, ...DEV4_EXTRA, ...DEV5_EXTRA, ...DEV7_EXTRA, ...DEV9_EXTRA].sort());
    for (const c of DEV9_EXTRA as (keyof typeof COMMANDS)[]) expect(COMMANDS[c]).toMatchObject({ handler: 'engine', audience: 'renderer', since: '1.5', implementedIn: 'DEV-9', grants: [] });
    for (const c of DEV7_EXTRA as (keyof typeof COMMANDS)[]) expect(COMMANDS[c]).toMatchObject({ handler: 'engine', audience: 'renderer', owner: 'C-14', since: '1.4', implementedIn: 'DEV-7', grants: [] });
    for (const c of extra.filter((c) => c.startsWith('internal.'))) expect(COMMANDS[c].audience).toBe('host');
    for (const c of ['internal.evidencePath', 'internal.prepareQuit'] as const) expect(COMMANDS[c]).toMatchObject({ handler: 'engine', audience: 'host', since: '1.2', implementedIn: 'DEV-5' });
    for (const c of ['run.get', 'runs.list'] as const) expect(COMMANDS[c]).toMatchObject({ handler: 'engine', audience: 'renderer', owner: 'C-17', since: '1.2', implementedIn: 'DEV-5', grants: [] });
    for (const c of extra.filter((c) => DEV3_EXTRA.includes(c) && !c.startsWith('internal.'))) {
      expect(COMMANDS[c].handler).toBe('main');
      expect(COMMANDS[c].owner).toBe('C-01');
    }
    for (const c of DEV4_EXTRA as (keyof typeof COMMANDS)[]) {
      expect(COMMANDS[c]).toMatchObject({ handler: 'engine', audience: 'renderer', since: '1.1', implementedIn: 'DEV-4' });
      expect(COMMANDS[c].grants).toEqual([]);
    }
    expect(RENDERER_COMMAND_NAMES).not.toContain('internal.clipboardText');
  });

  it('every command has an owner component and an implementing phase (G-19)', () => {
    for (const name of COMMAND_NAMES) {
      expect(COMMANDS[name].owner, name).toMatch(/^C-\d{2}$/);
      expect(COMMANDS[name].implementedIn, name).toMatch(/^DEV-\d+$/);
    }
  });

  it('a payload carries a token field exactly when the command requires that grant', () => {
    const tokenFields = ['selectionToken', 'destinationToken', 'sourceToken', 'confirmationToken'];
    for (const name of COMMAND_NAMES) {
      const def = COMMANDS[name];
      const shape = 'shape' in def.payload ? Object.keys((def.payload as unknown as { shape: object }).shape) : [];
      const fields = shape.filter((k) => tokenFields.includes(k)).sort();
      const required = def.grants.map((g) => g.field).sort();
      if (def.handler === 'main') continue; // main-process commands mint tokens, they do not consume them
      expect(required, name).toEqual(fields);
    }
  });

  it('confirmation-bound commands either have a preview that confirms them, or are issued directly', () => {
    const previews = COMMAND_NAMES.map((c) => commandDefinition(c).confirms).filter((c): c is string => c !== undefined);
    for (const name of COMMAND_NAMES) {
      if (!COMMANDS[name].grants.some((g) => g.kind === 'confirmation')) continue;
      const direct = (DIRECT_CONFIRM_COMMANDS as readonly string[]).includes(name);
      expect(direct !== previews.includes(name), name).toBe(true);
    }
    for (const p of previews) expect(COMMANDS[p as keyof typeof COMMANDS].grants.some((g) => g.kind === 'confirmation')).toBe(true);
  });

  it('every renderer command with a destructive confirmation names its target field', () => {
    expect(COMMANDS['setup.execute'].grants).toEqual([{ field: 'confirmationToken', kind: 'confirmation', targetField: 'actionId' }]);
    expect(COMMANDS['data.purge'].grants).toEqual([{ field: 'confirmationToken', kind: 'confirmation', targetField: null }]);
  });
});

describe('event registry (6.5)', () => {
  it('contains exactly the events of 6.5, the two discovery endings of DEV-4 (D-DEV4-02), and setup progress (DEV-5, G-21)', () => {
    expect([...EVENT_TOPICS].sort()).toEqual([...PLAN_EVENTS, 'discovery.cancelled', 'discovery.failed', 'setup.progress'].sort());
  });
});

describe('errors', () => {
  it('every code maps to an errors.<code> message key', () => {
    for (const code of ERROR_CODES) expect(protocolError(code).messageKey).toBe(`errors.${code}`);
  });
});
