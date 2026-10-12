<script lang="ts">
  // 19.7 «الخدمات» (FR-21, C-12 point 10): the companion services the profile declares — a development server, a
  // test database — each with its command (a project command: approved with every check that needs it), its
  // readiness sign (an address on this machine that answers, or a log line), its timeout and the checks that need
  // it. AYAR starts a service before those checks, waits for it, and stops it after them; one not ready in time
  // makes them «تعذّر: الخدمة المرافقة لم تجهز» with its log.
  import type { ProfileView, ServiceDecl } from '@ayar/protocol';
  import Button from '../../components/Button.svelte';
  import CommandBlock from '../../components/CommandBlock.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import SheetField from '../../components/SheetField.svelte';
  import TextField from '../../components/TextField.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import { attempt, copyText } from '../../app/client.ts';
  import { commandLineText } from '../../app/specs.ts';
  import { useApp } from '../../app/state.svelte.ts';

  let { projectId, profile, onupdated }: { projectId: string; profile: ProfileView; onupdated: (p: ProfileView) => void } = $props();
  const app = useApp();
  const { t } = useLocale();

  const services = $derived(Object.entries(profile.services));
  const users = (name: string) => profile.checks.filter((c) => c.services.some((s) => s.id === name)).map((c) => c.checkId);
  const running = $derived(!!app.runs.active && app.runs.active.projectId === projectId);

  let adding = $state(false);
  let name = $state('');
  let command = $state('');
  let ready = $state('');
  let timeout = $state('30');
  let error = $state<string | null>(null);
  async function add(): Promise<void> {
    error = null;
    const isUrl = /^https?:\/\//.test(ready.trim());
    const decl: ServiceDecl = { argv: command.trim().split(/\s+/), cwd: '.', readyUrl: isUrl ? ready.trim() : null, readyPattern: isUrl ? null : ready.trim() || null, readyTimeoutSec: Number(timeout) || 30, ports: [...ready.matchAll(/:(\d{2,5})(?:\/|$)/g)].map((m) => Number(m[1])).slice(0, 8) };
    const r = await attempt('profile.update', { projectId, patch: { services: { [name.trim()]: decl } } });
    if (!r.ok) {
      error = t('configui.services.invalid', { code: r.error.code });
      return;
    }
    adding = false;
    name = command = ready = '';
    onupdated(r.result);
  }
  async function remove(service: string): Promise<void> {
    const r = await attempt('profile.update', { projectId, patch: { services: { [service]: null } } });
    if (r.ok) onupdated(r.result);
  }
</script>

<section class="card" data-testid="config-services">
  <div class="card-head">
    <h2 class="card-title">{t('configui.services.title', { count: services.length })}</h2>
    <span class="spacer"></span>
    <Button kind="secondary" icon="plus" onclick={() => (adding = true)}>{t('configui.services.add')}</Button>
  </div>
  {#if services.length}
    <table class="ptable">
      <thead><tr><th scope="col">{t('configui.services.service')}</th><th scope="col">{t('configui.checks.command')}</th><th scope="col">{t('configui.services.ready')}</th><th scope="col">{t('configui.checks.timeout')}</th><th scope="col">{t('configui.services.state')}</th><th scope="col"><span class="visually-hidden">{t('sectionui.column.actions')}</span></th></tr></thead>
      <tbody>
        {#each services as [n, s] (n)}
          <tr>
            <td><bdi dir="ltr">{n}</bdi></td>
            <td><CommandBlock command={commandLineText(s.argv, s.cwd)} runsCode oncopy={copyText} /></td>
            <td class="small">{#if s.readyUrl}{t('configui.services.answers')} <span class="val"><bdi dir="ltr">{s.readyUrl.replace(/^https?:\/\//, '')}</bdi></span>{:else}{t('configui.services.logLine')} <span class="val"><bdi dir="ltr">{s.readyPattern}</bdi></span>{/if}</td>
            <td class="num">{t('configui.services.seconds', { count: s.readyTimeoutSec })}</td>
            <td><span class="val">{running ? t('configui.services.maybeRunning') : t('configui.services.stopped')}</span></td>
            <td><Button kind="quiet" onclick={() => void remove(n)}>{t('runsui.delete')}</Button></td>
          </tr>
          <tr><td colspan="6"><div class="users"><span class="row small muted">{t('configui.services.note')}</span><span class="row"><span class="small muted">{t('configui.services.neededBy')}</span>{#each users(n) as u (u)}<span class="val"><bdi dir="ltr">{u}</bdi></span>{:else}<span class="small muted">—</span>{/each}</span></div></td></tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <p class="small muted">{t('configui.services.none')}</p>
  {/if}
</section>

<Sheet open={adding} title={t('configui.services.addTitle')} oncancel={() => (adding = false)}>
  <SheetField label={t('configui.services.name')} for="svc-name"><TextField id="svc-name" bind:value={name} width="fill" dir="ltr" /></SheetField>
  <SheetField label={t('configui.checks.command')} for="svc-cmd"><TextField id="svc-cmd" bind:value={command} width="fill" mono /></SheetField>
  <SheetField label={t('configui.services.readyHint')} for="svc-ready"><TextField id="svc-ready" bind:value={ready} width="fill" mono /></SheetField>
  <SheetField label={t('configui.services.timeoutSec')} for="svc-timeout"><TextField id="svc-timeout" bind:value={timeout} width={120} inputmode="numeric" /></SheetField>
  <p class="small muted">{t('configui.services.approvalNote')}</p>
  {#if error}<p class="small" role="alert">{error}</p>{/if}
  {#snippet footer()}
    <Button kind="secondary" onclick={() => (adding = false)}>{t('ui.action.cancel')}</Button>
    <Button kind="primary" disabled={!/^[a-z][a-z0-9-]{0,39}$/.test(name.trim()) || !command.trim() || !ready.trim()} onclick={() => void add()}>{t('configui.add')}</Button>
  {/snippet}
</Sheet>

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
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-8);
  }
  .users {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }
  .card-title {
    margin: 0;
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .spacer {
    flex: 1;
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
    border-radius: 4px;
    background: var(--bg-sunken);
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
</style>
