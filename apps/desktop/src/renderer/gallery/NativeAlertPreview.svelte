<script lang="ts">
  // Gallery-only picture of a native destructive alert (lib/native-alerts.ts; D-DEV3-15, D-DES3-06: the app shows
  // these through the main process as NSAlert, never as a sheet in the UI). Drawn like the Figma stand-in
  // `Native alert/Destructive confirmation` 116:9399: 260 wide, padding 16, gap 12, centred, bg/elevated with a
  // border/subtle edge, radius/sheet, shadow/overlay; a 48 px placeholder for the app icon macOS draws (bg/sunken,
  // border/strong, radius/card); the message in title/sub; the informative text in body/small text/secondary;
  // the buttons stacked full width, gap 8: «ألغِ» (the default, drawn ink) then the verb (outlined, no icon).
  // Presentational: the buttons are inert pictures (role=img on the whole alert).
  import { useLocale } from '../lib/locale.ts';
  import { nativeAlertTexts, type NativeAlertModel } from '../lib/native-alerts.ts';

  interface Props {
    model: NativeAlertModel;
  }
  let { model }: Props = $props();
  const { t } = useLocale();
  const texts = $derived(nativeAlertTexts(model, t));
</script>

<div class="alert" role="img" aria-label="{texts.message} {texts.detail}">
  <span class="app-icon"></span>
  <p class="message">{texts.message}</p>
  <p class="informative">{texts.detail}</p>
  <div class="buttons">
    <span class="button default">{texts.buttons[0]}</span>
    <span class="button">{texts.buttons[1]}</span>
  </div>
</div>

<style>
  .alert {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-12);
    inline-size: 260px;
    padding: var(--space-16);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sheet);
    background: var(--bg-elevated);
    box-shadow: var(--shadow-overlay);
    text-align: center;
  }
  .app-icon {
    inline-size: 48px;
    block-size: 48px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-card);
    background: var(--bg-sunken);
  }
  .message {
    margin: 0;
    max-inline-size: 212px;
    font: var(--type-title-sub);
    color: var(--text-primary);
  }
  .informative {
    margin: 0;
    max-inline-size: 212px;
    font: var(--type-body-small);
    color: var(--text-secondary);
  }
  .buttons {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    align-self: stretch;
  }
  .button {
    display: flex;
    align-items: center;
    justify-content: center;
    block-size: 28px;
    padding: 0 var(--space-12);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-control);
    background: var(--bg-surface);
    color: var(--text-primary);
    font: var(--type-button);
  }
  .button.default {
    border-color: transparent;
    background: var(--text-primary);
    color: var(--text-inverse);
  }
</style>
