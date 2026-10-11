<script lang="ts">
  // 19.2 «الفحوص»: every applicable check of the profile — enabled, required, blocking, its command (an argument
  // vector, no shell, FR-22) and its timeout — edited as a draft, then «احفظ ويحتاج اعتمادًا»: a change to what runs
  // is kept as pending and asks for approval before the next run (D-08); «تجاهل التغييرات» drops the draft.
  import type { CheckOverride, CheckSpec, ProfileView } from '@ayar/protocol';
  import Button from '../../components/Button.svelte';
  import Checkbox from '../../components/Checkbox.svelte';
  import SearchField from '../../components/SearchField.svelte';
  import Select from '../../components/Select.svelte';
  import Switch from '../../components/Switch.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import { attempt } from '../../app/client.ts';
  import { checkTitle } from '../../app/format.ts';
  import { useApp } from '../../app/state.svelte.ts';

  let { projectId, profile, onupdated }: { projectId: string; profile: ProfileView; onupdated: (p: ProfileView) => void } = $props();
  const app = useApp();
  const { t, lang } = useLocale();

  const applicable = $derived(profile.checks.filter((c) => c.applicable));
  let query = $state('');
  const shown = $derived(applicable.filter((c) => !query.trim() || `${checkTitle(t, lang, c.checkId)} ${c.checkId}`.toLowerCase().includes(query.trim().toLowerCase())));

  /** The draft: what the owner changed, by instance; the rest is the profile as it is. */
  let draft = $state<Record<string, CheckOverride>>({});
  const value = <K extends keyof CheckOverride>(c: CheckSpec, key: K, fallback: CheckOverride[K]): CheckOverride[K] => (draft[c.instance]?.[key] ?? fallback);
  const set = (c: CheckSpec, patch: CheckOverride) => (draft = { ...draft, [c.instance]: { ...draft[c.instance], ...patch } });
  const commandText = (c: CheckSpec) => {
    const argv = draft[c.instance]?.argv ?? c.command?.argv ?? null;
    return argv ? argv.map((a) => (/\s|["']/.test(a) ? JSON.stringify(a) : a)).join(' ') : '';
  };
  /** An argument vector from a line: spaces split, double quotes keep one argument together (no shell, FR-22). */
  function argvOf(line: string): string[] {
    const out: string[] = [];
    const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g;
    for (let m = re.exec(line); m; m = re.exec(line)) out.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2]!);
    return out;
  }
  const TIMEOUTS = [1, 2, 3, 5, 10, 15, 30, 60] as const;
  const timeoutOptions = (current: number) => [...new Set([...TIMEOUTS, current])].sort((a, b) => a - b).map((m) => ({ value: String(m), label: t('configui.checks.minutes', { count: m }) }));
  const dirty = $derived(Object.keys(draft).length > 0);
  let busy = $state(false);
  let error = $state<string | null>(null);
  async function save(): Promise<void> {
    if (!dirty || busy) return;
    busy = true;
    error = null;
    const r = await attempt('profile.update', { projectId, patch: { checks: draft } });
    busy = false;
    if (!r.ok) {
      error = t('configui.checks.invalid', { code: r.error.code });
      return;
    }
    draft = {};
    onupdated(r.result);
  }
</script>

<section class="card" data-testid="config-checks">
  <div class="card-head">
    <h2 class="card-title">{t('configui.checks.title', { applicable: applicable.length, shown: shown.length })}</h2>
    <span class="spacer"></span>
    <SearchField bind:value={query} placeholder={t('configui.checks.search')} width={220} />
    <Button kind="secondary" icon="plus" onclick={() => app.navigate({ name: 'section', projectId, section: 'custom' })}>{t('configui.checks.addCustom')}</Button>
  </div>
  <table class="ptable">
    <thead>
      <tr>
        <th scope="col">{t('configui.checks.enabled')}</th>
        <th scope="col">{t('scanplan.column.check')}</th>
        <th scope="col">{t('configui.checks.required')}</th>
        <th scope="col">{t('configui.checks.blocking')}</th>
        <th scope="col">{t('configui.checks.command')}</th>
        <th scope="col">{t('configui.checks.timeout')}</th>
      </tr>
    </thead>
    <tbody>
      {#each shown as c (c.instance)}
        {@const name = checkTitle(t, lang, c.checkId)}
        {@const enabled = value(c, 'enabled', c.enabled) ?? true}
        {@const required = value(c, 'required', c.required) ?? false}
        <tr data-instance={c.instance}>
          <td><Switch label={t('approval.enable', { name })} showLabel={false} checked={enabled} onchange={(on: boolean) => set(c, { enabled: on })} /></td>
          <td><span class="stack"><span class="strong">{name}</span><bdi class="mono muted" dir="ltr">{c.checkId}{c.component !== '.' ? `@${c.component}` : ''}</bdi></span></td>
          <td><Checkbox label={t('configui.checks.requiredOf', { name })} showLabel={false} disabled={!enabled} checked={required} onchange={(on: boolean) => set(c, { required: on, ...(on ? {} : { blocking: false }) })} /></td>
          <td><Checkbox label={t('configui.checks.blockingOf', { name })} showLabel={false} disabled={!enabled || !required} checked={value(c, 'blocking', c.blocking) ?? false} onchange={(on: boolean) => set(c, { blocking: on })} /></td>
          <td>
            {#if c.command}
              <input class="command" dir="ltr" aria-label={t('configui.checks.commandOf', { name })} value={commandText(c)} onchange={(e) => { const argv = argvOf(e.currentTarget.value); if (argv.length) set(c, { argv }); }} />
            {:else}
              <span class="small muted">{t('configui.checks.builtIn')}</span>
            {/if}
          </td>
          <td><Select label={t('configui.checks.timeoutOf', { name })} width={100} value={String(value(c, 'timeoutMin', c.timeoutMin) ?? c.timeoutMin)} options={timeoutOptions(c.timeoutMin)} onchange={(e: Event & { currentTarget: HTMLSelectElement }) => set(c, { timeoutMin: Number(e.currentTarget.value) })} /></td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if error}<p class="small" role="alert">{error}</p>{/if}
  <div class="footer">
    <p class="small muted">{t('configui.checks.note')}</p>
    <span class="spacer"></span>
    <Button kind="quiet" disabled={!dirty || busy} onclick={() => (draft = {})}>{t('configui.checks.discard')}</Button>
    <Button kind="secondary" disabled={!dirty || busy} onclick={() => void save()}>{t('configui.checks.save')}</Button>
  </div>
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
  .footer {
    display: flex;
    align-items: center;
    gap: var(--space-8);
  }
  .card-title {
    margin: 0;
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .command {
    inline-size: 100%;
    min-inline-size: 220px;
    block-size: 28px;
    padding: 0 var(--space-8);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    background: var(--bg-surface);
    font: var(--type-body-small);
    color: var(--text-primary);
  }
  .command:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
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
  .mono {
    font: var(--type-mono);
  }
  .muted {
    color: var(--text-secondary);
  }
</style>
