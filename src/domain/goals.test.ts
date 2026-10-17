import { describe, expect, it } from 'vitest';
import {
  activeGoals,
  planDeviation,
  progress,
  remainingMonths,
  requiredMonthly,
  saved,
  savedByGoal,
} from './goals';
import { contribution, goal } from './test-data';

describe('saved', () => {
  it('summiert ohne gelöschte, Entnahmen negativ', () => {
    const list = [
      contribution({ amountMinor: 10_000 }),
      contribution({ amountMinor: 5_000 }),
      contribution({ amountMinor: -2_000 }),
      contribution({ amountMinor: 99_999, deleted: true }),
    ];
    expect(saved(list)).toBe(13_000n);
    expect(saved([])).toBe(0n);
  });
  it('savedByGoal trennt Ziele', () => {
    const m = savedByGoal([
      contribution({ goalId: 'g-a', amountMinor: 100 }),
      contribution({ goalId: 'g-b', amountMinor: 200 }),
      contribution({ goalId: 'g-a', amountMinor: 50 }),
      contribution({ goalId: 'g-a', amountMinor: 50, deleted: true }),
    ]);
    expect(m.get('g-a')).toBe(150n);
    expect(m.get('g-b')).toBe(200n);
  });
  it('activeGoals schließt archivierte und gelöschte aus', () => {
    const a = goal();
    const list = [a, goal({ archivedAt: '2027-03-01' }), goal({ deleted: true })];
    expect(activeGoals(list)).toEqual([a]);
  });
});

describe('progress', () => {
  const g = goal({ targetMinor: 120_000 });
  it('abgerundete Prozent, begrenzt auf 0 bis 100', () => {
    expect(progress(g, 0n)).toBe(0);
    expect(progress(g, 40_000n)).toBe(33);
    expect(progress(g, 119_999n)).toBe(99);
    expect(progress(g, 120_000n)).toBe(100);
    expect(progress(g, 500_000n)).toBe(100);
    expect(progress(g, -5n)).toBe(0);
  });
});

describe('requiredMonthly', () => {
  it('Monate: Kalendermonat-Differenz, mindestens 1', () => {
    expect(remainingMonths('2027-02-10', '2027-06-30')).toBe(4);
    expect(remainingMonths('2027-06-10', '2027-06-30')).toBe(1);
    expect(remainingMonths('2027-08-01', '2027-06-30')).toBe(1);
    expect(remainingMonths('2026-12-31', '2027-01-01')).toBe(1);
  });
  it('Rest geteilt durch Monate, aufgerundet', () => {
    const g = goal({ targetMinor: 100_000, targetDate: '2027-06-30' });
    expect(requiredMonthly(g, 0n, '2027-02-10')).toBe(25_000n);
    expect(requiredMonthly(g, 1n, '2027-02-10')).toBe(25_000n); // 99999/4 = 24999.75
    expect(requiredMonthly(g, 3n, '2027-02-10')).toBe(25_000n); // 99997/4 = 24999.25
    expect(requiredMonthly(g, 4n, '2027-02-10')).toBe(24_999n); // 99996/4 exakt
  });
  it('0 wenn erreicht, Rest komplett im letzten Monat', () => {
    const g = goal({ targetMinor: 100_000, targetDate: '2027-06-30' });
    expect(requiredMonthly(g, 100_000n, '2027-02-10')).toBe(0n);
    expect(requiredMonthly(g, 150_000n, '2027-02-10')).toBe(0n);
    expect(requiredMonthly(g, 40_000n, '2027-07-15')).toBe(60_000n);
  });
  it('Vorschlagsbetrag = requiredMonthly', () => {});
});

describe('planDeviation', () => {
  // 2027-01-01 bis 2027-01-31: 30 Tage, Ziel 30_000 -> 1000 pro Tag
  const g = goal({ targetMinor: 30_000, startsOn: '2027-01-01', targetDate: '2027-01-31' });
  it('im Plan: Stand >= Soll', () => {
    const d = planDeviation(g, 10_000n, '2027-01-11');
    expect(d.plannedMinor).toBe(10_000n);
    expect(d.behindMinor).toBe(0n);
    expect(d.status).toBe('ok');
  });
  it('hinter Plan mit Betrag und backOnPlan', () => {
    const d = planDeviation(g, 4_000n, '2027-01-11');
    expect(d.status).toBe('behind');
    expect(d.behindMinor).toBe(6_000n);
    // heute + 1 Monat > Zieldatum -> Zieldatum, Soll dort 30_000
    expect(d.backOnPlanMinor).toBe(26_000n);
    expect(d.backOnPlanMonth).toBe('2027-01-01');
  });
  it('langes Ziel: backOnPlan nach einem Monat', () => {
    const long = goal({ targetMinor: 36_500, startsOn: '2027-01-01', targetDate: '2028-01-01' }); // 365 Tage, 100 pro Tag
    const d = planDeviation(long, 1_000n, '2027-02-01'); // Soll 3100
    expect(d.plannedMinor).toBe(3_100n);
    expect(d.behindMinor).toBe(2_100n);
    expect(d.backOnPlanMinor).toBe(5_900n - 1_000n); // Soll am 2027-03-01: 59 Tage x 100
    expect(d.backOnPlanMonth).toBe('2027-03-01');
  });
  it('erreicht hat Vorrang', () => {
    expect(planDeviation(g, 30_000n, '2027-01-05').status).toBe('reached');
    expect(planDeviation(g, 30_000n, '2027-03-05').status).toBe('reached');
  });
  it('überfällig nach dem Zieldatum, nicht erreicht', () => {
    const d = planDeviation(g, 20_000n, '2027-02-01');
    expect(d.status).toBe('overdue');
    expect(d.behindMinor).toBe(10_000n);
  });
  it('vor dem Start: Soll 0, im Plan', () => {
    const d = planDeviation(g, 0n, '2026-12-01');
    expect(d.plannedMinor).toBe(0n);
    expect(d.status).toBe('ok');
  });
  it('Zieldatum am Zieltag: Soll = Ziel', () => {
    expect(planDeviation(g, 0n, '2027-01-31').plannedMinor).toBe(30_000n);
  });
});

describe('planDeviation überfällig', () => {
  it('kein Planmonat in der Vergangenheit', () => {
    const d = planDeviation(
      { targetMinor: 12_000, startsOn: '2026-01-01', targetDate: '2026-12-31' },
      1_000n,
      '2027-01-05',
    );
    expect(d.status).toBe('overdue');
    expect(d.backOnPlanMinor).toBeNull();
    expect(d.backOnPlanMonth).toBeNull();
  });
});
