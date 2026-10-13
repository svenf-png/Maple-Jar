import { describe, expect, it } from 'vitest';
import type { IncomeSplit } from '../../domain/income-split';
import { donutDashes, hasSplitData, legendRows } from './donut-model';

describe('donutDashes', () => {
  it('teilt den Umfang proportional und lässt Lücken', () => {
    const d = donutDashes([50, 50], 100, 2);
    expect(d[0]).toEqual({ len: 48, offset: -1 });
    expect(d[1]).toEqual({ len: 48, offset: -51 });
  });
  it('ein einzelner Bogen füllt den Ring ohne Lücke', () => {
    expect(donutDashes([0, 7, 0], 100, 2)[1]).toEqual({ len: 100, offset: -0 });
  });
  it('leere Werte ergeben Länge 0', () => {
    expect(donutDashes([0, 0], 100, 2).map((x) => x.len)).toEqual([0, 0]);
  });
});

const split = (over: Partial<IncomeSplit>): IncomeSplit => ({
  totalCadMinor: 0n,
  incomeCadMinor: 0n,
  expensesCadMinor: 0n,
  approximate: false,
  mode: 'normal',
  segments: [],
  overflow: null,
  ...over,
});

describe('legendRows', () => {
  it('lässt leere Segmente weg', () => {
    const rows = legendRows(
      split({
        segments: [
          { kind: 'fixed', cadMinor: 100n, percent: 100 },
          { kind: 'budget', cadMinor: 0n, percent: 0 },
        ],
      }),
    );
    expect(rows).toEqual([{ kind: 'fixed', cadMinor: 100n, percent: 100 }]);
  });
  it('hasSplitData', () => {
    expect(hasSplitData(split({}))).toBe(false);
    expect(hasSplitData(split({ expensesCadMinor: 1n }))).toBe(true);
  });
});
