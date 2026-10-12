import { describe, expect, it } from 'vitest';
import { chooseRate, needsRateCatchUp } from './fx';

describe('chooseRate', () => {
  it('CAD hat immer Kurs 1 und ist nie vorläufig', () => {
    expect(chooseRate('CAD', '2027-01-05', null)).toEqual({
      rateMicro: 1_000_000,
      rateDate: '2027-01-05',
      provisional: false,
    });
  });

  it('EUR mit Tageskurs: endgültig, Datum des Anbieters (Wochenende → Vortag)', () => {
    expect(
      chooseRate('EUR', '2027-01-10', { rateMicro: 1_610_000n, date: '2027-01-08', stale: false }),
    ).toEqual({
      rateMicro: 1_610_000,
      rateDate: '2027-01-08',
      provisional: false,
    });
  });

  it('EUR offline: letzter bekannter Kurs, als Provisorium markiert', () => {
    expect(
      chooseRate('EUR', '2027-01-10', { rateMicro: 1_600_000n, date: '2027-01-03', stale: true }),
    ).toEqual({
      rateMicro: 1_600_000,
      rateDate: '2027-01-03',
      provisional: true,
    });
  });

  it('EUR ohne jeden bekannten Kurs: null', () => {
    expect(chooseRate('EUR', '2027-01-10', null)).toBeNull();
  });
});

describe('needsRateCatchUp', () => {
  const entry = { currency: 'EUR' as const, fxProvisional: true, createdByDevice: 'dev-1' };
  it('nur das erstellende Gerät, nur vorläufige EUR-Einträge', () => {
    expect(needsRateCatchUp(entry, 'dev-1')).toBe(true);
    expect(needsRateCatchUp(entry, 'dev-2')).toBe(false);
    expect(needsRateCatchUp({ ...entry, fxProvisional: false }, 'dev-1')).toBe(false);
    expect(needsRateCatchUp({ ...entry, currency: 'CAD' }, 'dev-1')).toBe(false);
  });
});
