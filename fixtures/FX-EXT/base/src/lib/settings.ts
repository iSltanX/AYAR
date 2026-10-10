export interface Settings {
  countSpaces: boolean;
}

export const DEFAULT_SETTINGS: Settings = { countSpaces: false };

/** يدمج ما قُرئ من التخزين مع الافتراضيات، ويتجاهل القيم من نوع غير متوقع. */
export function normalizeSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS };
  const value = (raw as Record<string, unknown>).countSpaces;
  return { countSpaces: typeof value === 'boolean' ? value : DEFAULT_SETTINGS.countSpaces };
}

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get('settings');
  return normalizeSettings(stored.settings);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings });
}
