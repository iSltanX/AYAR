// D-54 (E-23): where macOS draws the window buttons. Pure, so it can be tested without Electron.

/** Languages whose script runs right to left: macOS puts the window buttons on the right for them (D-54). */
const RTL_LANGUAGES = new Set(['ar', 'he', 'fa', 'ur']);

/**
 * The first language of the system's GLOBAL preferences (the output of `defaults read -g AppleLanguages`), never
 * the app's own resolved language (app.getLocale and friends follow a per-app override, E-23).
 */
export function controlsFromAppleLanguages(output: string): 'left' | 'right' {
  const first = output.replace(/[\s()"]/g, '').split(',').find(Boolean) ?? '';
  return RTL_LANGUAGES.has(first.toLowerCase().split(/[-_]/)[0] ?? '') ? 'right' : 'left';
}
