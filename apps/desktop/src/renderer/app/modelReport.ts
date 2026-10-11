// The «للنموذج» text as the page shows it (12.3, 12.4, D-DES4-11): the exact text that is copied, split into its
// lines — headings (the «#» kept, as copied), the template's meta comment, plain lines, and each quoted block of
// project data between this report's AYAR-DATA boundaries (12.5 rule 3), drawn with the Report data block. A
// redaction marker becomes a redacted segment; the copied text keeps the literal marker. Pure; no markup.
import type { Lang, Translate } from '@ayar/i18n';
import type { LogSegment } from '../lib/evidence.ts';
import { logSegments } from './logs.ts';

export type ReportBlock =
  | { kind: 'h1' | 'h2' | 'h3' | 'meta' | 'line'; segments: LogSegment[] }
  | { kind: 'data'; opening: string; lines: LogSegment[][]; closing: string };

export function parseModelReport(t: Translate, lang: Lang, text: string, token: string): ReportBlock[] {
  const open = `<<<AYAR-DATA ${token}`;
  const close = `<<<END AYAR-DATA ${token}>>>`;
  const out: ReportBlock[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trimStart();
    if (trimmed.startsWith(open)) {
      const body: LogSegment[][] = [];
      let j = i + 1;
      while (j < lines.length && lines[j]!.trim() !== close) body.push(logSegments(t, lang, lines[j++]!));
      out.push({ kind: 'data', opening: trimmed, lines: body, closing: close });
      i = j;
      continue;
    }
    if (!line.trim()) continue;
    const kind = trimmed.startsWith('### ') ? 'h3' : trimmed.startsWith('## ') ? 'h2' : trimmed.startsWith('# ') ? 'h1' : trimmed.startsWith('<!--') ? 'meta' : 'line';
    out.push({ kind, segments: logSegments(t, lang, line) });
  }
  return out;
}
