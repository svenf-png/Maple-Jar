import { afterEach, describe, expect, it } from 'vitest';
import { focusHeading, shouldMoveFocus } from './route-focus';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('shouldMoveFocus', () => {
  it('bewegt den Fokus nicht beim ersten Laden', () => {
    expect(shouldMoveFocus(null, '/')).toBe(false);
  });

  it('bewegt den Fokus bei einem Pfadwechsel', () => {
    expect(shouldMoveFocus('/', '/verlauf')).toBe(true);
  });

  it('bewegt den Fokus nicht, wenn der Pfad gleich bleibt', () => {
    expect(shouldMoveFocus('/verlauf', '/verlauf')).toBe(false);
  });
});

describe('focusHeading', () => {
  it('fokussiert die erste h1 in main und setzt tabindex -1', () => {
    document.body.innerHTML = '<main><h1>Titel</h1></main>';
    const h1 = document.querySelector('h1') as HTMLElement;
    expect(focusHeading()).toBe(true);
    expect(document.activeElement).toBe(h1);
    expect(h1.getAttribute('tabindex')).toBe('-1');
  });

  it('fällt ohne h1 auf main zurück', () => {
    document.body.innerHTML = '<main><p>Text</p></main>';
    const main = document.querySelector('main') as HTMLElement;
    expect(focusHeading()).toBe(true);
    expect(document.activeElement).toBe(main);
  });

  it('gibt false zurück, wenn weder h1 noch main vorhanden sind', () => {
    document.body.innerHTML = '<div><p>Text</p></div>';
    expect(focusHeading()).toBe(false);
  });
});
