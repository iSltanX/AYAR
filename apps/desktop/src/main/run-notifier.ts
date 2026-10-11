// 13.3 «الإشعارات» (DEV-12, the setting run.notify): a macOS notification when a run ends while AYAR's window is not
// in front. Once per run, on its passage from active to ended; its title is the run's kind with its verdict, or that
// it was cancelled. The texts are the system language's, like the menus. It imports no electron: `show` is injected.
import { createTranslator, type Lang, type MessageKey } from '@ayar/i18n';

export interface RunStateLike {
  runId: string;
  state: string;
  kind: string;
  verdict: 'pure' | 'incomplete' | 'blocked' | null;
  cancelReason: string | null;
}

export interface RunNotifierOptions {
  enabled: () => Promise<boolean>;
  /** AYAR's window is in front: the user sees the run end already. */
  focused: () => boolean;
  show: (title: string, body: string) => void;
  lang: () => Lang;
}

const ACTIVE = new Set(['queued', 'running', 'cancelling']);
const ENDED = new Set(['finished', 'interrupted']);
const KINDS: Record<string, MessageKey> = {
  full: 'app.runKind.full',
  check: 'app.runKind.check',
  group: 'app.runKind.group',
  rerun_failed: 'app.runKind.rerunFailed',
  rerun_incomplete: 'app.runKind.rerunIncomplete',
  advisor: 'app.runKind.advisor',
  continue_round: 'app.runKind.continueRound',
};

export class RunNotifier {
  readonly #o: RunNotifierOptions;
  readonly #seen = new Map<string, string>();

  constructor(o: RunNotifierOptions) {
    this.#o = o;
  }

  onRunState(run: RunStateLike): void {
    const before = this.#seen.get(run.runId);
    this.#seen.set(run.runId, run.state);
    if (this.#seen.size > 200) this.#seen.delete(this.#seen.keys().next().value!);
    if (!before || !ACTIVE.has(before) || !ENDED.has(run.state) || this.#o.focused()) return;
    void this.#o.enabled().then((on) => {
      if (!on) return;
      const t = createTranslator(this.#o.lang());
      const kind = KINDS[run.kind] ? t(KINDS[run.kind]!) : t('app.runKind.check');
      const title = run.cancelReason
        ? t('menu.notify.cancelled', { kind })
        : run.verdict
          ? t('menu.notify.verdict', { kind, verdict: t(`status.verdict.${run.verdict}`) })
          : t('menu.notify.finished', { kind });
      this.#o.show(title, t('menu.notify.body'));
    });
  }

  reset(): void {
    this.#seen.clear();
  }
}
