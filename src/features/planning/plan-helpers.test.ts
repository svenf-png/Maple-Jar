import { describe, expect, it } from 'vitest';
import { parseDecimalToMinor } from '../../domain/money';
import {
  checkRepeat,
  goalError,
  isRunning,
  monthlyCadTotal,
  monthsSpan,
  nextOccurrence,
  parseSignedMinor,
  reachedSeenKey,
} from './plan-helpers';

const rule = (o: object) => ({
  unit: 'month' as const,
  every: 1,
  startsOn: '2026-01-05',
  amountMinor: 12_000,
  currency: 'CAD' as const,
  ...o,
});

describe('nextOccurrence', () => {
  it('zählt heute mit', () => {
    expect(nextOccurrence(rule({}), '2026-10-05')).toBe('2026-10-05');
    expect(nextOccurrence(rule({}), '2026-10-06')).toBe('2026-11-05');
  });
  it('null nach dem Ende', () => {
    expect(nextOccurrence(rule({ endsOn: '2026-06-30' }), '2026-10-06')).toBeNull();
  });
});

describe('monthlyCadTotal', () => {
  it('summiert CAD und rechnet EUR mit dem Kurs um', () => {
    const r = monthlyCadTotal(
      [
        rule({}),
        rule({ currency: 'EUR', amountMinor: 10_000 }),
        rule({ unit: 'year', amountMinor: 12_000 }),
      ],
      1_500_000n,
      '2026-10-13',
    );
    expect(r).toEqual({ total: 12_000n + 15_000n + 1_000n, incomplete: false });
  });
  it('ohne Kurs bleibt EUR draußen und wird gemeldet', () => {
    const r = monthlyCadTotal([rule({}), rule({ currency: 'EUR' })], null, '2026-10-13');
    expect(r).toEqual({ total: 12_000n, incomplete: true });
  });
  it('beendete Regeln und einmalige zählen nicht', () => {
    const r = monthlyCadTotal(
      [rule({ endsOn: '2026-09-30' }), rule({ unit: 'once' })],
      null,
      '2026-10-13',
    );
    expect(r.total).toBe(0n);
    expect(isRunning({ endsOn: '2026-10-13' }, '2026-10-13')).toBe(true);
  });
});

describe('parseSignedMinor', () => {
  it('liest Vorzeichen, lehnt 0 und Müll ab', () => {
    expect(parseSignedMinor('12,50', parseDecimalToMinor)).toBe(1250);
    expect(parseSignedMinor('-12.5', parseDecimalToMinor)).toBe(-1250);
    expect(parseSignedMinor('−3', parseDecimalToMinor)).toBe(-300);
    expect(parseSignedMinor('0', parseDecimalToMinor)).toBeNull();
    expect(parseSignedMinor('-', parseDecimalToMinor)).toBeNull();
    expect(parseSignedMinor('abc', parseDecimalToMinor)).toBeNull();
  });
});

describe('checkRepeat', () => {
  const base = { startsOn: '2026-10-01', endsOn: null };
  it('prüft Intervall und Ende', () => {
    expect(checkRepeat({ ...base, unit: 'month', everyText: '2' })).toEqual({
      every: 2,
      error: null,
    });
    expect(checkRepeat({ ...base, unit: 'month', everyText: '0' }).error).toBe('form.error.every');
    expect(checkRepeat({ ...base, unit: 'month', everyText: '1.5' }).error).toBe(
      'form.error.every',
    );
    expect(checkRepeat({ ...base, unit: 'month', everyText: '100' }).error).toBe(
      'form.error.every',
    );
    expect(checkRepeat({ ...base, endsOn: '2026-09-30', unit: 'week', everyText: '1' }).error).toBe(
      'form.error.end',
    );
  });
  it('einmalig ignoriert Intervall und Ende', () => {
    expect(checkRepeat({ ...base, endsOn: '2020-01-01', unit: 'once', everyText: 'x' })).toEqual({
      every: 1,
      error: null,
    });
  });
});

describe('goalError', () => {
  const ok = {
    name: 'Sparziel A',
    targetMinor: 1000,
    startsOn: '2026-10-01',
    targetDate: '2027-01-01',
  };
  it('liefert den ersten Fehler', () => {
    expect(goalError(ok)).toBeNull();
    expect(goalError({ ...ok, name: ' ' })).toBe('form.error.name');
    expect(goalError({ ...ok, targetMinor: null })).toBe('form.error.amount');
    expect(goalError({ ...ok, targetDate: '2026-10-01' })).toBe('goal.error.dates');
  });
});

describe('reached helpers', () => {
  it('Schlüssel und Dauer', () => {
    expect(reachedSeenKey('g', 'u')).toBe('goalReachedSeen:g:u');
    expect(monthsSpan('2026-10-01', '2026-10-13')).toBe(1);
    expect(monthsSpan('2026-07-20', '2026-10-13')).toBe(3);
  });
});
