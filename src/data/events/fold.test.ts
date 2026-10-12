import { describe, expect, it } from 'vitest';
import { foldAll, foldRow, headsOf } from './fold';
import type { AppEvent } from './schema';
import { CAT_1, categoryData, DEV_B, entryData, mk, ROW_1, USER_A, USER_B } from './test-helpers';

const ctx = { hasCategory: (id: string) => id === CAT_1, hasMember: () => true };
const idOf = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, '0')}`;

const E0 = idOf('e0');
const fold = (events: AppEvent[]) => foldRow('entry', events, ctx);

describe('foldRow: Feld-Merge und Konflikte', () => {
  const c = mk({ id: E0, op: 'create', data: entryData(), at: 0 });

  it('wendet sequentielle Änderungen an, der Letzte gewinnt, kein Konflikt', () => {
    const u1 = mk({ id: idOf('1'), data: { note: 'eins' }, base: [E0], at: 10 });
    const u2 = mk({
      id: idOf('2'),
      data: { note: 'zwei' },
      base: [idOf('1')],
      at: 20,
      device: DEV_B,
    });
    const { row } = fold([c, u1, u2]);
    expect(row?.fields.note).toBe('zwei');
    expect(row?.conflict).toBeNull();
  });

  it('merged gleichzeitige Änderungen verschiedener Felder ohne Konflikt', () => {
    const u1 = mk({ id: idOf('1'), data: { amountMinor: 9000 }, base: [E0], at: 10 });
    const u2 = mk({ id: idOf('2'), data: { note: 'Notiz' }, base: [E0], at: 11, device: DEV_B });
    const { row } = fold([c, u1, u2]);
    expect(row?.fields.amountMinor).toBe(9000);
    expect(row?.fields.note).toBe('Notiz');
    expect(row?.conflict).toBeNull();
  });

  it('erkennt gleichzeitige Änderungen desselben Feldes als Konflikt, Wert = spätere HLC', () => {
    const u1 = mk({ id: idOf('1'), data: { amountMinor: 9000 }, base: [E0], at: 10 });
    const u2 = mk({
      id: idOf('2'),
      data: { amountMinor: 9500 },
      base: [E0],
      at: 11,
      device: DEV_B,
    });
    const { row } = fold([c, u1, u2]);
    expect(row?.fields.amountMinor).toBe(9500);
    expect(row?.conflict?.kind).toBe('fields');
    expect(row?.conflict?.fields[0]?.field).toBe('amountMinor');
    expect(row?.conflict?.fields[0]?.candidates.map((x) => x.value).sort()).toEqual([9000, 9500]);
  });

  it('gleiche Werte gleichzeitig sind kein Konflikt', () => {
    const u1 = mk({ id: idOf('1'), data: { note: 'x' }, base: [E0], at: 10 });
    const u2 = mk({ id: idOf('2'), data: { note: 'x' }, base: [E0], at: 11, device: DEV_B });
    expect(fold([c, u1, u2]).row?.conflict).toBeNull();
  });

  it('eine Auflösung mit beiden Köpfen in base beendet den Konflikt', () => {
    const u1 = mk({ id: idOf('1'), data: { amountMinor: 9000 }, base: [E0], at: 10 });
    const u2 = mk({
      id: idOf('2'),
      data: { amountMinor: 9500 },
      base: [E0],
      at: 11,
      device: DEV_B,
    });
    const res = mk({
      id: idOf('3'),
      data: { amountMinor: 9000 },
      base: headsOf([c, u1, u2]),
      at: 30,
    });
    const { row } = fold([c, u1, u2, res]);
    expect(row?.conflict).toBeNull();
    expect(row?.fields.amountMinor).toBe(9000);
  });

  it('headsOf liefert die Köpfe', () => {
    const u1 = mk({ id: idOf('1'), data: { note: 'a' }, base: [E0], at: 10 });
    const u2 = mk({ id: idOf('2'), data: { note: 'b' }, base: [E0], at: 11, device: DEV_B });
    expect(headsOf([c])).toEqual([E0]);
    expect(headsOf([c, u1, u2]).sort()).toEqual([idOf('1'), idOf('2')]);
    expect(headsOf([c, u1])).toEqual([idOf('1')]);
  });

  it('transitives Wissen: base auf einen späteren Kopf deckt frühere ab', () => {
    const u1 = mk({ id: idOf('1'), data: { note: 'a' }, base: [E0], at: 10 });
    const u2 = mk({ id: idOf('2'), data: { note: 'b' }, base: [idOf('1')], at: 11, device: DEV_B });
    const u3 = mk({ id: idOf('3'), data: { note: 'c' }, base: [idOf('2')], at: 12 });
    expect(fold([c, u1, u2, u3]).row?.conflict).toBeNull();
  });
});

describe('foldRow: Löschen gegen Bearbeiten', () => {
  const c = mk({ id: E0, op: 'create', data: entryData(), at: 0 });

  it('Löschen nach bekannter Änderung: gelöscht, kein Konflikt', () => {
    const u = mk({ id: idOf('1'), data: { note: 'a' }, base: [E0], at: 10 });
    const d = mk({ id: idOf('2'), op: 'delete', base: [idOf('1')], at: 20, device: DEV_B });
    const { row } = fold([c, u, d]);
    expect(row?.deleted).toBe(true);
    expect(row?.conflict).toBeNull();
  });

  it('gleichzeitiges Löschen und Bearbeiten ist ein Konflikt', () => {
    const u = mk({ id: idOf('1'), data: { note: 'a' }, base: [E0], at: 10 });
    const d = mk({ id: idOf('2'), op: 'delete', base: [E0], at: 11, device: DEV_B });
    const { row } = fold([c, u, d]);
    expect(row?.conflict?.kind).toBe('deleteVsEdit');
    expect(row?.deleted).toBe(true);
  });

  it('Wiederherstellen mit beiden Köpfen löst auf', () => {
    const u = mk({ id: idOf('1'), data: { note: 'a' }, base: [E0], at: 10 });
    const d = mk({ id: idOf('2'), op: 'delete', base: [E0], at: 11, device: DEV_B });
    const r = mk({ id: idOf('3'), op: 'restore', base: headsOf([c, u, d]), at: 30 });
    const { row } = fold([c, u, d, r]);
    expect(row?.conflict).toBeNull();
    expect(row?.deleted).toBe(false);
  });

  it('Kategorien (Last-Write-Wins) haben keine Konflikte', () => {
    const cc = mk({
      id: E0,
      entity: 'category',
      rowId: CAT_1,
      op: 'create',
      data: categoryData(),
      at: 0,
    });
    const u1 = mk({
      id: idOf('1'),
      entity: 'category',
      rowId: CAT_1,
      data: { name: 'Eins' },
      base: [E0],
      at: 10,
    });
    const u2 = mk({
      id: idOf('2'),
      entity: 'category',
      rowId: CAT_1,
      data: { name: 'Zwei' },
      base: [E0],
      at: 11,
      device: DEV_B,
    });
    const { row } = foldRow('category', [cc, u1, u2], ctx);
    expect(row?.fields.name).toBe('Zwei');
    expect(row?.conflict).toBeNull();
  });
});

describe('foldRow: Parken', () => {
  it('Eintrag mit fehlender Kategorie wartet', () => {
    const c = mk({ id: E0, op: 'create', data: entryData({ categoryId: idOf('99') }), at: 0 });
    const r = fold([c]);
    expect(r.row).toBeNull();
    expect(r.waiting).toEqual([E0]);
  });

  it('Update ohne bekanntes create wartet', () => {
    const u = mk({ id: idOf('1'), data: { note: 'a' }, base: [E0], at: 10 });
    const r = fold([u]);
    expect(r.row).toBeNull();
    expect(r.waiting).toEqual([idOf('1')]);
  });

  it('Update mit unbekanntem Mitglied wartet, der Rest wird angewendet', () => {
    const noMember = { hasCategory: () => true, hasMember: (id: string) => id === USER_A };
    const c = mk({ id: E0, op: 'create', data: entryData(), at: 0 });
    const u = mk({ id: idOf('1'), data: { paidBy: USER_B }, base: [E0], at: 10 });
    const r = foldRow('entry', [c, u], noMember);
    expect(r.row?.fields.paidBy).toBe(USER_A);
    expect(r.waiting).toEqual([idOf('1')]);
  });

  it('doppelte Ereignisse zählen einmal', () => {
    const u = mk({ id: idOf('1'), data: { note: 'a' }, base: [E0], at: 10 });
    const c = mk({ id: E0, op: 'create', data: entryData(), at: 0 });
    expect(fold([c, u, u, c]).row).toEqual(fold([c, u]).row);
  });
});

// Kleiner deterministischer Zufallsgenerator (mulberry32)
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('foldAll: Reihenfolgeunabhängigkeit', () => {
  const ROW_2 = idOf('202');
  const events: AppEvent[] = [
    mk({
      id: idOf('a0'),
      entity: 'category',
      rowId: CAT_1,
      op: 'create',
      data: categoryData(),
      at: 0,
    }),
    mk({
      id: idOf('a1'),
      entity: 'category',
      rowId: CAT_1,
      data: { name: 'Neu' },
      base: [idOf('a0')],
      at: 5,
      device: DEV_B,
    }),
    mk({ id: idOf('b0'), rowId: ROW_1, op: 'create', data: entryData(), at: 10 }),
    mk({ id: idOf('b1'), rowId: ROW_1, data: { amountMinor: 1 }, base: [idOf('b0')], at: 20 }),
    mk({
      id: idOf('b2'),
      rowId: ROW_1,
      data: { amountMinor: 2 },
      base: [idOf('b0')],
      at: 21,
      device: DEV_B,
    }),
    mk({
      id: idOf('b3'),
      rowId: ROW_1,
      data: { note: 'n' },
      base: [idOf('b0')],
      at: 22,
      device: DEV_B,
    }),
    mk({
      id: idOf('c0'),
      rowId: ROW_2,
      op: 'create',
      data: entryData({ merchant: 'Café B' }),
      at: 11,
    }),
    mk({ id: idOf('c1'), rowId: ROW_2, op: 'delete', base: [idOf('c0')], at: 30 }),
    mk({
      id: idOf('c2'),
      rowId: ROW_2,
      data: { note: 'x' },
      base: [idOf('c0')],
      at: 31,
      device: DEV_B,
    }),
    mk({
      id: idOf('d0'),
      rowId: idOf('303'),
      op: 'create',
      data: entryData({ categoryId: idOf('404') }),
      at: 12,
    }),
    mk({ id: idOf('d1'), rowId: idOf('505'), data: { note: 'waise' }, at: 13 }),
  ];
  const members = new Set([USER_A, USER_B]);
  const reference = JSON.stringify(foldAll(events, members));

  it('liefert für 50 zufällige Reihenfolgen und Duplikate dasselbe Ergebnis', () => {
    const random = rng(42);
    for (let i = 0; i < 50; i++) {
      const shuffled = [...events, ...events.filter(() => random() < 0.3)];
      for (let j = shuffled.length - 1; j > 0; j--) {
        const k = Math.floor(random() * (j + 1));
        [shuffled[j], shuffled[k]] = [shuffled[k] as AppEvent, shuffled[j] as AppEvent];
      }
      expect(JSON.stringify(foldAll(shuffled, members))).toBe(reference);
    }
  });

  it('enthält Konflikte, Gelöschtes und wartende Ereignisse wie erwartet', () => {
    const r = foldAll(events, members);
    const e1 = r.rows.find((x) => x.id === ROW_1);
    expect(e1?.conflict?.kind).toBe('fields');
    expect(e1?.fields.note).toBe('n');
    expect(r.rows.find((x) => x.id === ROW_2)?.conflict?.kind).toBe('deleteVsEdit');
    expect(r.waiting).toEqual([idOf('d0'), idOf('d1')].sort());
  });
});
