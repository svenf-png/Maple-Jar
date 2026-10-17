import { describe, expect, it } from 'vitest';
import type { RepeatRule } from './model';
import {
  addDays,
  addMonths,
  daysBetween,
  monthlyEquivalent,
  monthsBetween,
  nextDue,
  occurrences,
} from './schedule';

const rule = (over: Partial<RepeatRule>): RepeatRule => ({
  unit: 'month',
  every: 1,
  startsOn: '2027-01-01',
  ...over,
});

describe('Datumshilfen', () => {
  it('addDays über Monats- und Jahresgrenze und Schaltjahr', () => {
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });
  it('addMonths klemmt auf Monatsende, Ausgangstag bleibt', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2027-01-31', 2)).toBe('2027-03-31');
    expect(addMonths('2027-02-28', 1, 31)).toBe('2027-03-31');
    expect(addMonths('2027-11-15', 3)).toBe('2028-02-15');
    expect(addMonths('2027-03-15', -3)).toBe('2026-12-15');
  });
  it('monthsBetween zählt Kalendermonate, daysBetween Tage', () => {
    expect(monthsBetween('2027-02-10', '2027-06-30')).toBe(4);
    expect(monthsBetween('2027-06-30', '2027-02-10')).toBe(-4);
    expect(monthsBetween('2027-11-30', '2028-01-01')).toBe(2);
    expect(daysBetween('2027-03-01', '2027-03-29')).toBe(28);
  });
  it('Zeitumstellung spielt keine Rolle (Tage um die Umstellung)', () => {
    expect(daysBetween('2027-03-27', '2027-03-29')).toBe(2);
    expect(daysBetween('2027-10-30', '2027-11-01')).toBe(2);
    expect(
      occurrences(rule({ unit: 'week', startsOn: '2027-03-22' }), '2027-03-22', '2027-04-12'),
    ).toEqual(['2027-03-22', '2027-03-29', '2027-04-05', '2027-04-12']);
  });
});

describe('occurrences', () => {
  it('einmalig: genau eine Fälligkeit, nur wenn im Zeitraum', () => {
    const r = rule({ unit: 'once', startsOn: '2027-05-10' });
    expect(occurrences(r, '2027-05-01', '2027-05-31')).toEqual(['2027-05-10']);
    expect(occurrences(r, '2027-05-10', '2027-05-10')).toEqual(['2027-05-10']);
    expect(occurrences(r, '2027-05-11', '2027-06-30')).toEqual([]);
    expect(occurrences(r, '2027-04-01', '2027-05-09')).toEqual([]);
  });
  it('monatlich am 31.: Anker bleibt, nicht wandernd', () => {
    const r = rule({ startsOn: '2027-01-31' });
    expect(occurrences(r, '2027-01-01', '2027-05-31')).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
      '2027-05-31',
    ]);
  });
  it('monatlich am 31. im Schaltjahr', () => {
    expect(occurrences(rule({ startsOn: '2028-01-31' }), '2028-02-01', '2028-03-31')).toEqual([
      '2028-02-29',
      '2028-03-31',
    ]);
  });
  it('jährlich am 29.02.: 28.02. in Nicht-Schaltjahren, wieder 29.02. im Schaltjahr', () => {
    const r = rule({ unit: 'year', startsOn: '2024-02-29' });
    expect(occurrences(r, '2024-01-01', '2028-12-31')).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ]);
  });
  it('every > 1: alle 2 Wochen, alle 3 Monate, alle 2 Jahre', () => {
    expect(
      occurrences(
        rule({ unit: 'week', every: 2, startsOn: '2027-01-04' }),
        '2027-01-01',
        '2027-02-15',
      ),
    ).toEqual(['2027-01-04', '2027-01-18', '2027-02-01', '2027-02-15']);
    expect(
      occurrences(rule({ every: 3, startsOn: '2027-01-15' }), '2027-01-01', '2027-12-31'),
    ).toEqual(['2027-01-15', '2027-04-15', '2027-07-15', '2027-10-15']);
    expect(
      occurrences(
        rule({ unit: 'year', every: 2, startsOn: '2027-06-01' }),
        '2027-01-01',
        '2032-12-31',
      ),
    ).toEqual(['2027-06-01', '2029-06-01', '2031-06-01']);
  });
  it('Beginn nach dem Zeitraum: leer', () => {
    expect(occurrences(rule({ startsOn: '2028-01-01' }), '2027-01-01', '2027-12-31')).toEqual([]);
  });
  it('Zeitraum beginnt nach dem Start: überspringt alte Termine korrekt', () => {
    const r = rule({ unit: 'week', every: 2, startsOn: '2020-01-06' });
    const got = occurrences(r, '2027-02-01', '2027-02-28');
    expect(got).toEqual(['2027-02-08', '2027-02-22']);
    const m = rule({ every: 5, startsOn: '2020-01-31' });
    expect(occurrences(m, '2027-01-01', '2027-12-31')).toEqual([
      '2027-02-28',
      '2027-07-31',
      '2027-12-31',
    ]);
  });
  it('Ende mittendrin (inklusive)', () => {
    const r = rule({ startsOn: '2027-01-15', endsOn: '2027-03-15' });
    expect(occurrences(r, '2027-01-01', '2027-12-31')).toEqual([
      '2027-01-15',
      '2027-02-15',
      '2027-03-15',
    ]);
    expect(occurrences({ ...r, endsOn: '2027-03-14' }, '2027-01-01', '2027-12-31')).toHaveLength(2);
  });
  it('Zeitraum ist inklusive an beiden Rändern', () => {
    expect(occurrences(rule({}), '2027-02-01', '2027-03-01')).toEqual(['2027-02-01', '2027-03-01']);
  });
});

describe('nextDue', () => {
  it('liefert die erste Fälligkeit streng nach dem Tag', () => {
    const r = rule({ startsOn: '2027-01-31' });
    expect(nextDue(r, '2027-01-31')).toBe('2027-02-28');
    expect(nextDue(r, '2027-02-27')).toBe('2027-02-28');
    expect(nextDue(r, '2027-02-28')).toBe('2027-03-31');
  });
  it('vor dem Beginn: der Beginn', () => {
    expect(nextDue(rule({ startsOn: '2027-06-10' }), '2027-01-01')).toBe('2027-06-10');
  });
  it('nach dem Ende: null; einmalig nur davor', () => {
    expect(nextDue(rule({ endsOn: '2027-03-01' }), '2027-03-01')).toBeNull();
    const once = rule({ unit: 'once', startsOn: '2027-05-10' });
    expect(nextDue(once, '2027-05-09')).toBe('2027-05-10');
    expect(nextDue(once, '2027-05-10')).toBeNull();
  });
  it('jährlich, every 2 über lange Distanz', () => {
    const r = rule({ unit: 'year', every: 2, startsOn: '2020-03-01' });
    expect(nextDue(r, '2027-01-01')).toBe('2028-03-01');
    expect(nextDue(r, '2028-03-01')).toBe('2030-03-01');
  });
});

describe('monthlyEquivalent', () => {
  it('Woche ×52/12, kaufmännisch gerundet', () => {
    expect(monthlyEquivalent(1000, 'week', 1)).toBe(4333n); // 4333.33
    expect(monthlyEquivalent(1500, 'week', 1)).toBe(6500n);
    expect(monthlyEquivalent(1000, 'week', 2)).toBe(2167n); // 2166.67
  });
  it('Monat und Jahr', () => {
    expect(monthlyEquivalent(1000, 'month', 1)).toBe(1000n);
    expect(monthlyEquivalent(1000, 'month', 3)).toBe(333n);
    expect(monthlyEquivalent(1000, 'month', 8)).toBe(125n);
    expect(monthlyEquivalent(1250, 'month', 8)).toBe(156n); // 156.25
    expect(monthlyEquivalent(1200, 'year', 1)).toBe(100n);
    expect(monthlyEquivalent(1250, 'year', 1)).toBe(104n); // 104.17
    expect(monthlyEquivalent(1800, 'year', 2)).toBe(75n);
  });
  it('halbe Cent runden auf', () => {
    expect(monthlyEquivalent(1, 'month', 2)).toBe(1n);
    expect(monthlyEquivalent(3, 'month', 2)).toBe(2n);
  });
  it('einmalig ist 0; bigint-Eingabe', () => {
    expect(monthlyEquivalent(5000, 'once', 1)).toBe(0n);
    expect(monthlyEquivalent(1200n, 'year', 1)).toBe(100n);
  });
});
