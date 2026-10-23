import { describe, expect, it } from 'vitest';
import { formatMoneyShort, formatMoneySplit, formatSignedPercent } from './format';

describe('formatSignedPercent', () => {
  it('de: Plus vor positiven Werten, Minus U+2212, geschütztes Leerzeichen vor dem %-Zeichen', () => {
    expect(formatSignedPercent(20, 'de-DE')).toBe('+20 %');
    expect(formatSignedPercent(-20, 'de-DE')).toBe('−20 %');
  });

  it('en: ohne Leerzeichen vor dem %-Zeichen', () => {
    expect(formatSignedPercent(20, 'en-CA')).toBe('+20%');
    expect(formatSignedPercent(-20, 'en-CA')).toBe('−20%');
  });

  it('Null ohne Vorzeichen', () => {
    expect(formatSignedPercent(0, 'de-DE')).toBe('0 %');
  });
});

describe('formatMoneyShort', () => {
  it('lässt Nachkommastellen bei ganzzahligen Beträgen weg', () => {
    expect(formatMoneyShort(70000n, 'CAD', 'de-DE')).toBe('700 CA$');
    expect(formatMoneyShort(148000, 'CAD', 'en-CA')).toBe('$1,480');
  });

  it('behält Nachkommastellen bei krummen Beträgen und Minus', () => {
    expect(formatMoneyShort(29260n, 'CAD', 'de-DE')).toBe('292,60 CA$');
    expect(formatMoneyShort(-50n, 'CAD', 'de-DE')).toBe('-0,50 CA$');
  });
});

describe('formatMoneySplit', () => {
  it('trennt Betrag und Symbol (de: Symbol hinten)', () => {
    expect(formatMoneySplit(98100n, 'CAD', 'de-DE')).toEqual({
      amount: '981,00',
      symbol: 'CA$',
      symbolFirst: false,
    });
  });

  it('trennt Betrag und Symbol (en: Symbol vorn)', () => {
    expect(formatMoneySplit(98100n, 'CAD', 'en-CA')).toEqual({
      amount: '981.00',
      symbol: '$',
      symbolFirst: true,
    });
  });

  it('hält das Symbol bei negativen Beträgen an seiner Seite', () => {
    expect(formatMoneySplit(-39900n, 'CAD', 'en-CA')).toEqual({
      amount: '-399.00',
      symbol: '$',
      symbolFirst: true,
    });
    expect(formatMoneySplit(-39900n, 'CAD', 'de-DE')).toEqual({
      amount: '-399,00',
      symbol: 'CA$',
      symbolFirst: false,
    });
  });

  it('kürzt ganzzahlige Beträge nur mit trimWhole', () => {
    expect(formatMoneySplit(148000n, 'CAD', 'de-DE', { trimWhole: true }).amount).toBe('1.480');
    expect(formatMoneySplit(148000n, 'CAD', 'de-DE').amount).toBe('1.480,00');
  });
});
