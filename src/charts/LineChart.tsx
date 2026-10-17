import { type ChartBox, chartDomain, linePoints, toPath, yOf } from '../domain/chart-scale';
import styles from './LineChart.module.css';

export interface LineSeries {
  id: string;
  values: readonly bigint[];
  tone: 'base' | 'scen';
  /** Index ab dem gestrichelt wird; 0 = ganz gestrichelt. */
  dashFrom: number;
}

interface Props {
  series: readonly LineSeries[];
  labels: readonly string[];
  todayIndex: number;
  todayLabel: string;
  ariaLabel: string;
  formatTick: (v: bigint) => string;
}

const BOX: ChartBox = { width: 800, height: 300, padX: 24, padTop: 16, padBottom: 20 };
const MONTH_LABELS = 6;

/** Eigenes SVG-Liniendiagramm. Linien skalieren verzerrungsfrei über `vector-effect`; Text liegt als HTML darüber. */
export function LineChart({
  series,
  labels,
  todayIndex,
  todayLabel,
  ariaLabel,
  formatTick,
}: Props) {
  const domain = chartDomain(series.flatMap((s) => [...s.values]));
  const hasToday = todayIndex >= 0;
  const xs = linePoints(
    labels.map(() => 0n),
    BOX,
    domain,
  );
  const todayX = hasToday ? xs[todayIndex]?.x : undefined;
  const every = Math.max(1, Math.ceil(labels.length / MONTH_LABELS));

  return (
    <figure className={styles.figure}>
      <div className={styles.plot}>
        <svg
          viewBox={`0 0 ${BOX.width} ${BOX.height}`}
          preserveAspectRatio="none"
          className={styles.svg}
          role="img"
          aria-label={ariaLabel}
        >
          {domain.ticks.map((tick) => {
            const y = yOf(tick, BOX, domain);
            return (
              <line
                key={`g${tick}`}
                x1={BOX.padX}
                x2={BOX.width - BOX.padX}
                y1={y}
                y2={y}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                className={tick === 0n ? styles.zero : styles.grid}
              />
            );
          })}
          {todayX !== undefined ? (
            <line
              x1={todayX}
              x2={todayX}
              y1={BOX.padTop}
              y2={BOX.height - BOX.padBottom}
              strokeWidth={1.5}
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
              className={styles.today}
            />
          ) : null}
          {series.map((s) => {
            const pts = linePoints(s.values, BOX, domain);
            const solid = pts.slice(0, s.dashFrom + 1);
            const dashed = pts.slice(s.dashFrom);
            const last = pts.at(-1);
            const toneLine = s.tone === 'base' ? styles.base : styles.scen;
            const toneDot = s.tone === 'base' ? styles.dotBase : styles.dotScen;
            return (
              <g key={s.id}>
                {solid.length > 1 ? (
                  <path
                    d={toPath(solid)}
                    strokeWidth={2.5}
                    vectorEffect="non-scaling-stroke"
                    className={`${styles.line} ${styles.solid} ${toneLine}`}
                  />
                ) : null}
                {dashed.length > 1 ? (
                  <path
                    d={toPath(dashed)}
                    strokeWidth={2.5}
                    strokeDasharray="6 5"
                    vectorEffect="non-scaling-stroke"
                    className={`${styles.line} ${styles.dashed} ${toneLine}`}
                  />
                ) : null}
                {last ? (
                  <circle
                    cx={last.x}
                    cy={last.y}
                    r={5}
                    strokeWidth={2}
                    className={`${styles.dot} ${toneDot}`}
                  />
                ) : null}
              </g>
            );
          })}
        </svg>
        {domain.ticks.map((tick) => (
          <span
            key={`t${tick}`}
            aria-hidden="true"
            className={styles.tick}
            style={{ top: `${(yOf(tick, BOX, domain) / BOX.height) * 100}%` }}
          >
            {formatTick(tick)}
          </span>
        ))}
        {todayX !== undefined ? (
          <span
            aria-hidden="true"
            className={styles.todayLabel}
            style={{ left: `${(todayX / BOX.width) * 100}%` }}
          >
            {todayLabel}
          </span>
        ) : null}
      </div>
      <div
        aria-hidden="true"
        className={styles.months}
        style={{ gridTemplateColumns: `repeat(${Math.max(1, labels.length)}, minmax(0, 1fr))` }}
      >
        {labels.map((label, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: feste Monatsliste, Positionen ändern sich nie
          <span key={`m${i}`} className={styles.month}>
            {i % every === 0 ? label : ''}
          </span>
        ))}
      </div>
    </figure>
  );
}
