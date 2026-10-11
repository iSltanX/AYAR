// C-23 the exporter (FR-38, 14.2 `ayar-report/1`, D-46, T5, AT-27): a run report (or a fix prompt, or a card) as
// Markdown in either language, as HTML that stands alone — inline styles, no script, no remote resource, fonts by
// name with system fallbacks — as JSON (`report/1` under a `meta` head), or as a compressed evidence bundle (a tar
// in gzip) with the evidence files whose hashes still match their index; a damaged one is left out and said so.
// Screenshots never enter Markdown, HTML or JSON, and enter the bundle only with the explicit «ضمّن اللقطات» (D-46).
// Every text passes the second redaction (C-18) before it is written; the file goes where the save dialog said.
import type { Lang, Report, ReportExported } from '@ayar/protocol';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { gzipSync } from 'node:zlib';
import { ENGINE_VERSION } from '../version.ts';
import { tar, type TarEntry } from './tar.ts';

export type ExportFormat = 'markdown' | 'html' | 'json' | 'evidence-bundle';

export interface ExportInput {
  report: Report;
  lang: Lang;
  human: string;
  model: string;
  content: 'both' | 'human' | 'model';
  format: ExportFormat;
  generatedAt: string;
  /** For the bundle: the evidence files of the report's executions, read and verified by the caller. */
  evidence?: { name: string; data: Uint8Array; ok: boolean; id: string; screenshot: boolean }[];
  includeScreenshots?: boolean;
}

export function exportMeta(r: Report, format: ExportFormat, lang: Lang, generatedAt: string) {
  return {
    schema: 'ayar-report/1' as const,
    ayar: ENGINE_VERSION,
    format,
    lang,
    generatedAt,
    profile: r.head.versions.profile,
    catalog: r.head.versions.catalog,
    environment: r.head.environment.source,
    git: { branch: r.head.state.branch, commit: r.head.state.commit },
    snapshotId: r.head.state.snapshotId,
  };
}

export function toMarkdown(i: ExportInput): string {
  const parts: string[] = [];
  if (i.content !== 'model') parts.push(i.human);
  if (i.content !== 'human') parts.push(i.model);
  return `${parts.join('\n\n---\n\n')}\n`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A light, dependency-free rendering of the report's Markdown subset: headings, lists, code, paragraphs. */
export function markdownToHtml(md: string): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let pre = false;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  const inline = (s: string) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
  for (const raw of md.split('\n')) {
    if (pre) {
      if (/^<<<END AYAR-DATA /.test(raw) || raw === '```') {
        out.push(`${esc(raw)}</pre>`);
        pre = false;
      } else out.push(esc(raw));
      continue;
    }
    if (/^<<<AYAR-DATA /.test(raw) || raw === '```') {
      closeList();
      out.push(`<pre class="data">${esc(raw)}`);
      pre = true;
      continue;
    }
    const h = /^(#{1,6}) (.*)$/.exec(raw);
    if (h) {
      closeList();
      out.push(`<h${h[1]!.length}>${inline(h[2]!)}</h${h[1]!.length}>`);
      continue;
    }
    const li = /^(\s*)- (.*)$/.exec(raw);
    const oli = /^(\s*)(\d+)\. (.*)$/.exec(raw);
    if (li || oli) {
      const kind = li ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((li ?? oli)![li ? 2 : 3]!)}</li>`);
      continue;
    }
    closeList();
    if (/^<!--.*-->$/.test(raw)) {
      out.push(`<p class="meta">${esc(raw.replace(/^<!--\s*|\s*-->$/g, ''))}</p>`);
      continue;
    }
    if (raw.trim() === '---') out.push('<hr>');
    else if (raw.trim()) out.push(`<p>${inline(raw)}</p>`);
  }
  closeList();
  if (pre) out.push('</pre>');
  return out.join('\n');
}

export function toHtml(i: ExportInput): string {
  const dir = i.lang === 'ar' ? 'rtl' : 'ltr';
  const title = `${i.report.displayId} · ${i.report.head.project.name}`;
  const body = markdownToHtml(toMarkdown(i));
  // No script, no remote resource, fonts by name with system fallbacks (C-23). A CSP meta refuses anything else.
  return `<!doctype html>
<html lang="${i.lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; connect-src 'none'; font-src 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root { color-scheme: light dark; --fg: #1f1f1f; --bg: #ffffff; --muted: #5f5f5f; --rule: #d9d9d9; --data: #f4f4f4; }
@media (prefers-color-scheme: dark) { :root { --fg: #e8e8e8; --bg: #141414; --muted: #a8a8a8; --rule: #3a3a3a; --data: #1f1f1f; } }
body { margin: 0 auto; max-width: 56rem; padding: 2rem 1rem; color: var(--fg); background: var(--bg); font: 16px/1.7 "Cairo", "Noto Naskh Arabic", "IBM Plex Sans Arabic", -apple-system, "Segoe UI", sans-serif; }
h1, h2, h3 { line-height: 1.3; } h1 { font-size: 1.6rem; } h2 { font-size: 1.25rem; border-block-end: 1px solid var(--rule); padding-block-end: .25rem; margin-block-start: 2rem; } h3 { font-size: 1.05rem; }
code, pre { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: .9em; unicode-bidi: isolate; direction: ltr; text-align: start; }
pre { background: var(--data); border: 1px solid var(--rule); padding: .75rem; overflow: auto; white-space: pre-wrap; word-break: break-word; }
pre.data { border-inline-start: 4px solid var(--muted); }
.meta { color: var(--muted); font-size: .85em; } hr { border: 0; border-block-start: 1px solid var(--rule); margin: 2rem 0; }
li { margin-block: .15rem; }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

export function toJson(i: ExportInput): string {
  return `${JSON.stringify({ meta: exportMeta(i.report, 'json', i.lang, i.generatedAt), report: i.report, formats: { human: i.content !== 'model' ? i.human : null, model: i.content !== 'human' ? i.model : null } }, null, 2)}\n`;
}

/** The bundle: the report in every text form, and the verified evidence files (screenshots only when asked). */
export function toBundle(i: ExportInput): { data: Uint8Array; included: number; damaged: string[]; screenshots: number } {
  const mtime = Math.floor(new Date(i.generatedAt).getTime() / 1000);
  const enc = new TextEncoder();
  const entries: TarEntry[] = [
    { name: `${i.report.displayId}/report.json`, data: enc.encode(toJson(i)), mtime },
    { name: `${i.report.displayId}/report.${i.lang}.md`, data: enc.encode(toMarkdown(i)), mtime },
    { name: `${i.report.displayId}/report.${i.lang}.html`, data: enc.encode(toHtml(i)), mtime },
  ];
  const damaged: string[] = [];
  let included = 0;
  let screenshots = 0;
  for (const e of i.evidence ?? []) {
    if (!e.ok) {
      damaged.push(e.id);
      continue;
    }
    if (e.screenshot) {
      if (!i.includeScreenshots) continue;
      screenshots++;
    }
    entries.push({ name: posix.join(i.report.displayId, 'evidence', e.name), data: e.data, mtime });
    included++;
  }
  const manifest = { schema: 'ayar-evidence-bundle/1', report: i.report.displayId, files: entries.map((e) => ({ name: e.name, sha256: createHash('sha256').update(e.data).digest('hex'), size: e.data.length })), damaged, screenshotsIncluded: i.includeScreenshots === true };
  entries.push({ name: `${i.report.displayId}/MANIFEST.json`, data: enc.encode(`${JSON.stringify(manifest, null, 2)}\n`), mtime });
  return { data: gzipSync(tar(entries), { level: 6 }), included, damaged, screenshots };
}

export function render(i: ExportInput): { data: Uint8Array; evidence: ReportExported['evidence'] } {
  const enc = new TextEncoder();
  switch (i.format) {
    case 'markdown':
      return { data: enc.encode(toMarkdown(i)), evidence: null };
    case 'html':
      return { data: enc.encode(toHtml(i)), evidence: null };
    case 'json':
      return { data: enc.encode(toJson(i)), evidence: null };
    case 'evidence-bundle': {
      const b = toBundle(i);
      return { data: b.data, evidence: { included: b.included, damaged: b.damaged, screenshots: b.screenshots } };
    }
  }
}
