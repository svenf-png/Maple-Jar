import { useSyncExternalStore } from 'react';
import { de, type MessageKey } from './de';
import { en } from './en';

export type Lang = 'de' | 'en';
export type Locale = 'de-DE' | 'en-CA';

const KEY = 'maple-jar.lang';
const dictionaries: Record<Lang, Record<MessageKey, string>> = { de, en };
const listeners = new Set<() => void>();

export function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'de' || stored === 'en') return stored;
  } catch {
    // Speicher nicht verfügbar
  }
  const nav = typeof navigator === 'undefined' ? '' : (navigator.language ?? '');
  return nav.toLowerCase().startsWith('de') ? 'de' : 'en';
}

let current: Lang = detectLang();

export const getLang = (): Lang => current;
export const localeOf = (lang: Lang): Locale => (lang === 'de' ? 'de-DE' : 'en-CA');
export const getLocale = (): Locale => localeOf(current);

function syncHtmlLang(): void {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // ignorieren
  }
  syncHtmlLang();
  for (const l of listeners) l();
}

export function initLang(): void {
  current = detectLang();
  syncHtmlLang();
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = dictionaries[current][key] ?? de[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = params[name];
    return v === undefined ? m : String(v);
  });
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Lässt Komponenten bei Sprachwechsel neu rendern. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}
