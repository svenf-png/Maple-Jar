import { afterEach, describe, expect, it } from 'vitest';
import { focusHeading, focusUnclaimed, shouldMoveFocus } from './route-focus';

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

describe('focusUnclaimed', () => {
  const body = document.body;
  const link = document.createElement('a');
  const input = document.createElement('input');
  const buttonInDialog = document.createElement('button');

  it('ist wahr, wenn der Fokus auf body blieb', () => {
    expect(focusUnclaimed(body, body, body)).toBe(true);
  });

  it('ist wahr, wenn der Auslöser den Fokus behalten hat', () => {
    expect(focusUnclaimed(link, link, body)).toBe(true);
  });

  it('ist wahr, wenn kein Element fokussiert ist', () => {
    expect(focusUnclaimed(link, null, body)).toBe(true);
  });

  it('ist falsch, wenn nach dem Wechsel ein Feld fokussiert wurde', () => {
    expect(focusUnclaimed(body, input, body)).toBe(false);
  });

  it('ist falsch, wenn der Fokus in einen Dialog gewandert ist', () => {
    expect(focusUnclaimed(link, buttonInDialog, body)).toBe(false);
  });
});
