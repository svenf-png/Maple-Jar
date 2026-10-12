import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import { fetchRate, parseRateMicro } from './frankfurter';

beforeEach(async () => {
  await db.meta.clear();
  vi.unstubAllGlobals();
});

const stub = (body: unknown, status = 200) => {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
};

describe('parseRateMicro', () => {
  it.each([
    ['1.61', 1_610_000n],
    ['1.4523', 1_452_300n],
    ['1', 1_000_000n],
    ['1.0000005', 1_000_001n],
    ['1.0000004', 1_000_000n],
    [1.61, 1_610_000n],
  ])('%s → %s', (input, expected) => {
    expect(parseRateMicro(input)).toBe(expected);
  });

  it('lehnt ungültige Eingaben ab', () => {
    expect(() => parseRateMicro('abc')).toThrow();
    expect(() => parseRateMicro('-1.2')).toThrow();
  });
});

describe('fetchRate', () => {
  it('ruft die v2-Rate-URL auf und liefert Mikro-Einheiten', async () => {
    const fn = stub({ date: '2027-02-18', base: 'EUR', quote: 'CAD', rate: 1.61 });
    const r = await fetchRate('2027-02-18', 'ECB');
    expect(fn).toHaveBeenCalledWith(
      'https://api.frankfurter.dev/v2/rate/EUR/CAD?date=2027-02-18&providers=ECB',
    );
    expect(r).toEqual({ rateMicro: 1_610_000n, date: '2027-02-18', provider: 'ECB', stale: false });
  });

  it('übernimmt das gelieferte Datum (Wochenende → letzter Handelstag)', async () => {
    stub({ date: '2027-02-19', base: 'EUR', quote: 'CAD', rate: 1.5 });
    expect((await fetchRate('2027-02-21', 'BOC')).date).toBe('2027-02-19');
  });

  it('cached pro Datum und Anbieter', async () => {
    const fn = stub({ date: '2027-02-18', base: 'EUR', quote: 'CAD', rate: 1.61 });
    await fetchRate('2027-02-18', 'ECB');
    await fetchRate('2027-02-18', 'ECB');
    expect(fn).toHaveBeenCalledTimes(1);
    await fetchRate('2027-02-18', 'BOC');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('liefert offline den letzten bekannten Kurs als veraltet', async () => {
    stub({ date: '2027-02-18', base: 'EUR', quote: 'CAD', rate: 1.61 });
    await fetchRate('2027-02-18', 'ECB');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    const r = await fetchRate('2027-02-20', 'ECB');
    expect(r).toEqual({ rateMicro: 1_610_000n, date: '2027-02-18', provider: 'ECB', stale: true });
  });

  it('wirft, wenn offline und nie ein Kurs bekannt war', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    await expect(fetchRate('2027-02-20', 'ECB')).rejects.toBeDefined();
  });

  it('behandelt HTTP-Fehler wie Offline', async () => {
    stub({}, 500);
    await expect(fetchRate('2027-02-20', 'ECB')).rejects.toBeDefined();
  });
});
