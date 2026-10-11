// C-25 point 3 (FR-68, 12.9 «الاستيراد والمطابقة»): reading a model's result file. The file must be at most a
// megabyte, valid JSON no deeper than 32 levels, of schema `ai-result/1`, and must carry none of the fields that
// claim a pass or a fix anywhere in it — «اجتاز» and «تم الإصلاح» refuse the whole file, with the reason said
// («يدّعي اجتيازًا، وعِيَار وحده يثبت النتائج»). A note that *says* it fixed something stays a claim: text is never a
// verdict. The refused file's content is not kept.
import { AI_RESULT_FORBIDDEN_KEYS, AI_RESULT_MAX_BYTES, AiResult, type Reason } from '@ayar/protocol';

export type ReadResult = { ok: true; result: AiResult } | { ok: false; reason: Reason };

const MAX_DEPTH = 32;
const FORBIDDEN = new Set(AI_RESULT_FORBIDDEN_KEYS.map((k) => k.toLowerCase()));
/** Values of a status-like field that claim a pass or a fix. */
const FORBIDDEN_VALUES = new Set(['passed', 'pass', 'fixed', 'resolved', 'اجتاز', 'تم الإصلاح', 'أُصلح']);
const STATUS_KEYS = new Set(['status', 'result', 'outcome', 'state', 'verdict', 'الحالة', 'النتيجة']);

export function depthOf(v: unknown, d = 0): number {
  if (d > MAX_DEPTH) return d;
  if (Array.isArray(v)) return v.reduce<number>((m, x) => Math.max(m, depthOf(x, d + 1)), d + 1);
  if (v && typeof v === 'object') return Object.values(v as Record<string, unknown>).reduce<number>((m, x) => Math.max(m, depthOf(x, d + 1)), d + 1);
  return d;
}

/** The first forbidden key, or a status field valued as a pass or a fix, anywhere in the JSON; null when clean. */
export function forbiddenField(v: unknown, path = ''): string | null {
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const f = forbiddenField(v[i], `${path}[${i}]`);
      if (f) return f;
    }
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    const key = k.trim().toLowerCase();
    if (FORBIDDEN.has(key)) return `${path}.${k}`.replace(/^\./, '');
    if (STATUS_KEYS.has(key) && typeof x === 'string' && FORBIDDEN_VALUES.has(x.trim().toLowerCase())) return `${path}.${k}`.replace(/^\./, '');
    const f = forbiddenField(x, `${path}.${k}`);
    if (f) return f;
  }
  return null;
}

export function readAiResult(text: string, bytes: number): ReadResult {
  if (bytes > AI_RESULT_MAX_BYTES) return { ok: false, reason: { key: 'aichecks.rejected.tooLarge', params: { bytes, limit: AI_RESULT_MAX_BYTES } } };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: { key: 'aichecks.rejected.malformed', params: { detail: e instanceof Error ? e.message.slice(0, 120) : 'invalid JSON' } } };
  }
  if (depthOf(raw) > MAX_DEPTH) return { ok: false, reason: { key: 'aichecks.rejected.tooDeep', params: { depth: MAX_DEPTH } } };
  const forbidden = forbiddenField(raw);
  if (forbidden) return { ok: false, reason: { key: 'aichecks.rejected.claimsPass', params: { field: forbidden } } };
  const parsed = AiResult.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, reason: { key: 'aichecks.rejected.schema', params: { path: issue?.path.join('.') ?? '', detail: issue?.message.slice(0, 120) ?? '' } } };
  }
  return { ok: true, result: parsed.data };
}
