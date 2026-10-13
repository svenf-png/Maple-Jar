import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadPlanMessages } from '../../i18n/plan-messages';
import { setLang } from '../../i18n/t';
import {
  amountWithOriginal,
  dueLabel,
  goalStatusView,
  perMonthLabel,
  repeatLabel,
} from './plan-format';

const nbsp = '\u00a0';

beforeAll(async () => {
  await loadPlanMessages();
});
beforeEach(() => setLang('de'));

describe('repeatLabel', () => {
  it('deutsche Beschriftungen', () => {
    expect(repeatLabel({ unit: 'month', every: 1 })).toBe('Monatlich');
    expect(repeatLabel({ unit: 'week', every: 2 })).toBe('Alle 2 Wochen');
    expect(repeatLabel({ unit: 'year', every: 1 })).toBe('Jährlich');
    expect(repeatLabel({ unit: 'once', every: 1 })).toBe('Einmalig');
    expect(repeatLabel({ unit: 'month', every: 3 })).toBe('Alle 3 Monate');
  });
  it('englisch', () => {
    setLang('en');
    expect(repeatLabel({ unit: 'week', every: 2 })).toBe('Every 2 weeks');
  });
});

describe('dueLabel', () => {
  it('relative Tage und Datum', () => {
    expect(dueLabel('2027-03-10', '2027-03-10', 'de-DE')).toBe('Heute');
    expect(dueLabel('2027-03-11', '2027-03-10', 'de-DE')).toBe('Morgen');
    expect(dueLabel('2027-03-12', '2027-03-10', 'de-DE')).toBe('Übermorgen');
    expect(dueLabel('2027-03-20', '2027-03-10', 'de-DE')).toMatch(/20/);
  });
});

describe('perMonthLabel', () => {
  it('ersetzt den Betrag', () => {
    expect(perMonthLabel(12345, 'de-DE')).toBe(`≈ 123,45${nbsp}CA$ / Monat`);
  });
});

describe('goalStatusView', () => {
  it('Rückstand ist amber, nie rot', () => {
    expect(goalStatusView('behind').variant).toBe('warn');
    expect(goalStatusView('overdue').variant).toBe('warn');
    expect(goalStatusView('reached').variant).toBe('ok');
    expect(goalStatusView('ok')).toEqual({ variant: 'neutral', key: 'goal.status.ok' });
  });
});

describe('amountWithOriginal', () => {
  it('CAD ohne Original', () => {
    expect(amountWithOriginal(1000, 'CAD', null, 'en-CA')).toEqual({
      cad: '$10.00',
      approximate: false,
    });
  });
  it('EUR mit Kurs', () => {
    expect(amountWithOriginal(1000, 'EUR', 1_500_000, 'en-CA')).toEqual({
      cad: '$15.00',
      eur: '€10.00',
      approximate: true,
    });
  });
  it('EUR ohne Kurs', () => {
    expect(amountWithOriginal(1000, 'EUR', null, 'en-CA').cad).toBeNull();
  });
});
