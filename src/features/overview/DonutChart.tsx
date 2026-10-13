import { type CSSProperties, useId } from 'react';
import type { SplitKind } from '../../domain/income-split';
import styles from './DonutChart.module.css';
import { donutDashes } from './donut-model';

export interface DonutSlice {
  kind: SplitKind;
  /** Nur für die Winkel; Näherung genügt. */
  value: number;
}

interface Props {
  slices: readonly DonutSlice[];
  /** Ausgaben über den Einnahmen als Anteil am Kreis (0 bis 100); zeichnet einen Amber-Bogen außen. */
  overflowPercent?: number | null;
  /** Vollständiger Satz für Screenreader. */
  label: string;
  size?: number;
}

const GAP = 2;

/** Ring aus Tokenfarben (--seg-*), 2-px-Lücken, optional Überlauf-Bogen außen. Sweep nur ohne reduzierte Bewegung. */
export function DonutChart({ slices, overflowPercent = null, label, size = 96 }: Props) {
  const maskId = `donut-${useId().replace(/\W/g, '')}`;
  const r = 34;
  const stroke = 14;
  const c = 2 * Math.PI * r;
  const dashes = donutDashes(
    slices.map((s) => s.value),
    c,
    GAP,
  );
  const rOut = 45;
  const cOut = 2 * Math.PI * rOut;
  const over = overflowPercent ? Math.min(100, Math.max(0, overflowPercent)) : 0;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className={styles.svg}
    >
      <defs>
        <mask id={maskId}>
          <circle
            className={styles.sweep}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="white"
            strokeWidth={stroke + 2}
            strokeDasharray={c}
            style={{ '--len': c } as CSSProperties}
            transform="rotate(-90 50 50)"
          />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        {slices.map((s, i) => {
          const d = dashes[i];
          if (!d || d.len <= 0) return null;
          return (
            <circle
              key={s.kind}
              className={styles[s.kind]}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              strokeWidth={stroke}
              strokeDasharray={`${d.len} ${c - d.len}`}
              strokeDashoffset={d.offset}
              transform="rotate(-90 50 50)"
            />
          );
        })}
      </g>
      {over > 0 ? (
        <circle
          className={styles.overflow}
          cx="50"
          cy="50"
          r={rOut}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${Math.max(1, (over / 100) * cOut)} ${cOut}`}
          transform="rotate(-90 50 50)"
        />
      ) : null}
    </svg>
  );
}
