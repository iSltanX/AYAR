<script lang="ts">
  // Screen 20 · الأدوات (13.3, C-11, FR-49, FR-50; Figma 20.1): the tools AYAR manages itself — each pinned to a
  // version from its official source, with its licence, its fingerprint check and its state — with «ثبّت…» (the
  // preview first: where from, how big, where it goes; nothing downloads without consent), «تحقق» (re-hash against
  // the pin) and «أزل» (the main process asks first); the data assets (the offline vulnerability databases, the
  // probe's browser); and the catalog facts AYAR checked more than its staleness limit ago, shown with their age.
  import { MESSAGES } from '@ayar/i18n';
  import type { DataAssetView, ToolView } from '@ayar/protocol';
  import Button from '../components/Button.svelte';
  import CostTag from '../components/CostTag.svelte';
  import Icon from '../components/Icon.svelte';
  import SearchField from '../components/SearchField.svelte';
  import SheetSetupPreview from '../components/SheetSetupPreview.svelte';
  import Tag from '../components/Tag.svelte';
  import { useLocale } from '../lib/locale.ts';
  import type { SetupPreviewData } from '../lib/sheets.ts';
  import { attempt, copyText } from '../app/client.ts';
  import { day } from '../app/format.ts';
  import { sizeText } from '../app/results.ts';

  const { t, lang } = useLocale();

  let tools = $state<ToolView[]>([]);
  let assets = $state<DataAssetView[]>([]);
  let query = $state('');
  async function load(): Promise<void> {
    const r = await attempt('tools.list', {});
    if (!r.ok) return;
    tools = r.result.tools;
    assets = r.result.dataAssets;
  }
  $effect(() => {
    void load();
  });
  const shown = $derived(tools.filter((x) => !query.trim() || x.key.includes(query.trim().toLowerCase())));
  const roleOf = (key: string) => {
    const k = `toolsui.role.${key}`;
    return k in (MESSAGES[lang] as Record<string, string>) ? t(k as Parameters<typeof t>[0]) : '';
  };
  const statusText = (x: ToolView) => t(`toolsui.status.${x.status}`);
  const hostOf = (url: string) => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  };

  // ── install: the preview, then the main process's token (FR-50) ────────────────────────────────────────────
  let installing = $state<{ key: string; token: string; data: SetupPreviewData } | null>(null);
  let busy = $state<string | null>(null);
  async function preview(x: ToolView): Promise<void> {
    const r = await attempt('tools.preview', { toolId: x.key });
    if (!r.ok) return;
    const p = r.result.preview as { url?: string; host?: string; sizeBytes?: number | null; writes?: string };
    installing = { key: x.key, token: r.result.confirmationToken, data: { action: t('toolsui.installAction', { tool: x.key, version: x.version }), command: p.url ?? x.homepage, runsCode: false, networkDestination: p.host ?? hostOf(p.url ?? ''), sizeMb: p.sizeBytes ? Math.max(1, Math.round(p.sizeBytes / 1_000_000)) : 0 } };
  }
  async function install(): Promise<void> {
    const i = installing;
    installing = null;
    if (!i) return;
    busy = i.key;
    await attempt('tools.install', { toolId: i.key, confirmationToken: i.token });
    busy = null;
    await load();
  }
  async function verify(x: ToolView): Promise<void> {
    busy = x.key;
    await attempt('tools.verify', { toolId: x.key });
    busy = null;
    await load();
  }
  async function remove(x: ToolView): Promise<void> {
    const c = await attempt('confirm.issue', { command: 'tools.remove', target: x.key });
    if (!c.ok || 'cancelled' in c.result) return;
    busy = x.key;
    await attempt('tools.remove', { toolId: x.key, confirmationToken: c.result.confirmationToken });
    busy = null;
    await load();
  }
  const stale = $derived(tools.filter((x) => x.stale));
</script>

<div class="page" data-testid="tools">
  <header class="header">
    <h1 class="title">{t('ui.nav.tools')}</h1>
    <p class="small muted">{t('toolsui.subtitle')}</p>
  </header>

  <section class="card">
    <div class="card-head">
      <h2 class="card-title">{t('toolsui.tools', { count: tools.length })}</h2>
      <span class="spacer"></span>
      <SearchField bind:value={query} width={200} />
    </div>
    <table class="ptable">
      <thead><tr><th scope="col">{t('toolsui.tool')}</th><th scope="col">{t('toolsui.version')}</th><th scope="col">{t('toolsui.source')}</th><th scope="col">{t('toolsui.hash')}</th><th scope="col">{t('toolsui.state')}</th><th scope="col"><span class="visually-hidden">{t('sectionui.column.actions')}</span></th></tr></thead>
      <tbody>
        {#each shown as x (x.key)}
          {@const installed = x.status === 'installed'}
          <tr data-tool={x.key}>
            <td><span class="stack"><bdi class="strong" dir="ltr">{x.key}</bdi>{#if roleOf(x.key)}<span class="small muted">{roleOf(x.key)}</span>{/if}</span></td>
            <td>{#if installed}<span class="val"><bdi dir="ltr">{x.installedVersion ?? x.version}</bdi></span>{:else}<span class="val"><bdi dir="ltr">{x.version}</bdi></span>{/if}</td>
            <td><span class="stack small"><span>{t('toolsui.official')} <bdi dir="ltr">{hostOf(x.homepage)}</bdi></span><span>{t('toolsui.license')} <span class="val"><bdi dir="ltr">{x.license}</bdi></span></span></span></td>
            <td>
              {#if installed}
                <span class="stack small"><Tag icon="shield-check">{x.verifiedOk === false ? t('toolsui.hashMismatch') : t('toolsui.hashOk')}</Tag>{#if x.verifiedAt ?? x.installedAt}<span class="muted">{day((x.verifiedAt ?? x.installedAt)!, lang)}</span>{/if}</span>
              {:else}
                <span class="small muted">{t('toolsui.notDownloaded')}</span>
              {/if}
            </td>
            <td><Tag>{statusText(x)}</Tag></td>
            <td>
              <span class="row end">
                {#if installed}
                  <Button kind="quiet" disabled={busy === x.key} onclick={() => void verify(x)}>{t('toolsui.verify')}</Button>
                  <Button kind="quiet" disabled={busy === x.key} onclick={() => void remove(x)}>{t('toolsui.remove')}</Button>
                {:else}
                  <Button kind="secondary" disabled={busy === x.key} onclick={() => void preview(x)}>{t('toolsui.install')}</Button>
                  <CostTag cost="network" />
                {/if}
              </span>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="small muted">{t('toolsui.note')}</p>
  </section>

  <section class="card">
    <h2 class="card-title">{t('toolsui.assets')}</h2>
    {#if assets.length}
      <table class="ptable">
        <thead><tr><th scope="col">{t('toolsui.asset')}</th><th scope="col">{t('toolsui.versionOrDate')}</th><th scope="col">{t('toolsui.size')}</th></tr></thead>
        <tbody>
          {#each assets as a (a.key)}
            <tr>
              <td><span class="stack"><span class="strong">{t(`toolsui.assetKind.${a.kind}`, { key: a.key })}</span><span class="small muted">{t(`toolsui.assetFor.${a.kind}`)}</span></span></td>
              <td>{#if a.kind === 'browser'}<span class="val"><bdi dir="ltr">{a.versionOrDate}</bdi></span>{:else}{day(a.updatedAt, lang)}{/if}</td>
              <td class="num">{a.sizeBytes === null ? '—' : sizeText(a.sizeBytes)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="small muted">{t('toolsui.noAssets')}</p>
    {/if}
    <p class="small muted">{t('toolsui.assetsNote')}</p>
  </section>

  {#if stale.length}
    <section class="card">
      <div class="card-head"><h2 class="card-title">{t('toolsui.stale', { count: stale.length })}</h2><span class="spacer"></span><Icon name="history" size={16} /></div>
      <p class="small muted">{t('toolsui.staleNote')}</p>
      <table class="ptable">
        <thead><tr><th scope="col">{t('toolsui.fact')}</th><th scope="col">{t('toolsui.checkedAt')}</th></tr></thead>
        <tbody>
          {#each stale as x (x.key)}
            <tr><td>{t('toolsui.staleFact', { tool: x.key })}</td><td>{day(x.catalogVerifiedAt, lang)}</td></tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
</div>

{#if installing}
  <SheetSetupPreview open data={installing.data} oncancel={() => (installing = null)} onapply={() => void install()} oncopy={copyText} />
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-24);
    padding: var(--space-24) var(--space-32);
  }
  .header {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .title {
    margin: 0;
    font: var(--type-title-page);
    color: var(--text-primary);
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
    padding: var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-card);
    background: var(--bg-surface);
  }
  .card-head {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }
  .card-title {
    margin: 0;
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .stack {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
  .row {
    display: inline-flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: var(--space-8);
  }
  .end {
    justify-content: flex-end;
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
