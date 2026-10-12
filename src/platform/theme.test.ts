import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, readTheme, setTheme } from './theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.head.innerHTML =
    '<meta name="theme-color" content="#F6F2EC" media="(prefers-color-scheme: light)">' +
    '<meta name="theme-color" content="#12100E" media="(prefers-color-scheme: dark)">';
});

describe('Theme', () => {
  it('dark setzt data-theme und theme-color', () => {
    setTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    expect(metas[0]?.getAttribute('content')).toBe('#12100E');
    expect(readTheme()).toBe('dark');
  });

  it('light setzt data-theme=light', () => {
    setTheme('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('auto entfernt data-theme und stellt die Medien-Metas wieder her', () => {
    setTheme('dark');
    setTheme('auto');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    expect(metas[0]?.getAttribute('media')).toBe('(prefers-color-scheme: light)');
    expect(metas[1]?.getAttribute('content')).toBe('#12100E');
  });

  it('übersteht fehlenden localStorage', () => {
    const orig = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(readTheme()).toBe('auto');
      expect(() => applyTheme('dark')).not.toThrow();
    } finally {
      Storage.prototype.getItem = orig;
    }
  });
});
