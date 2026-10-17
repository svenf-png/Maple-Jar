import { LineChart, type LineSeries } from '../../charts/LineChart';
import { todayIndex } from '../../domain/chart-scale';
import type { Projection } from '../../domain/projection';
import { formatCompact, formatMoney, formatMonth, formatMonthShort } from '../../i18n/format';
import { getLocale, t } from '../../i18n/t';
import styles from './ProjectionChart.module.css';

interface Props {
  base: Projection;
  /** `null`: nur die Basis. */
  scenario: Projection | null;
}

type LegendSwatch = 'solid' | 'dashed' | 'today';

interface LegendItem {
  key: string;
  label: string;
  swatch: LegendSwatch;
  tone: 'base' | 'scen' | 'today';
}

/** Adapter: Projektion → LineChart (Monatsbeschriftung, Ist/Prognose-Strich, Legende, Bezeichnung). */
export function ProjectionChart({ base, scenario }: Props) {
  const locale = getLocale();
  const months = base.months;
  if (months.length === 0) return null;

  const ti = todayIndex(months);
  const series: LineSeries[] = [
    {
      id: 'base',
      tone: 'base',
      values: months.map((m) => m.cumulativeCadMinor),
      dashFrom: Math.max(0, ti),
    },
  ];
  if (scenario) {
    series.push({
      id: 'scen',
      tone: 'scen',
      values: scenario.months.map((m) => m.cumulativeCadMinor),
      dashFrom: 0,
    });
  }

  const first = months[0]?.month ?? '';
  const lastMonth = months[months.length - 1]?.month ?? '';
  const from = formatMonth(first, locale);
  const to = formatMonth(lastMonth, locale);
  const baseAmount = formatMoney(base.endCadMinor, 'CAD', locale);
  const ariaLabel = scenario
    ? t('proj.chart.labelScenario', {
        from,
        to,
        base: baseAmount,
        scenario: formatMoney(scenario.endCadMinor, 'CAD', locale),
      })
    : t('proj.chart.label', { from, to, amount: baseAmount });

  const legend: LegendItem[] = scenario
    ? [
        { key: 'base', label: t('proj.legend.base'), swatch: 'solid', tone: 'base' },
        { key: 'scen', label: t('proj.legend.scenario'), swatch: 'solid', tone: 'scen' },
        { key: 'today', label: t('proj.legend.today'), swatch: 'today', tone: 'today' },
      ]
    : [
        { key: 'actual', label: t('proj.legend.actual'), swatch: 'solid', tone: 'base' },
        { key: 'forecast', label: t('proj.legend.forecast'), swatch: 'dashed', tone: 'base' },
      ];

  return (
    <div className={styles.wrap}>
      <LineChart
        series={series}
        labels={months.map((m) => formatMonthShort(m.month, locale))}
        todayIndex={ti}
        todayLabel={t('proj.legend.today')}
        ariaLabel={ariaLabel}
        formatTick={(v) => formatCompact(v, locale)}
      />
      <ul className={styles.legend}>
        {legend.map((item) => (
          <li key={item.key} className={styles.item}>
            <svg
              width="24"
              height="10"
              viewBox="0 0 24 10"
              aria-hidden="true"
              className={styles.swatch}
            >
              {item.swatch === 'today' ? (
                <line
                  x1="12"
                  x2="12"
                  y1="0"
                  y2="10"
                  strokeWidth="1.5"
                  strokeDasharray="2 3"
                  className={styles.todayLine}
                />
              ) : (
                <line
                  x1="0"
                  x2="24"
                  y1="5"
                  y2="5"
                  strokeWidth="2.5"
                  strokeDasharray={item.swatch === 'dashed' ? '6 5' : undefined}
                  className={item.tone === 'scen' ? styles.scen : styles.base}
                />
              )}
            </svg>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
