import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, normalizeSettings, saveSettings } from './settings';

describe('normalizeSettings', () => {
  it('يعيد الافتراضيات لقيمة غير كائن', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('x')).toEqual(DEFAULT_SETTINGS);
  });
  it('يقبل القيمة المنطقية', () => {
    expect(normalizeSettings({ countSpaces: true })).toEqual({ countSpaces: true });
  });
  it('يتجاهل النوع الخاطئ', () => {
    expect(normalizeSettings({ countSpaces: 'نعم' })).toEqual(DEFAULT_SETTINGS);
  });
});

describe('التخزين', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('يقرأ الإعدادات المخزنة', async () => {
    vi.stubGlobal('chrome', { storage: { local: { get: vi.fn().mockResolvedValue({ settings: { countSpaces: true } }) } } });
    expect(await loadSettings()).toEqual({ countSpaces: true });
  });

  it('يحفظ الإعدادات في التخزين المحلي', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', { storage: { local: { set } } });
    await saveSettings({ countSpaces: true });
    expect(set).toHaveBeenCalledWith({ settings: { countSpaces: true } });
  });
});
