// The app's state (C-03): the page shown (13.1), the UI language and theme (settings), where the window buttons are
// (D-54), the projects, the engine's health, the live runs, and what the frame shows for the current page (its
// primary action, its inspector, its search). Screens read and set it; the engine stays the source of truth.
import { getContext, setContext, type Snippet } from 'svelte';
import { createTranslator, resolveLanguage, type Lang, type Translate } from '@ayar/i18n';
import type { EngineHealth, PendingConfirmation, Project, ProtectedLocation } from '@ayar/protocol';
import type { ToastMessage, WindowControls } from '../lib/shell.ts';
import { attempt, on } from './client.ts';
import { RunTracker } from './runs.svelte.ts';

/** The pages of DEV-11 (13.1): the project list, adding and discovery, and one project's journey. */
export type Route =
  | { name: 'projects' }
  | {
      name: 'discovery';
      projectId: string | null;
      discoveryId: string | null;
      /** A broad folder waiting for «تابِع» (13.3). */
      pending: PendingConfirmation | null;
      /** project.add failed before any discovery (an error code). */
      failure?: string | null;
      /** A dropped folder in a protected location: the explanation before macOS asks (FR-59). */
      permission?: { selectionToken: string; location: ProtectedLocation; display: string } | null;
    }
  | { name: 'profile'; projectId: string }
  | { name: 'overview'; projectId: string }
  /** «الفحص الكامل»: the plan, or a run's monitor while it runs and its results after (13.3, three modes). */
  | { name: 'scan'; projectId: string; runId: string | null };

export interface PrimaryAction {
  label: string;
  onclick: () => void;
  disabled?: boolean;
}

export type ThemeSetting = 'system' | 'light' | 'dark';

const KEY = Symbol('ayar.app');

export class AppState {
  lang = $state<Lang>('ar');
  languageSetting = $state<'system' | Lang>('system');
  themeSetting = $state<ThemeSetting>('system');
  controls = $state<WindowControls>('right');
  ready = $state(false);

  route = $state<Route>({ name: 'projects' });
  projects = $state<Project[]>([]);
  projectsLoaded = $state(false);
  health = $state<EngineHealth | null>(null);
  readonly runs = new RunTracker();

  /** What the current page puts in the frame. */
  primary = $state<PrimaryAction | null>(null);
  inspector = $state<Snippet | null>(null);
  inspectorOpen = $state(true);
  search = $state('');
  toast = $state<ToastMessage | null>(null);
  /** A polite announcement for screen readers (13.6): the run summary at most every 10 s, and the end. */
  announcement = $state('');
  /** The cancel confirmation (13.4 «ألغِ التشغيل»), opened from the run bar, the monitor or ⌘. */
  confirmCancel = $state(false);

  #toastTimer: ReturnType<typeof setTimeout> | null = null;
  #unsubscribe: (() => void)[] = [];

  async init(): Promise<void> {
    this.runs.start();
    this.#unsubscribe.push(
      on('engine.health', (m) => {
        const was = this.health?.state;
        this.health = m.payload;
        // A restarted engine starts a new session: re-read what the pages show.
        if (m.payload.state === 'ready' && was && was !== 'ready') void this.refreshProjects();
      }),
      on('bridge.resync', () => void this.refreshProjects()),
      on('discovery.done', () => void this.refreshProjects()),
    );
    const [layout, health, settings] = await Promise.all([attempt('window.layout', {}), attempt('engine.status', {}), attempt('settings.get', { keys: ['ui.language', 'ui.theme'] })]);
    if (layout.ok) this.controls = layout.result.controls;
    if (health.ok) this.health = health.result;
    if (settings.ok) {
      this.languageSetting = settings.result.values['ui.language'] ?? 'system';
      this.themeSetting = settings.result.values['ui.theme'] ?? 'system';
    }
    this.lang = resolveLanguage(this.languageSetting, navigator.languages);
    this.applyTheme();
    await this.refreshProjects();
    this.ready = true;
  }

  /** Cancels the active run after its confirmation; the engine's run.state says when it is cancelling. */
  async cancelActiveRun(): Promise<void> {
    this.confirmCancel = false;
    const active = this.runs.active;
    if (active) await attempt('run.cancel', { target: { kind: 'run', runId: active.runId } });
  }

  destroy(): void {
    for (const u of this.#unsubscribe.splice(0)) u();
    this.runs.stop();
  }

  applyTheme(): void {
    const root = document.documentElement;
    if (this.themeSetting === 'system') delete root.dataset.theme;
    else root.dataset.theme = this.themeSetting;
    root.lang = this.lang;
    document.title = createTranslator(this.lang)('common.appName');
    root.dir = this.lang === 'ar' ? 'rtl' : 'ltr';
  }

  /** Reads the projects, and the runs of each that are still active (the run bar shows one, D-33). */
  async refreshProjects(): Promise<void> {
    const r = await attempt('project.list', {});
    if (!r.ok) return;
    this.projects = r.result.projects;
    this.projectsLoaded = true;
    await Promise.all(
      this.projects.map(async (p) => {
        const list = await attempt('runs.list', { projectId: p.id });
        if (!list.ok) return;
        for (const run of list.result.runs) {
          if (run.state === 'queued' || run.state === 'running' || run.state === 'cancelling') {
            this.runs.remember(run);
            if (!this.runs.checks[run.runId]) await this.runs.load(run.runId);
          }
        }
      }),
    );
  }

  project(id: string | null | undefined): Project | undefined {
    return id ? this.projects.find((p) => p.id === id) : undefined;
  }

  /** The project of the current page, if it is a project's page. */
  get currentProject(): Project | undefined {
    const r = this.route;
    return 'projectId' in r ? this.project(r.projectId) : undefined;
  }

  navigate(route: Route): void {
    this.route = route;
    this.search = '';
  }

  showToast(toast: ToastMessage): void {
    this.toast = toast;
    if (this.#toastTimer) clearTimeout(this.#toastTimer);
    this.#toastTimer = setTimeout(() => (this.toast = null), 4000);
  }

  /** The messages in the app's language, for actions outside a component (an announcement). */
  get t(): Translate {
    return createTranslator(this.lang);
  }

  announce(text: string): void {
    // A changed string is announced again by the live region even when it repeats.
    this.announcement = this.announcement === text ? `${text}​` : text;
  }
}

export function provideApp(state: AppState): AppState {
  setContext(KEY, state);
  return state;
}

export function useApp(): AppState {
  const app = getContext<AppState | undefined>(KEY);
  if (!app) throw new Error('useApp() outside the app');
  return app;
}
