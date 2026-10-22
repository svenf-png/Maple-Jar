import { describe, expect, it } from 'vitest';
import { pickConflict } from './pick-conflict';

describe('pickConflict', () => {
  it('ohne Konflikte: null', () => {
    expect(pickConflict([])).toBeNull();
  });

  it('nimmt den ersten nach id und zählt nur bearbeitbare Entitäten', () => {
    expect(
      pickConflict([
        { id: 'goal:g2', entity: 'goal', rowId: 'g2' },
        { id: 'entry:e1', entity: 'entry', rowId: 'e1' },
      ]),
    ).toEqual({ entity: 'entry', rowId: 'e1', count: 2 });
  });

  it('Kategorien nutzen Last-Write-Wins und zählen nicht', () => {
    expect(pickConflict([{ id: 'category:c1', entity: 'category', rowId: 'c1' }])).toBeNull();
  });
});
