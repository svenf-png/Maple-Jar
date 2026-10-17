import { beforeEach, describe, expect, it } from 'vitest';
import { de } from './de';
import { en } from './en';
import { formatCompact, formatMoney, formatMonth, formatMonthShort, formatRate } from './format';
import { planDe } from './plan-de';
import { planEn } from './plan-en';
import { loadPlanMessages } from './plan-messages';
import { setLang, t } from './t';

const nbsp = ' ';

describe('t()', () => {
  beforeEach(() => setLang('de'));

  it('ersetzt Platzhalter', () => {
    expect(t('settings.sharedWith', { name: 'Person B' })).toBe(
      'Gemeinsamer Haushalt mit Person B',
    );
  });

  it('lässt unbekannte Platzhalter stehen', () => {
    expect(t('settings.sharedWith')).toContain('{name}');
  });

  it('wechselt die Sprache und setzt html lang', () => {
    setLang('en');
    expect(t('connect.submit')).toBe('Connect');
    expect(document.documentElement.lang).toBe('en');
  });

  it('EN hat exakt dieselben Schlüssel wie DE', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
  });

  it('Platzhalter stimmen in beiden Sprachen überein', () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(de) as Array<keyof typeof de>) {
      expect(ph(en[key]), key).toEqual(ph(de[key]));
    }
  });
});

describe('Planungs-Texte (lazy)', () => {
  const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it('EN hat exakt dieselben Schlüssel wie DE', () => {
    expect(Object.keys(planEn).sort()).toEqual(Object.keys(planDe).sort());
  });
  it('Platzhalter stimmen überein', () => {
    for (const key of Object.keys(planDe) as Array<keyof typeof planDe>) {
      expect(ph(planEn[key]), key).toEqual(ph(planDe[key]));
    }
  });
  it('keine Überschneidung mit den Entry-Schlüsseln', () => {
    for (const key of Object.keys(planDe)) expect(key in de, key).toBe(false);
  });
  it('loadPlanMessages registriert beide Sprachen in t()', async () => {
    await loadPlanMessages();
    setLang('de');
    expect(t('plan.title')).toBe('Planung');
    setLang('en');
    expect(t('plan.title')).toBe('Planning');
    setLang('de');
  });
});

describe('formatMoney', () => {
  it('de-DE / CAD', () => {
    expect(formatMoney(8417, 'CAD', 'de-DE')).toBe(`84,17${nbsp}CA$`);
  });
  it('de-DE / EUR', () => {
    expect(formatMoney(8417, 'EUR', 'de-DE')).toBe(`84,17${nbsp}€`);
  });
  it('en-CA / CAD', () => {
    expect(formatMoney(8417, 'CAD', 'en-CA')).toBe('$84.17');
  });
  it('en-CA / EUR', () => {
    expect(formatMoney(8417, 'EUR', 'en-CA')).toBe('€84.17');
  });
  it('akzeptiert bigint und negative Werte', () => {
    expect(formatMoney(-5n, 'EUR', 'de-DE')).toContain('0,05');
    expect(formatMoney(123456789012345678n, 'CAD', 'en-CA')).toContain('1,234,567,890,123,456.78');
  });
});

describe('weitere Formate', () => {
  it('formatMonth', () => {
    expect(formatMonth('2027-02-01', 'de-DE')).toBe('Februar 2027');
  });
  it('formatRate aus Mikro-Einheiten', () => {
    expect(formatRate(1_610_000n, 'de-DE')).toBe(`1,61${nbsp}CA$`);
  });
});

describe('formatCompact / formatMonthShort', () => {
  it('formatCompact: ganze CAD, Minuszeichen U+2212', () => {
    expect(formatCompact(2000000n, 'de-DE')).toBe('20.000'); // Achsenbeschriftung in ganzen CAD
    expect(formatCompact(1000000n, 'en-CA')).toBe('10,000');
    expect(formatCompact(-50000n, 'de-DE')).toBe('−500');
  });
  it('formatMonthShort', () => {
    expect(formatMonthShort('2027-03-01', 'de-DE')).toMatch(/^Mär/); // ICU der Laufzeit ("Mär" oder "März")
    expect(formatMonthShort('2027-03-01', 'en-CA')).toBe('Mar');
  });
});
