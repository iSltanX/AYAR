<script lang="ts">
  // Screen 11 · الأمن والصلاحيات (13.3; Figma 182:18272): the permissions against the policy (each permission, whether
  // the policy names it and why, where the code uses it, and the verdict: outside the policy is a proven violation, a
  // broad scope with no reason a warning, «قد لا تكون مستخدمة» a suggestion), the dependencies with known
  // vulnerabilities (the offline database's date, the failing threshold of the profile), the secrets by rule with their
  // values never shown, and the security patterns by rule with their impact.
  import type { Finding } from '@ayar/protocol';
  import Button from '../../components/Button.svelte';
  import CostTag from '../../components/CostTag.svelte';
  import Severity from '../../components/Severity.svelte';
  import Tag from '../../components/Tag.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import { PROOF_TAGS } from '../../lib/tags.ts';
  import { attempt } from '../../app/client.ts';
  import { badgeOf, costOf, day, textOr } from '../../app/format.ts';
  import { groupBy, loadPanelData, messageParts, type CheckData } from '../../app/panels.ts';
  import type { SectionModel } from '../../app/sections.ts';
  import Panel from './Panel.svelte';

  let { projectId, model }: { projectId: string; model: SectionModel } = $props();
  const { t, lang } = useLocale();

  const IDS = ['sec.ext.permissions', 'sec.ext.manifest', 'sec.deps', 'sec.secrets.files', 'sec.secrets.history', 'sec.sast'] as const;
  let data = $state<Map<string, CheckData[]>>(new Map());
  let osvDate = $state<{ key: string; date: string }[]>([]);
  $effect(() => {
    void loadPanelData(projectId, model, IDS).then((d) => (data = d));
    void attempt('tools.list', {}).then((r) => {
      if (r.ok) osvDate = r.result.dataAssets.filter((a) => a.kind === 'osv-db').map((a) => ({ key: a.key, date: a.versionOrDate }));
    });
  });

  const spec = (checkId: string) => model.profile.checks.find((s) => s.checkId === checkId && s.applicable);
  const first = (checkId: string): CheckData | undefined => data.get(checkId)?.[0];
  const resultOf = (d: CheckData | undefined) => (d?.exec.check.outcome ? badgeOf(d.exec.check.outcome, { reviewed: !!d.exec.check.reviewId, reason: d.exec.check.outcomeReason }) : undefined);
  const open = (d: CheckData | undefined): Finding[] => (d?.findings ?? []).filter((f) => f.effect !== 'excluded');
  const proof = (p: keyof typeof PROOF_TAGS) => t(PROOF_TAGS[p].key);

  // ── the permissions against the policy ──────────────────────────────────────────────────────────────────────
  type PermissionRow = { permission: string; inPolicy: boolean; reason: string | null; use: { path: string; line: number } | null };
  const perms = $derived(first('sec.ext.permissions'));
  const table = $derived.by<PermissionRow[]>(() => {
    const raw = perms?.report?.info.permissionsTable;
    return Array.isArray(raw) ? (raw as PermissionRow[]) : [];
  });
  /** The permission a finding names: its message starts with it («<all_urls> is not in…», «tabs: no use…»). */
  const permissionOf = (f: Finding) => /^(\S+?)(?::| is )/.exec(f.message)?.[1] ?? f.message;
  const permFindings = $derived(new Map(groupBy(open(perms), permissionOf)));
  const policyPath = $derived(typeof perms?.report?.info.policy === 'string' ? perms.report.info.policy : null);
  const manifestPath = $derived.by(() => {
    const m = first('sec.ext.manifest')?.report?.info.manifest;
    return typeof m === 'string' ? m : 'manifest.json';
  });

  // ── the dependencies ───────────────────────────────────────────────────────────────────────────────────────
  const deps = $derived(first('sec.deps'));
  const depsSpec = $derived(spec('sec.deps'));
  const vulns = $derived(
    open(deps)
      .filter((f) => f.ruleId === 'vuln.known')
      .map((f) => {
        const head = messageParts(f.message).head;
        const at = head.lastIndexOf('@');
        return { id: f.id, name: at > 0 ? head.slice(0, at) : head, version: f.actual ?? (at > 0 ? head.slice(at + 1) : ''), vuln: f.toolRuleId ?? '', severity: f.severity, fixed: f.expected, where: f.location?.path ?? '' };
      }),
  );
  const threshold = $derived(String((depsSpec?.thresholds?.minSeverity as string | undefined) ?? 'high'));

  // ── the secrets ────────────────────────────────────────────────────────────────────────────────────────────
  const secretRows = $derived(
    (['sec.secrets.files', 'sec.secrets.history'] as const).flatMap((checkId) =>
      groupBy(first(checkId)?.findings ?? [], (f) => f.toolRuleId ?? f.ruleId).map(([rule, fs]) => ({
        key: `${checkId}:${rule}`,
        rule,
        history: checkId === 'sec.secrets.history',
        places: fs.length,
        excluded: fs.filter((f) => f.effect === 'excluded').length,
      })),
    ),
  );
  const secretsExcluded = $derived(secretRows.reduce((n, r) => n + r.excluded, 0));
  const anySecretsCheck = $derived(!!(spec('sec.secrets.files') || spec('sec.secrets.history')));

  // ── the patterns ───────────────────────────────────────────────────────────────────────────────────────────
  const sast = $derived(first('sec.sast'));
  const patterns = $derived(
    groupBy(sast?.findings ?? [], (f) => f.ruleId).map(([rule, fs]) => ({
      rule,
      label: fs[0]!.toolRuleId ?? rule,
      impact: textOr(t, lang, `catalog.rule.${rule}.impact`, fs[0]!.message),
      places: fs.filter((f) => f.effect !== 'excluded').length,
      excluded: fs.filter((f) => f.effect === 'excluded').length,
    })),
  );
  /** A list's separator in the interface language (the template carries no letters of its own, C-24). */
  const listSep = $derived(lang === 'ar' ? '\u060C ' : ', ');
</script>

{#snippet value(text: string, mono = false)}<span class="val" class:mono><bdi dir="ltr">{text}</bdi></span>{/snippet}

{#if spec('sec.ext.permissions')}
  <Panel title={t('sectionui.security.permissions')} checkId="sec.ext.permissions" result={resultOf(perms)} testid="panel-permissions">
    {#snippet actions()}
      {@const f = open(perms)[0]}
      {#if f}<Button kind="quiet" icon="external-link" onclick={() => void attempt('editor.open', { findingId: f.id })}>{t('ui.action.openInEditor')}</Button>{/if}
    {/snippet}
    {#if perms}
      <p class="files"><span>{t('sectionui.security.manifest')}</span>{@render value(manifestPath)}{#if policyPath}<span>· {t('sectionui.security.policy')}</span>{@render value(policyPath)}{/if}</p>
      {#if table.length}
        <table class="ptable">
          <thead><tr><th scope="col">{t('sectionui.security.permission')}</th><th scope="col">{t('sectionui.security.inPolicy')}</th><th scope="col">{t('sectionui.security.policyReason')}</th><th scope="col">{t('sectionui.security.use')}</th><th scope="col">{t('sectionui.security.verdict')}</th></tr></thead>
          <tbody>
            {#each table as row (row.permission)}
              {@const fs = permFindings.get(row.permission) ?? []}
              {@const outside = fs.find((f) => f.ruleId === 'permission.outside-policy')}
              {@const broad = fs.find((f) => f.ruleId === 'permission.broad-unjustified')}
              {@const unused = fs.find((f) => f.ruleId === 'permission.maybe-unused')}
              <tr data-permission={row.permission}>
                <td>{@render value(row.permission)}</td>
                <td>{t(row.inPolicy ? 'sectionui.security.yes' : 'sectionui.security.no')}</td>
                <td class="small">{row.inPolicy ? row.reason || t('sectionui.security.noReason') : '—'}</td>
                <td>{#if row.use}{@render value(`${row.use.path}:${row.use.line}`)}{:else if unused}<span class="small muted">{t('sectionui.security.noUse')}</span>{:else}<span class="muted">—</span>{/if}</td>
                <td>
                  <span class="row">
                    {#if outside}<Severity severity={outside.severity} /><Tag>{proof(outside.proof)}</Tag><span class="small">{t('sectionui.security.outside')}</span>
                    {:else if broad}<Tag>{t('status.result.warning')}</Tag><span class="small">{t('sectionui.security.broad')}</span>
                    {:else if unused}<Tag>{proof(unused.proof)}</Tag><span class="small">{t('sectionui.security.maybeUnused')}</span>
                    {:else}<span class="small muted">{t('sectionui.security.inPolicyFine')}</span>{/if}
                  </span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {:else}
      <p class="note">{t('sectionui.panel.notRun')}</p>
    {/if}
  </Panel>
{/if}

{#if depsSpec}
  {#snippet depsTags()}{#if depsSpec.cost !== 'local'}<CostTag cost={costOf(depsSpec.network, depsSpec.cost)} />{/if}{/snippet}
  <Panel
    title={t('sectionui.security.deps')}
    checkId="sec.deps"
    result={resultOf(deps)}
    tags={depsTags}
    testid="panel-deps"
    note={deps ? [osvDate.length ? t('sectionui.security.osvDate', { dbs: osvDate.map((o) => `${o.key} ${day(o.date, lang)}`).join(listSep) }) : null, t('sectionui.security.threshold', { severity: t(`ui.severity.${threshold}` as Parameters<typeof t>[0]) })].filter(Boolean).join(' ') : t('sectionui.panel.notRun')}
  >
    {#if vulns.length}
      <table class="ptable">
        <thead><tr><th scope="col">{t('sectionui.security.package')}</th><th scope="col">{t('sectionui.security.version')}</th><th scope="col">{t('sectionui.security.vulnerability')}</th><th scope="col">{t('sectionui.security.severity')}</th><th scope="col">{t('sectionui.security.fixed')}</th><th scope="col">{t('sectionui.security.where')}</th></tr></thead>
        <tbody>
          {#each vulns as v (v.id)}
            <tr><td>{@render value(v.name)}</td><td>{@render value(v.version)}</td><td>{@render value(v.vuln)}</td><td><Severity severity={v.severity} /></td><td>{#if v.fixed}{@render value(v.fixed)}{:else}<span class="muted">—</span>{/if}</td><td>{#if v.where}{@render value(v.where)}{/if}</td></tr>
          {/each}
        </tbody>
      </table>
    {:else if deps}
      <p class="note">{t('sectionui.security.noVulns')}</p>
    {/if}
  </Panel>
{/if}

{#if anySecretsCheck}
  {#snippet secretsTags()}{#if secretsExcluded}<span class="small muted">{t('sectionui.security.excludedCount', { count: secretsExcluded })}</span>{/if}{/snippet}
  <Panel title={t('sectionui.security.secrets')} tags={secretsTags} testid="panel-secrets" note={t('sectionui.security.secretsNote')}>
    {#if secretRows.length}
      <table class="ptable">
        <thead><tr><th scope="col">{t('sectionui.security.rule')}</th><th scope="col">{t('sectionui.security.scope')}</th><th scope="col">{t('sectionui.security.places')}</th><th scope="col">{t('sectionui.security.value')}</th><th scope="col">{t('sectionui.security.state')}</th></tr></thead>
        <tbody>
          {#each secretRows as r (r.key)}
            <tr><td>{@render value(r.rule)}</td><td class="small">{t(r.history ? 'sectionui.security.history' : 'sectionui.security.files')}</td><td class="num">{r.places}</td><td><Tag>{t('sectionui.security.hidden')}</Tag></td><td class="small">{r.excluded === r.places ? t('sectionui.security.excluded') : r.excluded ? t('sectionui.security.partlyExcluded', { count: r.excluded }) : t('sectionui.security.found')}</td></tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="note">{first('sec.secrets.files') || first('sec.secrets.history') ? t('sectionui.security.noSecrets') : t('sectionui.panel.notRun')}</p>
    {/if}
  </Panel>
{/if}

{#if spec('sec.sast')}
  <Panel title={t('sectionui.security.sast')} checkId="sec.sast" result={resultOf(sast)} testid="panel-sast">
    {#if patterns.length}
      <table class="ptable">
        <thead><tr><th scope="col">{t('sectionui.security.rule')}</th><th scope="col">{t('sectionui.security.impact')}</th><th scope="col">{t('sectionui.security.places')}</th><th scope="col">{t('sectionui.security.state')}</th></tr></thead>
        <tbody>
          {#each patterns as p (p.rule)}
            <tr><td>{@render value(p.label)}</td><td class="small">{p.impact}</td><td class="num">{p.places}</td><td class="small">{p.excluded ? t('sectionui.security.partlyExcluded', { count: p.excluded }) : t('sectionui.security.found')}</td></tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="note">{sast ? t('sectionui.security.noPatterns') : t('sectionui.panel.notRun')}</p>
    {/if}
  </Panel>
{/if}

<style>
  .note,
  .files {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .files {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
  }
  .files :global(.val) {
    padding: 1px var(--space-8);
    border-radius: var(--radius-tag);
    background: var(--bg-sunken);
  }
</style>
