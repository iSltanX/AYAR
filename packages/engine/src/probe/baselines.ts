// C-14 «المقارنة البصرية» and FR-35 / D-27 (C-17 `baselines/<project>/`): the reference images of a project. A
// capture becomes the active reference of its key only by baseline.approve — never by AYAR on its own — and the
// previous one of that key is kept as replaced. The key is the state, viewport, theme, language, platform, browser
// version, pixel density and E-11's mode: a capture finds the reference of exactly its key («اجتاز» or «فرق
// بصري»), or one of its state, viewport, theme and language taken elsewhere («بيئة عرض مختلفة»), or none («ناقص
// إعداد»). With a difference, the source lines that changed since the reference's approval (the state snapshots of
// C-17) are the likely cause, the design's own files first.
import type { BaselineView, CaptureKey, CaptureView, JsonValue } from '@ayar/protocol';
import { CaptureKey as CaptureKeySchema } from '@ayar/protocol';
import { ProbeOutcome, type VisualComparison } from '@ayar/probe';
import { posix } from 'node:path';
import { CommandError } from '../host/errors.ts';
import { newId } from '../host/ids.ts';
import type { EvidenceService } from '../evidence/service.ts';
import type { Manifest } from '../evidence/snapshot.ts';
import type { EnginePorts, Logger } from '../ports/index.ts';
import { recordAudit } from '../storage/audit.ts';
import type { DataLayout } from '../storage/data-dir.ts';
import type { Db } from '../storage/db.ts';

interface BaselineRow {
  id: string;
  project_id: string;
  key_json: string;
  rel_path: string;
  sha256: string;
  approved_at: string;
  approved_from_check_run_id: string | null;
  status: string;
  snapshot_id: string | null;
}

/** The key's identity, without the environment (what «بيئة عرض مختلفة» compares). */
const cellOf = (k: CaptureKey) => `${k.state}\0${k.viewport}\0${k.theme}\0${k.lang}`;
export const keyString = (k: CaptureKey) => `${cellOf(k)}\0${k.platform}\0${k.browser}\0${k.density}\0${k.mode}`;

export interface Capture {
  index: number;
  captureId: string;
  key: CaptureKey;
  /** The capture's file (absolute). */
  path: string;
}

export interface PlannedComparison {
  capture: Capture;
  comparison: VisualComparison['comparison'];
  baselineId: string | null;
  /** The reference's file (absolute), when there is one of exactly this key. */
  referencePath: string | null;
}

export class BaselineService {
  readonly #db: Db;
  readonly #ports: EnginePorts;
  readonly #layout: DataLayout;
  readonly #evidence: EvidenceService;
  readonly #logger: Logger;

  constructor(o: { db: Db; ports: EnginePorts; layout: DataLayout; evidence: EvidenceService; logger: Logger }) {
    this.#db = o.db;
    this.#ports = o.ports;
    this.#layout = o.layout;
    this.#evidence = o.evidence;
    this.#logger = o.logger;
  }

  #rows(projectId: string, status = 'active'): BaselineRow[] {
    return this.#db.all<BaselineRow>('SELECT * FROM baselines WHERE project_id = ? AND status = ? ORDER BY approved_at, rowid', projectId, status);
  }

  #view(r: BaselineRow): BaselineView {
    return { id: r.id, projectId: r.project_id, key: CaptureKeySchema.parse(JSON.parse(r.key_json)), sha256: r.sha256, approvedAt: r.approved_at, approvedFromCheckRunId: r.approved_from_check_run_id, status: r.status === 'active' ? 'active' : 'replaced' };
  }

  list(projectId: string): BaselineView[] {
    return this.#db.all<BaselineRow>('SELECT * FROM baselines WHERE project_id = ? ORDER BY approved_at DESC, rowid DESC', projectId).map((r) => this.#view(r));
  }

  /** How each capture stands against the active references of the project (before any pixel is compared). */
  plan(projectId: string, captures: readonly Capture[]): PlannedComparison[] {
    const active = this.#rows(projectId);
    const exact = new Map(active.map((r) => [keyString(CaptureKeySchema.parse(JSON.parse(r.key_json))), r]));
    const sameCell = new Map<string, BaselineRow>();
    for (const r of active) sameCell.set(cellOf(CaptureKeySchema.parse(JSON.parse(r.key_json))), r);
    return captures.map((c) => {
      const hit = exact.get(keyString(c.key));
      if (hit) return { capture: c, comparison: 'match' as const, baselineId: hit.id, referencePath: posix.join(this.#layout.root, hit.rel_path) };
      const other = sameCell.get(cellOf(c.key));
      if (other) return { capture: c, comparison: 'other_environment' as const, baselineId: other.id, referencePath: null };
      return { capture: c, comparison: 'no_reference' as const, baselineId: null, referencePath: null };
    });
  }

  /** The snapshot a reference was approved on (the run's initial state), for the lines changed since. */
  snapshotOf(baselineId: string): string | null {
    return this.#db.get<{ snapshot_id: string | null }>('SELECT snapshot_id FROM baselines WHERE id = ?', baselineId)?.snapshot_id ?? null;
  }

  /**
   * The source lines that changed between the reference's approval and this run (the first changed line of each
   * changed file, the design's tokens first, then the style sources, then the rest; at most `max`).
   */
  async changedSince(baselineSnapshot: string | null, current: Manifest, firstFiles: readonly string[], max = 5): Promise<{ path: string; line: number | null; text: string }[]> {
    if (!baselineSnapshot) return [];
    const before = await this.#evidence.snapshots.load(baselineSnapshot).catch(() => null);
    if (!before) return [];
    const a = new Map(before.files.map((f) => [f[0], f]));
    const changed: { path: string; rank: number; before: (typeof before.files)[number]; after: (typeof current.files)[number] }[] = [];
    for (const f of current.files) {
      const prev = a.get(f[0]);
      if (!prev || prev[5] === f[5] || f[6] !== 'text') continue;
      const rank = firstFiles.includes(f[0]) ? 0 : /\.(css|scss|pcss|less|html?|svelte|vue|astro)$/i.test(f[0]) ? 1 : /\.(json|js|mjs|ts|tsx|jsx)$/i.test(f[0]) ? 2 : 3;
      changed.push({ path: f[0], rank, before: prev, after: f });
    }
    changed.sort((x, y) => x.rank - y.rank || (x.path < y.path ? -1 : 1));
    const out: { path: string; line: number | null; text: string }[] = [];
    for (const c of changed.slice(0, max)) {
      const [oldText, newText] = await Promise.all([this.#evidence.snapshots.content(c.before).catch(() => null), this.#evidence.snapshots.content(c.after).catch(() => null)]);
      if (oldText === null || newText === null) {
        out.push({ path: c.path, line: null, text: '' });
        continue;
      }
      const o = oldText.split('\n');
      const n = newText.split('\n');
      let k = 0;
      while (k < o.length && k < n.length && o[k] === n[k]) k++;
      out.push({ path: c.path, line: k < n.length ? k + 1 : null, text: (n[k] ?? '').trim().slice(0, 300) });
    }
    return out;
  }

  /** baseline.approve (FR-35, D-27): each capture becomes the active reference of its key; the old one is replaced. */
  async approve(projectId: string, captureIds: readonly string[]): Promise<{ approved: BaselineView[]; replaced: number }> {
    const { fs, random, clock } = this.#ports;
    const approved: BaselineView[] = [];
    let replaced = 0;
    for (const id of [...new Set(captureIds)]) {
      const ev = this.#db.get<{ id: string; check_run_id: string; kind: string; rel_path: string; sha256: string; run_id: string; project_id: string; snapshot_start_id: string | null }>(
        "SELECT e.id, e.check_run_id, e.kind, e.rel_path, e.sha256, c.run_id, r.project_id, r.snapshot_start_id FROM evidence e JOIN check_runs c ON c.id = e.check_run_id JOIN runs r ON r.id = c.run_id WHERE e.id = ?",
        id,
      );
      if (!ev || ev.project_id !== projectId || ev.kind !== 'capture') throw new CommandError('not_found', { reason: 'capture', captureId: id });
      const key = await this.keyOfCapture(ev.check_run_id, id);
      if (!key) throw new CommandError('not_found', { reason: 'capture_key', captureId: id });
      // The image is copied out of the evidence (whose run retention may delete): the reference keeps its own file.
      const src = this.#evidence.store.absolute(ev.rel_path);
      const h = await fs.hashFile(src);
      if (h.sha256 !== ev.sha256) throw new CommandError('not_found', { reason: 'damaged', captureId: id });
      const baselineId = newId(random, 'bas');
      const rel = posix.join('baselines', projectId, `${baselineId}.png`);
      const dest = posix.join(this.#layout.root, rel);
      await fs.mkdir(posix.dirname(dest), 0o700);
      if (!(await fs.writeFileExclusive(dest, await fs.readFile(src), 0o400))) throw new CommandError('internal', { reason: 'baseline_exists' });
      const at = clock.now().toISOString();
      const k = keyString(key);
      this.#db.transaction(() => {
        for (const r of this.#rows(projectId)) {
          if (keyString(CaptureKeySchema.parse(JSON.parse(r.key_json))) !== k) continue;
          this.#db.run("UPDATE baselines SET status = 'replaced' WHERE id = ?", r.id);
          replaced++;
        }
        this.#db.run(
          "INSERT INTO baselines (id, project_id, key_json, rel_path, sha256, approved_at, approved_from_check_run_id, status, snapshot_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)",
          baselineId,
          projectId,
          JSON.stringify(key),
          rel,
          ev.sha256,
          at,
          ev.check_run_id,
          ev.snapshot_start_id,
        );
        recordAudit(this.#db, { id: newId(random, 'aud'), at: clock.now(), action: 'baseline.approved', projectId, details: { baselineId, captureId: id, key: JSON.stringify(key) } });
      });
      approved.push(this.#view(this.#db.get<BaselineRow>('SELECT * FROM baselines WHERE id = ?', baselineId)!));
    }
    this.#logger.log('info', 'reference images approved', { projectId, approved: approved.length, replaced });
    return { approved, replaced };
  }

  /** The outcome of the execution a check run holds or shares (`probe.json`), or null. */
  async outcomeOf(checkRunId: string): Promise<{ outcome: ProbeOutcome; sourceCheckRunId: string } | null> {
    const raw = this.#db.get<{ raw_json: string | null }>('SELECT raw_json FROM check_runs WHERE id = ?', checkRunId)?.raw_json;
    let source = checkRunId;
    if (raw) {
      try {
        const shared = (JSON.parse(raw) as { sharedFrom?: unknown }).sharedFrom;
        if (typeof shared === 'string') source = shared;
      } catch {
        /* no raw result: its own */
      }
    }
    const ev = this.#db.get<{ rel_path: string }>("SELECT rel_path FROM evidence WHERE check_run_id = ? AND kind = 'probe' ORDER BY created_at DESC LIMIT 1", source);
    if (!ev) return null;
    try {
      const text = new TextDecoder().decode(await this.#ports.fs.readFile(this.#evidence.store.absolute(ev.rel_path)));
      const p = ProbeOutcome.safeParse(JSON.parse(text) as JsonValue);
      return p.success ? { outcome: p.data, sourceCheckRunId: source } : null;
    } catch {
      return null;
    }
  }

  /** The key of a capture, from its execution's outcome. */
  async keyOfCapture(checkRunId: string, captureId: string): Promise<CaptureKey | null> {
    return (await this.outcomeOf(checkRunId))?.outcome.comparisons.find((c) => c.captureId === captureId)?.key ?? null;
  }

  /** captures.list: what an execution captured, how each compared, and the states with no image and why (G-29). */
  async captures(checkRunId: string): Promise<{ captures: CaptureView[]; uncaptured: { state: string; viewport: string; theme: string; lang: string; reason: string }[] }> {
    const found = await this.outcomeOf(checkRunId);
    if (!found) throw new CommandError('not_found', { reason: 'no_probe_execution' });
    const { outcome, sourceCheckRunId } = found;
    const meta = new Map(outcome.cells.map((c) => [c.index, c]));
    const results = new Map(outcome.results.map((r) => [r.index, r]));
    const captures: CaptureView[] = outcome.comparisons.map((c) => {
      const shot = results.get(c.index)?.screenshot;
      return {
        id: c.captureId,
        checkRunId: sourceCheckRunId,
        key: c.key,
        page: meta.get(c.index)?.path ?? '',
        sha256: shot?.sha256 ?? '0'.repeat(64),
        width: shot?.width ?? 1,
        height: shot?.height ?? 1,
        comparison: c.comparison,
        diffRatio: c.diffRatio,
        diffId: c.diffId,
        baselineId: c.baselineId,
      };
    });
    const reasons = new Map(outcome.states.map((s) => [s.id, s.reason ?? 'sensitive']));
    const uncaptured = outcome.cells.filter((c) => c.sensitive).map((c) => ({ state: c.state, viewport: c.viewport, theme: c.theme, lang: c.lang, reason: reasons.get(c.state) ?? 'sensitive' }));
    return { captures, uncaptured };
  }

  /** A project removed (FR-02): its reference images go with it (their rows went by cascade). */
  async removeProject(projectId: string): Promise<void> {
    await this.#ports.fs.remove(posix.join(this.#layout.baselines, projectId));
  }
}
