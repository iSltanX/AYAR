// code.refs.local (C-13): every local reference of the project's pages and documents points at something that is
// there — `src` and `href` in HTML, `url()` in CSS, links and images in Markdown with their anchors — everything but
// the manifest (sec.ext.manifest's). External links are code.refs.external's (the network). A broken reference in a
// page of the app or the extension is «مرتفعة», in the documentation «متوسطة» (C-16).
import { finding, pushFinding } from '@ayar/adapters';
import postcss from 'postcss';
import { posix } from 'node:path';
import { checkCancel, ext, htmlTags, isLocalRef, lineIndex, OK, report, splitRef, styleSources, type Analyzer, type AnalyzerInput } from './common.ts';

/** GitHub's heading slug: lower case, punctuation dropped (Unicode letters and digits kept), spaces to hyphens. */
export function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** The anchors a document defines: Markdown headings (with GitHub's de-duplication), and HTML ids and names. */
export function anchorsOf(rel: string, text: string): Set<string> {
  const out = new Set<string>();
  const e = ext(rel);
  if (e === 'md' || e === 'markdown') {
    const counts = new Map<string, number>();
    let fence = false;
    for (const line of text.split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      if (fence) continue;
      const h = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
      if (!h) continue;
      const base = slug(h[1]!);
      const n = counts.get(base) ?? 0;
      counts.set(base, n + 1);
      out.add(n ? `${base}-${n}` : base);
    }
  }
  for (const m of text.matchAll(/\b(?:id|name)\s*=\s*["']([^"']+)["']/g)) out.add(m[1]!);
  return out;
}

interface Ref {
  file: string;
  line: number;
  ref: string;
}

/** The local references of one file, by its kind. */
export function referencesOf(rel: string, text: string): Ref[] {
  const out: Ref[] = [];
  const e = ext(rel);
  if (e === 'md' || e === 'markdown') {
    const at = lineIndex(text);
    let fence = false;
    let offset = 0;
    for (const line of text.split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) fence = !fence;
      if (!fence) {
        const noCode = line.replace(/`[^`]*`/g, (c) => ' '.repeat(c.length));
        // [text](target "title"), ![alt](target), and reference definitions `[x]: target`.
        for (const m of noCode.matchAll(/!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g)) out.push({ file: rel, line: at(offset), ref: m[1]! });
        const def = /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+["'(].*)?$/.exec(noCode);
        if (def) out.push({ file: rel, line: at(offset), ref: def[1]! });
        for (const m of noCode.matchAll(/<(?:img|a)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) out.push({ file: rel, line: at(offset), ref: m[1]! });
      }
      offset += line.length + 1;
    }
  }
  if (e === 'html' || e === 'htm' || e === 'svelte' || e === 'vue' || e === 'astro') {
    const page = e === 'html' || e === 'htm';
    for (const t of htmlTags(text)) {
      if (t.name === 'base') continue;
      for (const a of ['src', 'href', 'poster', 'data']) {
        const v = t.attrs[a];
        if (v === undefined) continue;
        // In a component (Svelte, Vue, Astro), a link is a route of the app, not a file.
        if (!page && t.name === 'a' && a === 'href') continue;
        out.push({ file: rel, line: t.line, ref: v });
      }
      if (t.attrs.srcset) for (const part of t.attrs.srcset.split(',')) out.push({ file: rel, line: t.line, ref: part.trim().split(/\s+/)[0] ?? '' });
    }
  }
  for (const s of styleSources(rel, text)) {
    try {
      const root = postcss.parse(s.css);
      root.walkDecls((d) => {
        for (const m of d.value.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) out.push({ file: rel, line: s.line - 1 + (d.source?.start?.line ?? 1), ref: m[2]! });
      });
      root.walkAtRules('import', (a) => {
        const m = /(?:url\(\s*)?['"]([^'"]+)['"]/.exec(a.params);
        if (m) out.push({ file: rel, line: s.line - 1 + (a.source?.start?.line ?? 1), ref: m[1]! });
      });
    } catch {
      // An unparsable stylesheet: reported once by the caller as «تعذّر تحليل الملف».
      out.push({ file: rel, line: s.line, ref: '\u0000unparsable' });
    }
  }
  return out.filter((r) => r.ref === '\u0000unparsable' || isLocalRef(r.ref));
}

const DOC = (rel: string) => /\.(md|markdown)$/i.test(rel) || /(^|\/)docs?\//.test(rel);

export const refsAnalyzer: Analyzer = {
  id: 'refs-local',
  version: '1.0.0',
  limitsKey: 'analyzer.limits.refs',
  run(i: AnalyzerInput) {
    const r = report(this, ['html', 'css', 'markdown']);
    const comp = i.component === '.' ? '' : `${i.component}/`;
    const sources = i.files.filter((f) => /\.(html?|css|scss|md|markdown|svelte|vue|astro)$/i.test(f) && !/(^|\/)manifest\.json$/.test(f));
    const anchors = new Map<string, Set<string>>();
    const anchorsFor = (rel: string): Set<string> | null => {
      if (!anchors.has(rel)) {
        const text = i.read(rel);
        if (text === null) return null;
        anchors.set(rel, anchorsOf(rel, text));
      }
      return anchors.get(rel)!;
    };
    let checked = 0;
    for (const file of sources) {
      checkCancel(i);
      const text = i.read(file);
      if (text === null) continue;
      for (const ref of referencesOf(file, text)) {
        if (ref.ref === '\u0000unparsable') {
          pushFinding(r, finding({ rule: 'analysis.unparsable-file', origin: 'tool', message: `${file} could not be parsed as CSS`, location: { path: file, line: ref.line }, anchor: { kind: 'text', value: file } }));
          continue;
        }
        checked++;
        const { path, fragment } = splitRef(ref.ref);
        if (path === '' && !fragment) continue;
        // The target: relative to the file's folder; `/x` from the component's root, or its public folder.
        const targets = path === '' ? [file] : path.startsWith('/') ? [posix.normalize(`${comp}${path.slice(1)}`), posix.normalize(`${comp}public/${path.slice(1)}`)] : [posix.normalize(posix.join(posix.dirname(file), path))];
        const target = targets.find((t) => !t.startsWith('..') && (i.exists(t) || i.exists(`${t}/index.html`)));
        const severity = DOC(file) ? 'medium' : 'high';
        const anchor = { kind: 'code' as const, value: '' };
        if (!target) {
          if (targets.every((t) => t.startsWith('..'))) continue; // outside the project: not this check's to judge
          pushFinding(r, finding({ rule: 'ref.missing-file', severity, message: `${ref.ref}: ${targets[0]} does not exist`, location: { path: file, line: ref.line }, anchor }));
          continue;
        }
        if (fragment && /\.(md|markdown|html?)$/i.test(target)) {
          const known = anchorsFor(target);
          if (known && !known.has(fragment) && !known.has(fragment.toLowerCase())) pushFinding(r, finding({ rule: 'ref.missing-anchor', severity, message: `${ref.ref}: #${fragment} is not in ${target}`, location: { path: file, line: ref.line }, anchor }));
        }
      }
    }
    r.info.references = checked;
    r.info.files = sources.length;
    return { report: r, exit: OK };
  },
};
