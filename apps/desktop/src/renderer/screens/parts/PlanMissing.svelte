<script lang="ts">
  // 22.5 «حالات النقص في الخطة» (9.4 point 5; Figma 22.5): what keeps required checks from running, a card each, with
  // its cause and its remedy — a tool version the project asks for and the terminal does not give (the version
  // installed on the computer offered explicitly: it enters the approval), a setup action with the command it would
  // run and what it touches («ثبّت…» opens its preview), and a check whose command changed since its approval (the
  // change itself, «اعتمد»). The scan can start anyway: those checks show «ناقص» with their reason.
  import type { ChangeItem, PlanItem, ProfileView, ResolvedEnv, SetupAction } from '@ayar/protocol';
  import Button from '../../components/Button.svelte';
  import CommandBlock from '../../components/CommandBlock.svelte';
  import ReadinessBadge from '../../components/ReadinessBadge.svelte';
  import Tag from '../../components/Tag.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import { DIFF_SIGNS } from '../../lib/sheets.ts';
  import { attempt, copyText } from '../../app/client.ts';
  import { checkTitle, reasonText } from '../../app/format.ts';
  import { argvText, changeOf } from '../../app/specs.ts';
  import { useApp } from '../../app/state.svelte.ts';

  interface Props {
    projectId: string;
    items: readonly PlanItem[];
    profile: ProfileView | null;
    onsetup: () => void;
    onchanged: () => void;
  }
  let { projectId, items, profile, onsetup, onchanged }: Props = $props();
  const app = useApp();
  const { t, lang } = useLocale();

  let actions = $state<SetupAction[]>([]);
  let env = $state<ResolvedEnv | null>(null);
  $effect(() => {
    void items.length;
    void attempt('readiness.evaluate', { projectId }).then((r) => {
      // The actions this plan waits on, each naming only the plan's own missing checks.
      if (r.ok) actions = r.result.actions.filter((a) => a.state !== 'done').map((a) => ({ ...a, instances: a.instances.filter((i) => items.some((x) => x.instance === i)) })).filter((a) => a.instances.length);
    });
    void attempt('environment.resolve', { projectId }).then((r) => {
      if (r.ok) env = r.result.env;
    });
  });

  const sep = $derived(lang === 'ar' ? ` ${String.fromCharCode(0xb7)} ` : ' · ');
  const ids = (instances: readonly string[]) => [...new Set(instances.map((i) => i.split('@')[0]!))].join(sep);
  const names = (instances: readonly string[]) => [...new Set(instances.map((i) => checkTitle(t, lang, i.split('@')[0]!)))].join(lang === 'ar' ? `${String.fromCharCode(0x60c)} ` : ', ');

  // A tool version the project asks for that the terminal does not give (C-07 point 3).
  const mismatched = $derived((env?.tools ?? []).filter((x) => x.satisfies === false && x.required));
  const usersOf = (tool: string) => (profile?.checks ?? []).filter((c) => c.applicable && (c.tool?.key === tool || c.tool?.runtime?.name === tool));
  async function useInstalled(tool: string, path: string): Promise<void> {
    const users = usersOf(tool);
    if (!users.length) return;
    const r = await attempt('profile.update', { projectId, patch: { checks: Object.fromEntries(users.map((c) => [c.instance, { toolPath: path }])) } });
    if (r.ok) onchanged();
  }

  // A check whose spec changed since its approval: the change, then «اعتمد» for it alone.
  const pending = $derived<ChangeItem[]>((profile?.pending.items ?? []).filter((i) => i.approvable && !i.approveAlone && items.some((x) => x.instance === i.instance)));
  /** What is missing for another reason (a tool not found, the untrusted mode…): by reason, the checks it holds back. */
  const covered = $derived(new Set([...actions.flatMap((a) => a.instances), ...pending.map((p) => p.instance), ...mismatched.flatMap((x) => usersOf(x.tool).map((c) => c.instance))]));
  const others = $derived.by(() => {
    const rest = items.filter((x) => !covered.has(x.instance)).map((i) => ({ instance: i.instance, reason: i.reasons.map((r) => reasonText(t, lang, r)).join(' ') || t('planmissing.unknown') }));
    return [...new Set(rest.map((r) => r.reason))].map((reason) => ({ reason, instances: rest.filter((r) => r.reason === reason).map((r) => r.instance) }));
  });

  async function approve(instance: string): Promise<void> {
    if (!profile) return;
    const r = await attempt('profile.approve', { projectId, changeSetId: profile.pending.id, instances: [instance] });
    if (r.ok) onchanged();
  }
</script>

{#each mismatched as x (x.tool)}
  {@const users = usersOf(x.tool)}
  {@const installed = x.installed.find((i) => i.path === x.proposedPath) ?? x.installed[0]}
  <section class="card" data-cause="version">
    <div class="head">
      <span class="strong">{names(users.map((c) => c.instance))}</span>
      <bdi class="mono muted" dir="ltr">{ids(users.map((c) => c.instance))}</bdi>
      <span class="spacer"></span>
      <Tag icon="circle-alert">{t('planmissing.versionTag', { tool: x.tool })}</Tag>
    </div>
    <p class="body">{t('planmissing.versionReason', { tool: x.tool, spec: x.required?.spec ?? '', version: x.version ?? t('planmissing.none') })}</p>
    <dl class="facts">
      <dt>{t('planmissing.required')}</dt><dd><bdi dir="ltr">{x.required?.spec}</bdi> {t('planmissing.from')} <bdi dir="ltr">{x.required?.from}</bdi></dd>
      <dt>{t('planmissing.available')}</dt><dd><bdi dir="ltr">{x.version ?? '—'}</bdi></dd>
      {#if installed}<dt>{t('planmissing.installed')}</dt><dd><bdi dir="ltr">{installed.version}</bdi> {t('planmissing.via')} <bdi dir="ltr">{installed.manager}</bdi></dd>{/if}
    </dl>
    <div class="actions">
      {#if x.proposedPath && installed}<Button kind="primary" onclick={() => void useInstalled(x.tool, x.proposedPath!)}>{t('planmissing.use', { version: installed.version })}</Button>{/if}
      <span class="small muted">{t('planmissing.orInstall')}</span>
    </div>
  </section>
{/each}

{#each actions as a (a.id)}
  <section class="card" data-cause="setup">
    <div class="head">
      <span class="strong">{names(a.instances)}</span>
      <bdi class="mono muted" dir="ltr">{ids(a.instances)}</bdi>
      <span class="spacer"></span>
      <ReadinessBadge readiness="needs-setup" size="sm" />
    </div>
    <p class="body">{t('planmissing.setupReason', { what: reasonText(t, lang, a.title) })}</p>
    {#if a.preview.command}
      <p class="small muted">{t('planmissing.preview')}</p>
      <CommandBlock command={argvText(a.preview.command)} runsCode={a.kind === 'install_dependencies'} writes={a.preview.writes.some((w) => w.location === 'project')} writesPath={a.preview.writes.find((w) => w.location === 'project')?.path} network={!!a.preview.network} oncopy={copyText} />
    {/if}
    <div class="actions"><Button kind="primary" onclick={onsetup}>{t('planmissing.install')}</Button></div>
  </section>
{/each}

{#each others as o (o.reason)}
  <section class="card" data-cause="other">
    <div class="head">
      <span class="strong">{names(o.instances)}</span>
      <bdi class="mono muted" dir="ltr">{ids(o.instances)}</bdi>
      <span class="spacer"></span>
      <ReadinessBadge readiness="needs-setup" size="sm" />
    </div>
    <p class="body">{o.reason}</p>
  </section>
{/each}

{#each pending as p (p.instance)}
  {@const change = changeOf(t, lang, p, p.instance.split('@')[0] ?? p.instance)}
  <section class="card" data-cause="approval">
    <div class="head">
      <span class="strong">{checkTitle(t, lang, p.instance.split('@')[0] ?? p.instance)}</span>
      <bdi class="mono muted" dir="ltr">{p.instance.split('@')[0]}</bdi>
      <span class="spacer"></span>
      <Tag icon="circle-alert">{t('planmissing.changedTag')}</Tag>
    </div>
    <p class="body">{t('planmissing.changedReason')}</p>
    <div class="diff" dir="ltr">
      {#each change.lines as line, i (i)}<div class="line {line.kind}"><span class="sign">{DIFF_SIGNS[line.kind]}</span><span>{line.text}</span></div>{/each}
    </div>
    <div class="actions">
      <Button kind="primary" onclick={() => void approve(p.instance)}>{t('planmissing.approve')}</Button>
      <Button kind="quiet" onclick={() => app.navigate({ name: 'config', projectId, tab: 'approval' })}>{t('planmissing.fullDiff')}</Button>
    </div>
  </section>
{/each}

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    padding: var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  .head,
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
  }
  .facts {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--space-8) var(--space-24);
    margin: 0;
    padding: var(--space-12) var(--space-16);
    border-radius: var(--radius-control);
    background: var(--bg-sunken);
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .facts dt {
    color: var(--text-secondary);
  }
  .facts dd {
    margin: 0;
  }
  .diff {
    padding: var(--space-8) 0;
    border-radius: var(--radius-control);
    background: var(--bg-sunken);
    font: var(--type-mono);
    color: var(--text-primary);
  }
  .line {
    display: flex;
    gap: var(--space-8);
    padding: 0 var(--space-12);
    white-space: pre-wrap;
  }
  .line.added,
  .line.removed {
    background: var(--border-subtle);
  }
  .spacer {
    flex: 1;
  }
  .strong {
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .body {
    margin: 0;
    font: var(--type-body);
    color: var(--text-primary);
  }
  .small {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .mono {
    font: var(--type-mono);
  }
  .muted {
    color: var(--text-secondary);
  }
</style>
