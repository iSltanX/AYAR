// The UI language as a Svelte context (C-24): components read their own fixed strings through it, and set
// nothing about direction themselves: dir comes from the nearest [dir] (the convention of DES-3, README §2).
import { getContext, setContext } from 'svelte';
import { createTranslator, direction, type Lang, type Translate } from '@ayar/i18n';

export interface Locale {
  readonly lang: Lang;
  readonly dir: 'rtl' | 'ltr';
  readonly t: Translate;
}

const KEY = Symbol('ayar.locale');
const cache = new Map<Lang, Locale>();

export function localeFor(lang: Lang): Locale {
  let locale = cache.get(lang);
  if (!locale) {
    locale = { lang, dir: direction(lang), t: createTranslator(lang) };
    cache.set(lang, locale);
  }
  return locale;
}

export function provideLocale(lang: Lang): Locale {
  const locale = localeFor(lang);
  setContext(KEY, locale);
  return locale;
}

export function useLocale(): Locale {
  const locale = getContext<Locale | undefined>(KEY);
  if (!locale) throw new Error('useLocale() outside a <Locale> provider');
  return locale;
}
