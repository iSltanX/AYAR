// The only way detectors read file contents: through the walk's inventory. A file the walk did not inventory
// (a .env*, a key, an ignored or skipped file, anything behind a link that leaves the root) cannot be opened
// here at all. Each read is capped (2 MB for a configuration file by default); a bigger file is never read
// whole (AT-01) and becomes a «too large» warning instead.
import { posix } from 'node:path';
import { parseConfig, type ConfigFormat } from './parse.ts';
import { sensitiveKind, type DiscoveryFs, type WalkResult } from './walker.ts';

export type ReadOutcome = { ok: true; text: string; size: number } | { ok: false; error: 'missing' | 'too_large' | 'unreadable'; size?: number };
export type ConfigOutcome = { ok: true; value: unknown; text: string } | { ok: false; error: 'missing' | 'too_large' | 'unreadable' | 'invalid'; message?: string };

export class ProjectReader {
  readonly #root: string;
  readonly #fs: DiscoveryFs;
  readonly #walk: WalkResult;
  readonly #maxConfigBytes: number;
  readonly #texts = new Map<string, Promise<ReadOutcome>>();
  readonly #configs = new Map<string, Promise<ConfigOutcome>>();
  /** Configuration files that could not be parsed or were too large: they become facts and warnings. */
  readonly problems = new Map<string, { error: 'too_large' | 'invalid' | 'unreadable'; message?: string }>();
  /** Every file actually opened, and how many bytes were asked for (tests prove .env and huge files are not). */
  readonly opened: { path: string; maxBytes: number }[] = [];

  constructor(root: string, fs: DiscoveryFs, walk: WalkResult, maxConfigBytes: number) {
    this.#root = root;
    this.#fs = fs;
    this.#walk = walk;
    this.#maxConfigBytes = maxConfigBytes;
  }

  get walk(): WalkResult {
    return this.#walk;
  }

  has(rel: string): boolean {
    return this.#walk.files.has(rel);
  }

  size(rel: string): number | null {
    return this.#walk.files.get(rel)?.size ?? null;
  }

  /** Reads a whole text file up to `maxBytes` (default: the configuration limit). */
  text(rel: string, maxBytes = this.#maxConfigBytes): Promise<ReadOutcome> {
    const key = `${rel}\u0000${maxBytes}`;
    let p = this.#texts.get(key);
    if (!p) {
      p = this.#read(rel, maxBytes, false);
      this.#texts.set(key, p);
    }
    return p;
  }

  /** Reads the beginning of a file (an HTML page's head, a CSS file's variables) without caring for the rest. */
  head(rel: string, maxBytes: number): Promise<ReadOutcome> {
    return this.#read(rel, maxBytes, true);
  }

  async #read(rel: string, maxBytes: number, prefixOnly: boolean): Promise<ReadOutcome> {
    const f = this.#walk.files.get(rel);
    if (!f) return { ok: false, error: 'missing' };
    // Defence in depth (FR-08): never open a sensitive name, neither the path nor a link's target.
    if (sensitiveKind(posix.basename(rel)) || (f.target && sensitiveKind(posix.basename(f.target)))) return { ok: false, error: 'missing' };
    if (!prefixOnly && f.size > maxBytes) return { ok: false, error: 'too_large', size: f.size };
    const path = f.target ?? posix.join(this.#root, rel);
    try {
      this.opened.push({ path: rel, maxBytes });
      const { data, size } = await this.#fs.readFilePrefix(path, maxBytes);
      if (!prefixOnly && size > maxBytes) return { ok: false, error: 'too_large', size };
      return { ok: true, text: new TextDecoder('utf-8', { fatal: false }).decode(data), size };
    } catch {
      return { ok: false, error: 'unreadable' };
    }
  }

  config(rel: string, format: ConfigFormat): Promise<ConfigOutcome> {
    let p = this.#configs.get(rel);
    if (!p) {
      p = (async (): Promise<ConfigOutcome> => {
        const t = await this.text(rel);
        if (!t.ok) {
          if (t.error !== 'missing') this.problems.set(rel, { error: t.error });
          return { ok: false, error: t.error };
        }
        const parsed = parseConfig(t.text, format);
        if (!parsed.ok) {
          this.problems.set(rel, { error: 'invalid', message: parsed.error });
          return { ok: false, error: 'invalid', message: parsed.error };
        }
        return { ok: true, value: parsed.value, text: t.text };
      })();
      this.#configs.set(rel, p);
    }
    return p;
  }

  /** Files whose path (relative to the root) matches, in inventory order (sorted). */
  find(pred: (rel: string) => boolean): string[] {
    return [...this.#walk.files.keys()].filter(pred).sort();
  }
}
