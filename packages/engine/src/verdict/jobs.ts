// What runs in a worker thread (C-13 «تعمل في خيوط عمل داخل المحرك حتى لا يتأثر تجاوبه، وتقبل الإلغاء», and C-15's
// reading of large reports, AT-39): an adapter reading the reports of one execution, or an analyzer reading the
// project's files; then the anchor of every finding (C-15 «بصمة الاكتشاف»): the normalized line with its
// neighbours for code (from the project's file as it is), an HMAC of the value for a secret, computed in memory and
// never kept (the value is read from its span, or the tool's own fingerprint stands in when the file is gone), and
// the value itself for a test, a dependency, a permission, a key, a state. Files are read without following a link,
// inside the root only, and bounded. A job is plain data in, plain data out (structured clone).
import { adapterById, emptyReport, REPORT_LIMITS, type ExitInfo, type ReportFile } from '@ayar/adapters';
import { analyzerById, Cancelled, type AnalyzerInput } from '@ayar/analyzers';
import { compareImages, judgeProbe, ProbeOutcome, PROBE_JUDGE_VERSION } from '@ayar/probe';
import type { CheckSpec, ExitSignal, Fact, JsonValue, ParsedFinding, ParsedReport } from '@ayar/protocol';
import { createHash, createHmac } from 'node:crypto';
import { closeSync, lstatSync, openSync, readdirSync, readFileSync, readSync, realpathSync, writeFileSync } from 'node:fs';
import { posix } from 'node:path';
import { gzipSync } from 'node:zlib';

export interface ParseJob {
  kind: 'parse';
  adapter: string;
  root: string;
  cwd: string;
  component: string;
  checkId: string;
  reports: { name: string; step: number; path: string; size: number; truncated: boolean }[];
  stdoutPath: string | null;
  stderrPath: string | null;
  exit: ExitInfo;
  thresholds: Record<string, unknown> | null;
  outputs: string[];
  customSuccess: CheckSpec['customSuccess'];
  /** When the execution started (epoch ms): a report the project holds counts only if written since. */
  startedAt: number;
  /** The component's files in the run's inventory (countFiles). */
  inventory: string[];
  hmacKey: Uint8Array;
}

export interface AnalyzeJob {
  kind: 'analyze';
  analyzer: string;
  root: string;
  component: string;
  checkId: string;
  files: string[];
  references: Record<string, JsonValue>;
  thresholds: Record<string, unknown> | null;
  facts: Fact[];
  hmacKey: Uint8Array;
}

/** C-14 (DEV-7): one check's judgement of a probe execution, from its outcome kept in the evidence (`probe.json`). */
export interface ProbeJudgeJob {
  kind: 'probe';
  root: string;
  component: string;
  checkId: string;
  files: string[];
  references: Record<string, JsonValue>;
  thresholds: Record<string, unknown> | null;
  facts: Fact[];
  /** Absolute: the outcome's redacted copy in the evidence store. */
  outcomePath: string;
  hmacKey: Uint8Array;
}

/** G-28 (DEV-7): captures against their references, pixel by pixel, off the engine's thread; diff images written. */
export interface CompareJob {
  kind: 'compare';
  root: string;
  pairs: { reference: string; capture: string; diff: string }[];
}

export type Job = ParseJob | AnalyzeJob | ProbeJudgeJob | CompareJob;

export interface JobResult {
  report: ParsedReport;
  exit: ExitSignal;
  /** The anchor of each finding, in order: a hex digest (C-15). */
  anchors: string[];
  /** A compare job's answer, pair by pair: the share of differing pixels, and whether a diff image was written. */
  compared?: { ratio: number; differs: boolean; sameSize: boolean; diff: boolean; error: string | null }[];
}

/** The outcome of a probe execution is read with the report limit (it is a report AYAR wrote itself). */
const MAX_OUTCOME_BYTES = 64 * 1024 * 1024;

const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_LOG_BYTES = 1024 * 1024;

/** A reader of the project's files: no link followed, inside the root, bounded; null otherwise. */
export interface ProjectReader {
  read: (rel: string) => string | null;
  exists: (rel: string) => boolean;
  size: (rel: string) => number | null;
}

export function projectReader(root: string): ProjectReader {
  let realRoot: string;
  try {
    realRoot = realpathSync(root);
  } catch {
    realRoot = root;
  }
  const resolve = (rel: string): string | null => {
    if (!rel || rel.includes('\0') || posix.isAbsolute(rel)) return null;
    const abs = posix.normalize(posix.join(root, rel));
    if (!abs.startsWith(`${posix.normalize(root)}/`)) return null;
    try {
      const real = realpathSync(abs);
      if (real !== realRoot && !real.startsWith(`${realRoot}/`)) return null;
      return abs;
    } catch {
      return null;
    }
  };
  // Bounded by bytes, not by count: 64 MB of texts at most in a worker.
  const cache = new Map<string, string | null>();
  let cached = 0;
  return {
    read: (rel) => {
      if (cache.has(rel)) return cache.get(rel)!;
      const abs = resolve(rel);
      let text: string | null = null;
      if (abs) {
        try {
          const st = lstatSync(abs);
          if (st.isFile() && st.size <= MAX_SOURCE_BYTES) text = readFileSync(abs, 'utf8');
        } catch {
          text = null;
        }
      }
      if (cached + (text?.length ?? 0) > 64 * 1024 * 1024) {
        cache.clear();
        cached = 0;
      }
      cache.set(rel, text);
      cached += text?.length ?? 0;
      return text;
    },
    exists: (rel) => {
      const abs = resolve(rel);
      if (!abs) return false;
      try {
        lstatSync(abs);
        return true;
      } catch {
        return false;
      }
    },
    size: (rel) => {
      const abs = resolve(rel);
      if (!abs) return null;
      try {
        const st = lstatSync(abs);
        return st.isFile() ? st.size : null;
      } catch {
        return null;
      }
    },
  };
}

/** C-15 on a report the tool writes into the project: inside the root, no link, within the limit, written now. */
export function projectReport(root: string, rel: string, startedAt: number): { text: string | null; problem: 'missing' | 'stale' | 'too_large' | null; size: number | null } {
  if (!rel || rel.includes('\0') || posix.isAbsolute(rel)) return { text: null, problem: 'missing', size: null };
  const abs = posix.normalize(posix.join(root, rel));
  if (!abs.startsWith(`${posix.normalize(root)}/`)) return { text: null, problem: 'missing', size: null };
  try {
    const st = lstatSync(abs);
    if (!st.isFile()) return { text: null, problem: 'missing', size: null };
    if (st.size > REPORT_LIMITS.maxBytes) return { text: null, problem: 'too_large', size: st.size };
    // A second of slack for file systems that round modification times.
    if (st.mtimeMs < startedAt - 1000) return { text: null, problem: 'stale', size: st.size };
    return { text: readFileSync(abs, 'utf8'), problem: null, size: st.size };
  } catch {
    return { text: null, problem: 'missing', size: null };
  }
}

/** The last megabyte of a log, as text. */
function tail(path: string | null): string {
  if (!path) return '';
  try {
    const st = lstatSync(path);
    if (!st.isFile()) return '';
    const fd = openSync(path, 'r');
    try {
      const n = Math.min(st.size, MAX_LOG_BYTES);
      const buf = Buffer.alloc(n);
      readSync(fd, buf, 0, n, st.size - n);
      return buf.toString('utf8');
    } finally {
      closeSync(fd);
    }
  } catch {
    return '';
  }
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/** C-15: the anchor of a finding, a digest; never the secret itself. */
export function anchorOf(f: ParsedFinding, read: (rel: string) => string | null, key: Uint8Array): string {
  const a = f.anchor;
  const path = f.location?.path ?? null;
  if (a.kind === 'code') {
    const line = f.location?.line;
    const text = path && !f.location?.outside ? read(path) : null;
    if (text !== null && line) {
      const lines = text.split('\n');
      const norm = (n: number) => (lines[n] ?? '').trim().replace(/\s+/g, ' ');
      return sha(`code\n${norm(line - 2)}\n${norm(line - 1)}\n${norm(line)}`);
    }
    return sha(`code-message\n${f.message.trim().replace(/\s+/g, ' ')}`);
  }
  if (a.kind === 'secret') {
    let value: string | null = null;
    const span = /^span:(\d+):(\d+):(\d+)$/.exec(a.value);
    if (span && path && !f.location?.outside) {
      const text = read(path);
      const line = text?.split('\n')[Number(span[1]) - 1];
      if (line !== undefined) value = line.slice(Number(span[2]) - 1, Number(span[3]) > 0 ? Number(span[3]) : undefined);
    }
    // In memory only: the HMAC with the install's key (C-18), never the value.
    return createHmac('sha256', key).update(value ?? `fingerprint\n${a.value}`).digest('hex');
  }
  if (a.kind === 'text' && !a.value) return sha(`text\n${f.message.trim().replace(/\s+/g, ' ')}`);
  return sha(`${a.kind}\n${a.value}`);
}

function listDir(root: string, rel: string): string[] | null {
  const reader = projectReader(root);
  if (!reader.exists(rel)) return null;
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(posix.join(root, d), { withFileTypes: true })) {
      if (out.length > 20_000) return;
      const r = posix.join(d, e.name);
      if (e.isDirectory()) walk(r);
      else if (e.isFile()) out.push(r);
    }
  };
  try {
    walk(rel);
  } catch {
    return null;
  }
  return out;
}

function analyzerInput(job: AnalyzeJob | ProbeJudgeJob, reader: ProjectReader, cancelled: () => boolean): AnalyzerInput {
  return {
    root: job.root,
    component: job.component,
    checkId: job.checkId,
    files: job.files,
    read: reader.read,
    exists: reader.exists,
    size: reader.size,
    listDir: (rel) => listDir(job.root, rel),
    gzipSize: (rel) => {
      const t = reader.size(rel);
      // A file over the report limit is not compressed in memory: its size is enough to exceed a budget.
      if (t === null || t > REPORT_LIMITS.maxBytes) return t;
      try {
        return gzipSync(readFileSync(posix.join(job.root, rel))).length;
      } catch {
        return null;
      }
    },
    references: job.references,
    thresholds: job.thresholds,
    facts: job.facts,
    cancelled,
  };
}

/** G-28: each pair compared; a pair that cannot be read says why (the capture is then «تعذّر» to compare). */
function runCompare(job: CompareJob, cancelled: () => boolean): JobResult {
  const compared: NonNullable<JobResult['compared']> = [];
  for (const p of job.pairs) {
    if (cancelled()) throw new Cancelled();
    try {
      const r = compareImages(readFileSync(p.reference), readFileSync(p.capture));
      if (r.diff) writeFileSync(p.diff, r.diff, { mode: 0o600, flag: 'wx' });
      compared.push({ ratio: r.ratio, differs: r.differs, sameSize: r.sameSize, diff: r.diff !== null, error: null });
    } catch (e) {
      compared.push({ ratio: 1, differs: true, sameSize: false, diff: false, error: e instanceof Error ? e.message.slice(0, 300) : String(e) });
    }
  }
  return { report: emptyReport({ id: 'compare', version: PROBE_JUDGE_VERSION }), exit: { kind: 'ok' }, anchors: [], compared };
}

/** Runs one job; throws Cancelled when told to stop (C-13). */
export function runJob(job: Job, cancelled: () => boolean = () => false): JobResult {
  if (job.kind === 'compare') return runCompare(job, cancelled);
  const reader = projectReader(job.root);
  let report: ParsedReport;
  let exit: ExitSignal;
  if (job.kind === 'probe') {
    const st = lstatSync(job.outcomePath);
    if (!st.isFile() || st.size > MAX_OUTCOME_BYTES) throw new Error('the probe outcome cannot be read');
    const outcome = ProbeOutcome.parse(JSON.parse(readFileSync(job.outcomePath, 'utf8')) as unknown);
    const r = judgeProbe({ ...analyzerInput(job, reader, cancelled), outcome });
    report = r.report;
    exit = r.exit;
  } else if (job.kind === 'parse') {
    const adapter = adapterById(job.adapter);
    if (!adapter) throw new Error(`unknown adapter ${job.adapter}`);
    const files: ReportFile[] = job.reports.map((r) => {
      // C-15: a report over the limit is not read at all.
      if (r.truncated || r.size > REPORT_LIMITS.maxBytes) return { name: r.name, step: r.step, text: null, size: r.size, truncated: true };
      try {
        return { name: r.name, step: r.step, text: readFileSync(r.path, 'utf8'), size: r.size, truncated: false };
      } catch {
        return { name: r.name, step: r.step, text: null, size: r.size, truncated: true };
      }
    });
    const comp = job.component === '.' ? '' : `${job.component}/`;
    const ctx = {
      root: job.root,
      cwd: job.cwd,
      component: job.component,
      checkId: job.checkId,
      files,
      stdout: tail(job.stdoutPath),
      stderr: tail(job.stderrPath),
      read: reader.read,
      countFiles: (exts: readonly string[]) => job.inventory.filter((f) => (comp === '' || f.startsWith(comp)) && exts.some((e) => f.endsWith(e))).length,
      thresholds: job.thresholds,
      outputs: job.outputs,
      exists: reader.exists,
      customSuccess: job.customSuccess,
      projectReport: (rel: string) => projectReport(job.root, rel, job.startedAt),
    };
    report = adapter.parseReports(ctx, job.exit);
    exit = adapter.exitMap(job.exit, report, ctx);
  } else {
    const analyzer = analyzerById(job.analyzer);
    if (!analyzer) throw new Error(`unknown analyzer ${job.analyzer}`);
    const r = analyzer.run(analyzerInput(job, reader, cancelled));
    report = r.report;
    exit = r.exit;
  }
  if (cancelled()) throw new Cancelled();
  return { report, exit, anchors: report.findings.map((f) => anchorOf(f, reader.read, job.hmacKey)) };
}
