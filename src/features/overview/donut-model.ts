import type { IncomeSplit, SplitKind } from '../../domain/income-split';

export interface Dash {
  /** Länge des Bogens entlang des Umfangs. */
  len: number;
  /** stroke-dashoffset (negativ = Start nach vorne verschoben). */
  offset: number;
}

/**
 * Bögen eines Rings als Strichmuster: je Wert ein Bogen proportional zum Anteil, zwischen benachbarten
 * Bögen `gap` Pixel Lücke. Nur Geometrie, keine Geldlogik (Werte dürfen Näherungen sein). Werte ≤ 0 ergeben Länge 0.
 */
export function donutDashes(values: readonly number[], circumference: number, gap: number): Dash[] {
  const total = values.reduce((a, v) => a + Math.max(0, v), 0);
  const visible = values.filter((v) => v > 0).length;
  let acc = 0;
  return values.map((v) => {
    if (v <= 0 || total <= 0) return { len: 0, offset: 0 };
    const share = (v / total) * circumference;
    const g = visible > 1 ? gap : 0;
    const dash = { len: Math.max(0, share - g), offset: -(acc + g / 2) };
    acc += share;
    return dash;
  });
}

export interface LegendRow {
  kind: SplitKind;
  cadMinor: bigint;
  percent: number;
}

/** Legendenzeilen: nur Segmente mit Betrag, in der Reihenfolge des Rings. */
export function legendRows(split: IncomeSplit): LegendRow[] {
  return split.segments
    .filter((s) => s.cadMinor > 0n)
    .map((s) => ({ kind: s.kind, cadMinor: s.cadMinor, percent: s.percent }));
}

/** Gibt es in diesem Monat überhaupt etwas zu zeigen? */
export const hasSplitData = (split: IncomeSplit): boolean =>
  split.incomeCadMinor > 0n || split.expensesCadMinor > 0n;
