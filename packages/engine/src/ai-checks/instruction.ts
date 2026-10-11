// C-25 point 2 (FR-67, 12.9 «محتوى كل ملف»): the instruction file `ai-check/1`, Arabic or English, in its six
// parts — the role and scope with the files named, the context from AYAR (technologies, the checks that passed and
// what they prove so the model does not redo them, the open findings), the questions specialized from the knowledge
// items (28.4) with the project's own names, the mandatory rules 1–8 of 12.3 and the ninth («لا تعدّل شيئًا»), the
// required output (`ai-result/1`, its place and its schema, with «اجتاز» and «تم الإصلاح» forbidden), and the data
// boundaries with the report's random token. Nothing here reads a file: the service hands over what the project
// says; project content sits inside the boundaries.
import type { AiTemplate, Catalog } from '@ayar/catalog';
import { createTranslator, type MessageKey, type Translate } from '@ayar/i18n';
import type { AiNeedInput, Lang, Reason } from '@ayar/protocol';
import { fenced, inline } from '../reports/boundaries.ts';
import { tryT } from '../reports/render.ts';

export interface InstructionInput {
  catalog: Catalog;
  template: AiTemplate;
  lang: Lang;
  displayId: string;
  projectName: string;
  ecosystems: readonly string[];
  reasons: readonly Reason[];
  inputs: readonly AiNeedInput[];
  files: readonly string[];
  passed: readonly { checkId: string; instance: string; reason: Reason | null }[];
  openFindings: readonly { displayId: string; checkId: string; titleKey: string; where: string | null }[];
  /** Project texts quoted for the model (a README's head), each inside the boundaries. */
  quotes: readonly { source: string; text: string }[];
  resultPath: string;
  token: string;
  createdAt: string;
}

const reason = (t: Translate, r: Reason | null): string => (r ? (tryT(t, r.key, r.params) ?? r.key) : '');

export function renderInstruction(i: InstructionInput): string {
  const t = createTranslator(i.lang);
  const key = i.template.id.slice('ai.'.length);
  const title = t(i.template.text.title as MessageKey);
  const role = t(i.template.text.role as MessageKey);
  const out: string[] = [];
  out.push(`# ${t('aichecks.file.title', { title })}`);
  out.push(`<!-- ${t('aichecks.file.meta', { schema: 'ai-check/1', template: i.template.id, version: i.template.version, lang: i.lang, id: i.displayId, created: i.createdAt.slice(0, 19).replace('T', ' ') })} -->`);
  out.push(`> ${t('ui.aiCheck.generated')} · ${t('aichecks.file.notExecuted')} · ${t('ui.cost.withYourModel')}`);
  out.push('');
  // 1. Role and scope.
  out.push(`## 1. ${t('aichecks.file.role.heading')}`);
  out.push(`${t('aichecks.file.role.intro', { project: inline(i.projectName), title })} ${role}`);
  out.push(`- ${t('aichecks.file.role.why')}: ${i.reasons.map((r) => reason(t, r)).filter(Boolean).join('؛ ') || '—'}`);
  out.push(`- ${t('aichecks.file.role.files')}:`);
  for (const f of i.files.slice(0, 200)) out.push(`  - \`${inline(f)}\``);
  if (!i.files.length) out.push(`  - ${t('aichecks.file.role.noFiles')}`);
  out.push(`- ${t('aichecks.file.role.notReviewed')}`);
  out.push('');
  // 2. The context from AYAR.
  out.push(`## 2. ${t('aichecks.file.context.heading')}`);
  out.push(`- ${t('aichecks.file.context.stack', { stack: inline(i.ecosystems.join(' · ') || t('report.unknown')) })}`);
  out.push(`- ${t('aichecks.file.context.passed')}:`);
  if (!i.passed.length) out.push(`  - ${t('aichecks.file.context.noPassed')}`);
  for (const p of i.passed) out.push(`  - \`${p.checkId}\` (${tryT(t, `catalog.check.${p.checkId.replace('*', 'any')}.title`) ?? p.checkId}): ${reason(t, p.reason)} — ${tryT(t, `catalog.check.${p.checkId.replace('*', 'any')}.limits`) ?? ''}`);
  out.push(`- ${t('aichecks.file.context.open')}:`);
  if (!i.openFindings.length) out.push(`  - ${t('aichecks.file.context.noOpen')}`);
  for (const f of i.openFindings.slice(0, 50)) out.push(`  - ${f.displayId} — ${inline(tryT(t, f.titleKey) ?? f.titleKey)}${f.where ? ` (\`${inline(f.where)}\`)` : ''}`);
  for (const inp of i.inputs) if (inp.value !== null && inp.source !== 'user') out.push(`- ${t(inp.labelKey as MessageKey)}:`, fenced(i.token, inp.value, { source: inp.key, range: t('aichecks.file.context.fromDiscovery') }));
  for (const inp of i.inputs) if (inp.value !== null && inp.source === 'user') out.push(`- ${t(inp.labelKey as MessageKey)} (${t('aichecks.file.context.fromOwner')}):`, fenced(i.token, inp.value, { source: inp.key, range: t('aichecks.file.context.fromOwner') }));
  for (const q of i.quotes) out.push(`- ${t('aichecks.file.context.quote', { source: inline(q.source) })}:`, fenced(i.token, q.text, { source: q.source, range: t('aichecks.file.context.quoteRange') }));
  out.push('');
  // 3. The questions, from the knowledge items' templates, specialized with the project's names.
  out.push(`## 3. ${t('aichecks.file.questions.heading')}`);
  const names = i.files.slice(0, 8).map((f) => `\`${inline(f)}\``).join(', ') || t('aichecks.file.questions.theFiles');
  let n = 1;
  for (let q = 1; q <= 6; q++) {
    const text = tryT(t, `aichecks.q.${key}.${q}`, { files: names, project: inline(i.projectName) });
    if (text) out.push(`${n++}. ${text}`);
  }
  for (const itemId of i.template.items) {
    const item = i.catalog.kb.item(itemId);
    if (!item) continue;
    out.push(`${n++}. ${t('aichecks.file.questions.fromItem', { title: item.title })}`);
    for (const s of item.steps.slice(0, 4)) out.push(`   - ${s}`);
  }
  out.push('');
  // 4. The mandatory rules.
  out.push(`## 4. ${t('aichecks.file.rules.heading')}`);
  for (let r = 1; r <= 8; r++) out.push(`${r}. ${t(`report.model.rule${r}` as MessageKey, { token: i.token })}`);
  out.push(`9. ${t('aichecks.file.rules.rule9')}`);
  out.push('');
  // 5. The required output.
  out.push(`## 5. ${t('aichecks.file.output.heading')}`);
  out.push(t('aichecks.file.output.intro', { path: `\`${inline(i.resultPath)}\``, schema: 'ai-result/1' }));
  out.push('```json');
  out.push(
    JSON.stringify(
      {
        schema: 'ai-result/1',
        id: i.displayId,
        template: i.template.id,
        templateVersion: i.template.version,
        model: t('aichecks.file.output.modelPlaceholder'),
        createdAt: '2026-01-01T00:00:00.000Z',
        notes: [
          {
            location: { path: 'src/example.ts', line: 1, symbol: 'exampleFunction' },
            kind: 'suspicion | suggestion | question',
            severity: 'critical | high | medium | low | info | null',
            summary: t('aichecks.file.output.summaryPlaceholder'),
            evidence: t('aichecks.file.output.evidencePlaceholder'),
            localCheck: i.template.provableBy[0] ?? null,
          },
        ],
      },
      null,
      2,
    ),
  );
  out.push('```');
  out.push(`- ${t('aichecks.file.output.kinds')}`);
  out.push(`- ${t('aichecks.file.output.forbidden')}`);
  out.push(`- ${t('aichecks.file.output.localCheck', { checks: i.template.provableBy.map((c) => `\`${c}\``).join(', ') || t('aichecks.file.output.noLocalCheck') })}`);
  out.push(`- ${t('aichecks.file.output.limit')}`);
  out.push('');
  // 6. The data boundaries.
  out.push(`## 6. ${t('aichecks.file.boundaries.heading')}`);
  out.push(t('aichecks.file.boundaries.text', { token: i.token }));
  out.push('');
  return `${out.join('\n')}\n`;
}
