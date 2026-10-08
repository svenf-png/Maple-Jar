export type ThemePref = 'auto' | 'light' | 'dark';

const KEY = 'maple-jar.theme';
const COLORS = { light: '#F6F2EC', dark: '#12100E' } as const;

export function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch {
    // Speicher nicht verfügbar (z. B. privates Fenster)
  }
  return 'auto';
}

function updateThemeColor(pref: ThemePref): void {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (pref === 'auto') {
    metas.forEach((m, i) => {
      m.setAttribute('content', i === 0 ? COLORS.light : COLORS.dark);
      m.setAttribute(
        'media',
        i === 0 ? '(prefers-color-scheme: light)' : '(prefers-color-scheme: dark)',
      );
    });
    return;
  }
  metas.forEach((m) => {
    m.setAttribute('content', COLORS[pref]);
    m.removeAttribute('media');
  });
}

export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  updateThemeColor(pref);
}

export function setTheme(pref: ThemePref): void {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    // ignorieren
  }
  applyTheme(pref);
}

export function initTheme(): void {
  applyTheme(readTheme());
}
