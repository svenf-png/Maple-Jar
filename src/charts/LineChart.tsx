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

const BOX: ChartBox = { width: 800, height: 300, padX: 6, padTop: 22, padBottom: 20 };
const MONTH_LABELS = 6;
/** Ab diesem Anteil der Breite wird das „Heute“-Label bündig am Rand ausgerichtet. */
const EDGE = 0.12;

/** Eigenes SVG-Liniendiagramm. Linien skalieren verzerrungsfrei über `vector-effect`; Text und Endpunkte liegen als HTML darüber. */
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
  const todayFrac = todayX === undefined ? 0.5 : todayX / BOX.width;
  const todayAlign =
    todayFrac < EDGE
      ? styles.alignStart
      : todayFrac > 1 - EDGE
        ? styles.alignEnd
        : styles.alignCenter;
  const every = Math.max(1, Math.ceil(labels.length / MONTH_LABELS));

  return (
    <figure className={styles.figure}>
      <div className={styles.plot}>
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
        <div className={styles.canvas}>
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
              const toneLine = s.tone === 'base' ? styles.base : styles.scen;
              return (
                <g key={s.id}>
                  {solid.length > 1 ? (
                    <path
                      d={toPath(solid)}
                      strokeWidth={2.5}
                      vectorEffect="non-scaling-stroke"
                      className={`${styles.line} ${toneLine}`}
                    />
                  ) : null}
                  {dashed.length > 1 ? (
                    <path
                      d={toPath(dashed)}
                      strokeWidth={2.5}
                      strokeDasharray="6 5"
                      vectorEffect="non-scaling-stroke"
                      className={`${styles.line} ${toneLine}`}
                    />
                  ) : null}
                </g>
              );
            })}
          </svg>
          {series.map((s) => {
            const last = linePoints(s.values, BOX, domain).at(-1);
            if (!last) return null;
            return (
              <span
                key={`d${s.id}`}
                aria-hidden="true"
                className={`${styles.dot} ${s.tone === 'base' ? styles.dotBase : styles.dotScen}`}
                style={{
                  left: `${(last.x / BOX.width) * 100}%`,
                  top: `${(last.y / BOX.height) * 100}%`,
                }}
              />
            );
          })}
          {todayX !== undefined ? (
            <span
              aria-hidden="true"
              className={`${styles.todayLabel} ${todayAlign}`}
              style={{ left: `${(todayX / BOX.width) * 100}%` }}
            >
              {todayLabel}
            </span>
          ) : null}
        </div>
      </div>
      <div aria-hidden="true" className={styles.months}>
        {labels.map((label, i) => {
          if (i % every !== 0) return null;
          const x = xs[i]?.x ?? 0;
          const align =
            i === 0
              ? styles.alignStart
              : i === labels.length - 1
                ? styles.alignEnd
                : styles.alignCenter;
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: feste Monatsliste, Positionen ändern sich nie
              key={`m${i}`}
              className={`${styles.month} ${align}`}
              style={{ left: `${(x / BOX.width) * 100}%` }}
            >
              {label}
            </span>
          );
        })}
      </div>
    </figure>
  );
}
