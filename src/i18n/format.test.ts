import { describe, expect, it } from 'vitest';
import { formatSignedPercent } from './format';

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
