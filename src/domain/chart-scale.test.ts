import { describe, expect, it } from 'vitest';
import { chartDomain, linePoints, niceStep, todayIndex, toPath } from './chart-scale';

describe('chartDomain', () => {
  it('rundet auf schöne Schritte, Obergrenze = Maximum', () => {
    expect(chartDomain([142000n, 2024000n])).toEqual({
      lo: 0n,
      hi: 2024000n,
      ticks: [0n, 1000000n, 2000000n],
    });
  });
  it('schließt negative Werte ein', () => {
    expect(chartDomain([-50000n, 30000n])).toEqual({
      lo: -50000n,
      hi: 30000n,
      ticks: [-50000n, 0n],
    });
  });
  it('leere oder flache Reihe: Spanne 0 bis 100 CAD', () => {
    expect(chartDomain([])).toEqual({ lo: 0n, hi: 10000n, ticks: [0n, 5000n, 10000n] });
    expect(chartDomain([0n, 0n])).toEqual({ lo: 0n, hi: 10000n, ticks: [0n, 5000n, 10000n] });
  });
});
describe('niceStep', () => {
  it.each([
    [1012000n, 1000000n],
    [40000n, 50000n],
    [2600n, 2000n],
    [3600n, 5000n],
    [8000n, 10000n],
    [0n, 1n],
  ])('%s → %s', (raw, step) => expect(niceStep(raw)).toBe(step));
});
describe('linePoints', () => {
  const box = { width: 100, height: 50, padX: 10, padTop: 0, padBottom: 0 };
  it('verteilt x gleichmäßig, y invertiert', () => {
    expect(linePoints([0n, 100n], box, { lo: 0n, hi: 100n })).toEqual([
      { x: 10, y: 50 },
      { x: 90, y: 0 },
    ]);
  });
  it('ein Wert: mittig', () => {
    expect(linePoints([50n], box, { lo: 0n, hi: 100n })).toEqual([{ x: 50, y: 25 }]);
  });
});
describe('toPath', () => {
  it('eine Nachkommastelle', () =>
    expect(
      toPath([
        { x: 10, y: 50 },
        { x: 90.04, y: 0 },
      ]),
    ).toBe('M10.0 50.0 L90.0 0.0'));
  it('leer', () => expect(toPath([])).toBe(''));
});
describe('todayIndex', () => {
  it('Index des laufenden Monats', () =>
    expect(todayIndex([{ kind: 'actual' }, { kind: 'current' }, { kind: 'forecast' }])).toBe(1));
  it('alles vorbei: letzter Index', () =>
    expect(todayIndex([{ kind: 'actual' }, { kind: 'actual' }])).toBe(1));
  it('alles künftig: -1', () => expect(todayIndex([{ kind: 'forecast' }])).toBe(-1));
});
