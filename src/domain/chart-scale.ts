import type { MonthKind } from './projection';

// Reine Skalierung für Liniendiagramme. Geld bleibt bigint; Number nur für SVG-Koordinaten.

export interface ChartDomain {
  lo: bigint;
  hi: bigint;
  ticks: bigint[];
}

export interface ChartBox {
  width: number;
  height: number;
  padX: number;
  padTop: number;
  padBottom: number;
}

const DEFAULT_SPAN = 10000n;

/** Größte Zehnerpotenz ≤ `raw` (raw > 0). */
function decade(raw: bigint): bigint {
  let mag = 1n;
  while (mag * 10n <= raw) mag *= 10n;
  return mag;
}

/** „Schöner“ Schritt ≥ 1 für eine rohe Schrittweite: 1, 2, 5 oder 10 mal eine Zehnerpotenz. */
export function niceStep(raw: bigint): bigint {
  if (raw <= 0n) return 1n;
  const mag = decade(raw);
  // Zehntel der Mantisse, ganzzahlig: n = raw / mag, hier als 10·n abgeschnitten.
  const tenths = (raw * 10n) / mag;
  if (tenths < 15n) return mag;
  if (tenths < 35n) return 2n * mag;
  if (tenths < 75n) return 5n * mag;
  return 10n * mag;
}

/** Floor-Division für bigint, korrekt auch für negative Zähler (b > 0). */
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== 0n && a < 0n ? q - 1n : q;
}

function ceilDiv(a: bigint, b: bigint): bigint {
  return -floorDiv(-a, b);
}

/** Wertebereich mit 0 als Basis, auf schöne Ticks gerundet. */
export function chartDomain(values: readonly bigint[], count = 2): ChartDomain {
  let lo = 0n;
  let hi = 0n;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi === lo) hi = lo + DEFAULT_SPAN;
  const step = niceStep((hi - lo) / BigInt(count));
  const ticks: bigint[] = [];
  for (let k = ceilDiv(lo, step); k <= floorDiv(hi, step); k += 1n) ticks.push(k * step);
  return { lo, hi, ticks };
}

/** Y-Position eines Werts: hoher Wert oben (kleines y). */
export function yOf(value: bigint, box: ChartBox, domain: Pick<ChartDomain, 'lo' | 'hi'>): number {
  return (
    box.padTop +
    (Number(domain.hi - value) / Number(domain.hi - domain.lo)) *
      (box.height - box.padTop - box.padBottom)
  );
}

/** Punkte einer Linie: x gleichmäßig verteilt, y über `yOf`. Ein Wert liegt mittig. */
export function linePoints(
  values: readonly bigint[],
  box: ChartBox,
  domain: Pick<ChartDomain, 'lo' | 'hi'>,
): Array<{ x: number; y: number }> {
  const n = values.length;
  const span = box.width - 2 * box.padX;
  return values.map((v, i) => ({
    x: n === 1 ? box.width / 2 : box.padX + (i * span) / (n - 1),
    y: yOf(v, box, domain),
  }));
}

/** SVG-Pfad (M/L) mit einer Nachkommastelle. */
export function toPath(points: ReadonlyArray<{ x: number; y: number }>): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : ' L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join('');
}

/** Index des laufenden Monats. Ohne `current`: letzter Index, wenn der letzte Monat vorbei ist, sonst −1. */
export function todayIndex(months: ReadonlyArray<{ kind: MonthKind }>): number {
  const current = months.findIndex((m) => m.kind === 'current');
  if (current !== -1) return current;
  return months.length > 0 && months[months.length - 1]?.kind === 'actual' ? months.length - 1 : -1;
}
