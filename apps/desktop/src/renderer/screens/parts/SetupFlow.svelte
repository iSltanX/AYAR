<script lang="ts">
  // The setup panel (13.3 «لوحة التجهيز»; Sheet/Setup panel 115:9207 and Sheet/Setup preview 114:8794; D-07, 9.4):
  // the proposed setup actions with what each lacks and how many checks wait on it; «نفّذ…» opens the action's own
  // preview (what runs, which host, how much, what is written where, whether install scripts run) and only its
  // confirmation runs it — one action at a time, no «نفّذ الكل». States are neutral tags (16.3). Readiness is
  // recomputed by the engine after each action, from the tool itself (9.4 point 4).
  import type { SetupAction as WireAction } from '@ayar/protocol';
  import SheetSetupPanel from '../../components/SheetSetupPanel.svelte';
  import SheetSetupPreview from '../../components/SheetSetupPreview.svelte';
  import { useLocale } from '../../lib/locale.ts';
  import type { SetupAction, SetupPreviewData } from '../../lib/sheets.ts';
  import { attempt, on } from '../../app/client.ts';
  import { reasonText } from '../../app/format.ts';
  import { argvText } from '../../app/specs.ts';

  interface Props {
    projectId: string;
    open: boolean;
    onclose: () => void;
    /** After an action finished: the caller re-reads its plan or readiness. */
    onchanged?: () => void;
  }
  let { projectId, open, onclose, onchanged }: Props = $props();
  const { t, lang } = useLocale();

  let actions = $state<WireAction[]>([]);
  let running = $state<Record<string, boolean>>({});
  let previewing = $state<{ action: WireAction; token: string } | null>(null);

  async function load() {
    const r = await attempt('readiness.evaluate', { projectId, probe: true });
    if (r.ok) actions = r.result.actions;
  }

  $effect(() => {
    if (!open) return;
    void load();
    return on('setup.progress', (m) => {
      if (!actions.some((a) => a.id === m.payload.actionId)) return;
      running[m.payload.actionId] = !['done', 'failed', 'rejected'].includes(m.payload.phase);
    });
  });

  const view = $derived<SetupAction[]>(
    actions.map((a) => ({
      id: a.id,
      title: reasonText(t, lang, a.title),
      missing: a.target.tool ?? a.target.component ?? a.target.ecosystem ?? '',
      waiting: a.instances.length,
      state: running[a.id] || a.state === 'running' ? 'running' : a.state === 'done' ? 'completed' : a.state === 'failed' || a.state === 'rejected' ? 'stopped-with-error' : 'queued',
      writesToProject: a.preview.writes.some((w) => w.location === 'project'),
      canApply: a.state !== 'done' && !running[a.id],
    })),
  );

  async function preview(id: string) {
    const r = await attempt('setup.preview', { actionId: id });
    if (!r.ok) return;
    previewing = { action: r.result.preview as unknown as WireAction, token: r.result.confirmationToken };
  }

  const previewData = $derived.by<SetupPreviewData | null>(() => {
    const a = previewing?.action;
    if (!a) return null;
    const write = a.preview.writes.find((w) => w.location === 'project');
    return {
      action: reasonText(t, lang, a.title),
      command: a.preview.command ? argvText(a.preview.command) : '',
      runsCode: a.preview.runsScripts === true,
      ...(write ? { writePath: write.path } : {}),
      ...(a.preview.network ? { networkDestination: a.preview.network.host } : {}),
      sizeMb: a.preview.sizeBytes ? Math.round((a.preview.sizeBytes / 1_000_000) * 10) / 10 : 0,
    };
  });

  async function apply() {
    const p = previewing;
    if (!p) return;
    previewing = null;
    running[p.action.id] = true;
    // The token is bound to exactly the preview shown (C-04: setup.execute refuses without it).
    await attempt('setup.execute', { actionId: p.action.id, confirmationToken: p.token });
    running[p.action.id] = false;
    await load();
    onchanged?.();
  }
</script>

<SheetSetupPanel open={open && !previewing} actions={view} oncancel={onclose} onpreview={(id) => void preview(id)} onapply={(id) => void preview(id)} />
{#if previewData}
  <SheetSetupPreview open data={previewData} oncancel={() => (previewing = null)} onapply={() => void apply()} oncopy={(text) => void navigator.clipboard?.writeText(text)} />
{/if}
