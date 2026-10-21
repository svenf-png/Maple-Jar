import { describe, expect, it } from 'vitest';
import { initials } from './initials';

describe('initials', () => {
  it('zeigt einen Buchstaben, wenn die Initialen verschieden sind', () => {
    expect(initials('Person A', ['Person A', 'Anna'])).toBe('P');
    expect(initials('Anna', ['Person A', 'Anna'])).toBe('A');
  });

  it('zeigt zwei Buchstaben bei gleicher Anfangsinitiale', () => {
    const names = ['Sven', 'Swetlana'];
    expect(initials('Sven', names)).toBe('SV');
    expect(initials('Swetlana', names)).toBe('SW');
  });

  it('ignoriert Groß-/Kleinschreibung beim Vergleich', () => {
    expect(initials('anna', ['anna', 'Anja'])).toBe('AN');
  });

  it('kommt mit leerem Namen, Leerraum und kurzen Namen klar', () => {
    expect(initials('', ['', 'A'])).toBe('?');
    expect(initials('  ben ', ['  ben ', 'Bo'])).toBe('BE');
    expect(initials('B', ['B', 'Bo'])).toBe('B');
  });

  it('zählt Zeichen statt UTF-16-Einheiten', () => {
    expect(initials('😀x', ['😀x', 'y'])).toBe('😀');
  });

  it('zwei Mitglieder gleichen Namens bleiben bei einer Initiale', () => {
    expect(initials('Alex', ['Alex', 'Alex'])).toBe('A');
  });
});
