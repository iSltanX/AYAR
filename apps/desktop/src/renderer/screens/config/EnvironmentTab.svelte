<script lang="ts">
  // 19.3 «البيئة» (C-07): the tools the project's checks run with — the project's own (Node, pnpm…, from the login
  // shell's environment with where each version came from) and AYAR's managed ones (installed and verified by AYAR)
  // — with the checks that use each; «أعد قراءة بيئة الطرفية»; an override pins a matching installed version for
  // this project (it enters the approval); and the sensitive variables of the terminal that are not passed to
  // checks, by name only, with «اسمح بتمريره» (D-47).
  import type { CheckSpec, ProfileView, ResolvedEnv, ToolView } from '@ayar/protocol';
  import Button from '../../components/Button.svelte';
  import Icon from '../../components/Icon.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import { attempt } from '../../app/client.ts';
  import { checkTitle, dayTime } from '../../app/format.ts';

  let { projectId, profile, onupdated }: { projectId: string; profile: ProfileView; onupdated: (p: ProfileView) => void } = $props();
  const { t, lang } = useLocale();

  let env = $state<ResolvedEnv | null>(null);
  let managed = $state<ToolView[]>([]);
  let busy = $state(false);
  async function load(refresh = false): Promise<void> {
    busy = true;
    const [e, m] = await Promise.all([attempt('environment.resolve', { projectId, refresh, probe: true }), attempt('tools.list', {})]);
    busy = false;
    if (e.ok) env = e.result.env;
    if (m.ok) managed = m.result.tools.filter((x) => x.status === 'installed');
  }
  $effect(() => {
    void load();
  });

  const checks = $derived(profile.checks.filter((c) => c.applicable && c.enabled));
  const sep = $derived(lang === 'ar' ? `${String.fromCharCode(0x60c)} ` : ', ');
  /** The checks a tool serves: by the spec's tool, or by the program its command starts. */
  const usersOf = (tool: string): CheckSpec[] => checks.filter((c) => c.tool?.key === tool || c.tool?.runtime?.name === tool || c.command?.argv[0] === tool || (tool === 'node' && !!c.tool?.runtime && c.tool.runtime.name === 'node'));
  const usedBy = (tool: string) => usersOf(tool).map((c) => checkTitle(t, lang, c.checkId)).slice(0, 4).join(sep) || t('configui.env.unused');
  const sourceOf = (x: ResolvedEnv['tools'][number]) => (x.required ? t('configui.env.fromProject', { from: x.required.from }) : x.versionSource === 'manager-folder' ? t('configui.env.fromManager') : x.viaCorepack ? t('configui.env.fromCorepack') : t('configui.env.fromPath'));
  const overrides = $derived(checks.filter((c) => c.tool?.path));
  async function pin(tool: string, path: string): Promise<void> {
    const users = usersOf(tool);
    if (!users.length) return;
    const r = await attempt('profile.update', { projectId, patch: { checks: Object.fromEntries(users.map((c) => [c.instance, { toolPath: path }])) } });
    if (r.ok) onupdated(r.result);
  }
  async function unpin(c: CheckSpec): Promise<void> {
    const r = await attempt('profile.update', { projectId, patch: { checks: { [c.instance]: { toolPath: null } } } });
    if (r.ok) onupdated(r.result);
  }

  const withheld = $derived((env?.withheld ?? []).filter((name) => !checks.some((c) => c.env.allowSensitive.includes(name))));
  async function allow(name: string): Promise<void> {
    // D-47: passed by name, to the checks that run the project's code; each such check then asks for approval again.
    const targets = checks.filter((c) => c.sideEffects.runsProjectCode && !c.env.allowSensitive.includes(name));
    if (!targets.length) return;
    const r = await attempt('profile.update', { projectId, patch: { checks: Object.fromEntries(targets.map((c) => [c.instance, { allowSensitive: [...c.env.allowSensitive, name] }])) } });
    if (r.ok) onupdated(r.result);
  }
</script>

<section class="card" data-testid="config-environment">
  <div class="card-head">
    <h2 class="card-title">{t('configui.env.title')}</h2>
    <span class="spacer"></span>
    {#if env}<span class="small muted">{t('configui.env.readAt', { shell: env.shell.split('/').pop() ?? env.shell, date: dayTime(env.resolvedAt, lang) })}</span>{/if}
    <Button kind="secondary" icon="redo-2" disabled={busy} onclick={() => void load(true)}>{t('configui.env.reread')}</Button>
  </div>
  <table class="ptable">
    <thead><tr><th scope="col">{t('configui.env.tool')}</th><th scope="col">{t('configui.env.version')}</th><th scope="col">{t('configui.env.source')}</th><th scope="col">{t('configui.env.usedBy')}</th></tr></thead>
    <tbody>
      {#each env?.tools ?? [] as x (x.tool)}
        <tr>
          <td><span class="val"><bdi dir="ltr">{x.tool}</bdi></span></td>
          <td>{#if x.version}<span class="val"><bdi dir="ltr">{x.version}</bdi></span>{:else}<span class="small muted">{t('configui.env.notFound')}</span>{/if}{#if x.satisfies === false}<span class="small muted"> {t('configui.env.unsatisfied', { spec: x.required?.spec ?? '' })}</span>{/if}</td>
          <td class="small">{sourceOf(x)}{#if x.proposedPath}<span class="row"><Button kind="quiet" onclick={() => void pin(x.tool, x.proposedPath!)}>{t('configui.env.useInstalled')}</Button></span>{/if}</td>
          <td class="small">{usedBy(x.tool)}</td>
        </tr>
      {/each}
      {#each managed as m (m.key)}
        <tr>
          <td><span class="val"><bdi dir="ltr">{m.key}</bdi></span></td>
          <td><span class="val"><bdi dir="ltr">{m.installedVersion ?? m.version}</bdi></span></td>
          <td class="small">{t('configui.env.managed')}</td>
          <td class="small">{usedBy(m.key)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="overrides">
    <span class="strong">{t('configui.env.overrides')}</span>
    {#if overrides.length}
      {#each overrides as c (c.instance)}
        <span class="row small"><span>{checkTitle(t, lang, c.checkId)}</span><span class="val"><bdi dir="ltr">{c.tool?.path}</bdi></span><Button kind="quiet" onclick={() => void unpin(c)}>{t('configui.remove', { item: '' })}</Button></span>
      {/each}
    {:else}
      <span class="small muted">{t('configui.env.noOverrides')}</span>
    {/if}
  </div>
</section>

<section class="card">
  <div class="card-head"><h2 class="card-title">{t('configui.env.withheld', { count: withheld.length })}</h2><span class="spacer"></span><Icon name="lock" size={16} /></div>
  {#each withheld as name (name)}
    <div class="env-row">
      <Icon name="triangle-alert" size={16} />
      <span class="val"><bdi dir="ltr">{name}</bdi></span>
      <span class="stack small"><span>{t('approval.env.present')}</span><span class="muted">{t('approval.env.warning')}</span></span>
      <span class="spacer"></span>
      <Button kind="secondary" onclick={() => void allow(name)}>{t('approval.env.allow')}</Button>
    </div>
  {:else}
    <p class="small muted">{t('configui.env.noneWithheld')}</p>
  {/each}
  <p class="small muted">{t('configui.env.withheldNote')}</p>
</section>

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
  .card-head,
  .overrides,
  .env-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
  }
  .env-row {
    padding-block: var(--space-8);
    border-block-end: 1px solid var(--border-subtle);
  }
  .card-title {
    margin: 0;
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .row {
    display: inline-flex;
    align-items: center;
    gap: var(--space-8);
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .spacer {
    flex: 1;
  }
  .strong {
    font: var(--type-body-strong);
    color: var(--text-primary);
  }
  .small {
    margin: 0;
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .muted {
    color: var(--text-secondary);
  }
  .val {
    padding: 1px var(--space-8);
    border-radius: var(--radius-tag);
    background: var(--bg-sunken);
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
