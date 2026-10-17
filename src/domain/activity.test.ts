import { describe, expect, it } from 'vitest';
import { formatHlc } from '../data/events/hlc';
import { type ActivityEvent, buildActivity, entryHistory, isNewActivity } from './activity';
import { ME, OTHER } from './test-data';

const T0 = Date.UTC(2027, 1, 18, 12, 0, 0);
const hlc = (sec: number) =>
  formatHlc({ ms: T0 + sec * 1000, counter: 0 }, '00000000-0000-4000-8000-0000000000d1');
let n = 0;
const ev = (over: Partial<ActivityEvent> & { sec: number }): ActivityEvent => ({
  id: `ev-${++n}`,
  hlc: hlc(over.sec),
  author: ME,
  entity: 'entry',
  rowId: 'row-1',
  op: 'update',
  ...over,
});

const created = ev({
  sec: 0,
  op: 'create',
  author: OTHER,
  data: { merchant: 'Supermarkt A', amountMinor: 8117, currency: 'CAD', note: '' },
});
const amount = ev({ sec: 10, data: { amountMinor: 8417 } });
const note = ev({ sec: 20, data: { note: 'Wocheneinkauf' } });
const rate = ev({ sec: 30, data: { fxRateMicro: 1_500_000, fxProvisional: false } });
const del = ev({ sec: 40, op: 'delete' });
const restore = ev({ sec: 50, op: 'restore' });

describe('buildActivity', () => {
  it('liefert neueste zuerst und erkennt Art und Änderungen', () => {
    const feed = buildActivity([created, amount, note, del, restore]);
    expect(feed.map((i) => i.kind)).toEqual([
      'restored',
      'deleted',
      'edited',
      'amountChanged',
      'added',
    ]);
    const changed = feed[3];
    expect(changed?.changes).toEqual([{ field: 'amountMinor', from: 8117, to: 8417 }]);
    expect(changed?.merchant).toBe('Supermarkt A');
    expect(changed?.amountMinor).toBe(8417);
    expect(feed[4]?.author).toBe(OTHER);
  });

  it('ist unabhängig von der Reihenfolge der Eingabe und ignoriert Duplikate', () => {
    const a = buildActivity([created, amount, note, del]);
    const b = buildActivity([del, note, amount, created, amount]);
    expect(b).toEqual(a);
  });

  it('Kurs nachziehen (Systemfelder) taucht nicht auf', () => {
    expect(buildActivity([created, rate]).map((i) => i.kind)).toEqual(['added']);
  });

  it('Änderung auf denselben Wert erzeugt keinen Eintrag', () => {
    const same = ev({ sec: 15, data: { amountMinor: 8117 } });
    expect(buildActivity([created, same]).map((i) => i.kind)).toEqual(['added']);
  });

  it('andere Entitäten werden ignoriert', () => {
    expect(
      buildActivity([ev({ sec: 1, entity: 'category', op: 'create', data: { name: 'x' } })]),
    ).toEqual([]);
  });
});

describe('entryHistory', () => {
  it('filtert auf einen Eintrag', () => {
    const other = ev({
      sec: 5,
      rowId: 'row-2',
      op: 'create',
      data: { merchant: 'Café B', amountMinor: 500, currency: 'CAD' },
    });
    expect(entryHistory([created, other, amount], 'row-1').map((i) => i.kind)).toEqual([
      'amountChanged',
      'added',
    ]);
  });
});

describe('isNewActivity', () => {
  const feed = buildActivity([created, amount]);
  it('neu = von der anderen Person und nach dem letzten Besuch', () => {
    const mine = feed.find((i) => i.author === ME);
    const theirs = feed.find((i) => i.author === OTHER);
    expect(mine && isNewActivity(mine, ME, null)).toBe(false);
    expect(theirs && isNewActivity(theirs, ME, null)).toBe(true);
    expect(theirs && isNewActivity(theirs, ME, hlc(5))).toBe(false);
    expect(theirs && isNewActivity(theirs, ME, hlc(-5))).toBe(true);
  });
});
