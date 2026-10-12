import { describe, expect, it } from 'vitest';
import { cadToEurMinor, minorToDecimal, parseDecimalToMinor, sumMinor, toCadMinor } from './money';

describe('toCadMinor', () => {
  it('CAD bleibt unverändert (Kurs 1)', () => {
    expect(toCadMinor(8417, 1_000_000)).toBe(8417n);
  });

  it('rechnet EUR mit Mikro-Kurs um und rundet kaufmännisch', () => {
    expect(toCadMinor(10_000, 1_610_000)).toBe(16_100n); // 100,00 € × 1,61
    expect(toCadMinor(1, 1_500_000)).toBe(2n); // 1,5 → 2 (ab .5 auf)
    expect(toCadMinor(1, 1_499_999)).toBe(1n);
    expect(toCadMinor(3, 1_166_667)).toBe(4n); // 3,500001
  });

  it('bleibt bei großen Beträgen exakt (kein Float)', () => {
    expect(toCadMinor(900_000_000_000, 1_000_001)).toBe(900_000_900_000n);
  });

  it('akzeptiert BigInt und number und rundet negative Werte symmetrisch', () => {
    expect(toCadMinor(5n, 1_500_000n)).toBe(8n);
    expect(toCadMinor(-5, 1_500_000)).toBe(-8n);
  });
});

describe('parseDecimalToMinor', () => {
  it('parst Komma und Punkt', () => {
    expect(parseDecimalToMinor('84,17')).toBe(8417);
    expect(parseDecimalToMinor('84.17')).toBe(8417);
    expect(parseDecimalToMinor('7')).toBe(700);
    expect(parseDecimalToMinor('7,5')).toBe(750);
    expect(parseDecimalToMinor(' 0,05 ')).toBe(5);
  });

  it('lehnt Ungültiges ab', () => {
    for (const bad of ['', 'abc', '1,234', '-3', '1,2,3', '1e5', '12.', ',5', '1234567890123']) {
      expect(parseDecimalToMinor(bad)).toBeNull();
    }
  });
});

describe('minorToDecimal / sumMinor', () => {
  it('formatiert maschinenlesbar', () => {
    expect(minorToDecimal(8417)).toBe('84.17');
    expect(minorToDecimal(5)).toBe('0.05');
    expect(minorToDecimal(-250)).toBe('-2.50');
  });

  it('summiert exakt', () => {
    expect(sumMinor([1, 2n, 3])).toBe(6n);
    expect(sumMinor([])).toBe(0n);
  });
});

describe('cadToEurMinor', () => {
  it('rechnet zurück und rundet', () => {
    expect(cadToEurMinor(16_100, 1_610_000)).toBe(10_000n);
    expect(cadToEurMinor(8_417, 1_610_000)).toBe(5_228n); // 52,28 €
    expect(cadToEurMinor(1, 0)).toBe(0n);
  });
});
