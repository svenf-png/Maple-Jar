import { describe, expect, it } from 'vitest';
import { formatMoney } from '../../i18n/format';
import { signedMoney, signedPercent } from './projection-format';

describe('signedMoney', () => {
  it('setzt bei positiven Beträgen ein Plus davor', () => {
    expect(signedMoney(123400n, 'de-DE')).toBe(`+${formatMoney(123400n, 'CAD', 'de-DE')}`);
  });

  it('setzt bei negativen Beträgen ein Minus (U+2212) vor den Absolutwert', () => {
    expect(signedMoney(-50000n, 'de-DE')).toBe(`−${formatMoney(50000n, 'CAD', 'de-DE')}`);
  });

  it('zeigt Null ohne Vorzeichen', () => {
    expect(signedMoney(0n, 'de-DE')).toBe(formatMoney(0n, 'CAD', 'de-DE'));
  });
});

describe('signedPercent', () => {
  it('setzt bei positiven Werten ein Plus davor', () => {
    expect(signedPercent(20, 'de-DE')).toBe('+20\u00a0%');
  });

  it('setzt bei negativen Werten ein Minus (U+2212) davor', () => {
    expect(signedPercent(-20, 'de-DE')).toBe('\u221220\u00a0%');
  });

  it('zeigt Null ohne Vorzeichen', () => {
    expect(signedPercent(0, 'de-DE')).toBe('0\u00a0%');
  });
});
