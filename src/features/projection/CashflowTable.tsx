import type { ProjectionMonth } from '../../domain/projection';
import { formatMoney, formatMonth, formatMonthShort } from '../../i18n/format';
import { getLocale, type Locale, t, useLang } from '../../i18n/t';
import styles from './CashflowTable.module.css';

type RowKey = 'income' | 'fixed' | 'saving' | 'variable' | 'net';

const KIND_KEY = {
  actual: 'proj.kind.actual',
  current: 'proj.kind.current',
  forecast: 'proj.kind.forecast',
} as const;

const ROW_LABEL = {
  income: 'proj.row.income',
  fixed: 'proj.row.fixed',
  saving: 'proj.row.saving',
  variable: 'proj.row.variable',
  net: 'proj.row.net',
} as const;

const cadOf = (m: ProjectionMonth, key: RowKey): bigint => {
  switch (key) {
    case 'income':
      return m.incomeCadMinor;
    case 'fixed':
      return m.fixedCadMinor;
    case 'saving':
      return m.savingCadMinor;
    case 'variable':
      return m.variableCadMinor;
    case 'net':
      return m.netCadMinor;
  }
};

/** Vorzeichen-Text: Einnahmen „+“, Ausgaben „−“ (nur bei Beträgen > 0), Überschuss je nach Vorzeichen. */
function signed(key: RowKey, value: bigint, locale: Locale): string {
  const abs = value < 0n ? -value : value;
  const money = formatMoney(abs, 'CAD', locale);
  if (key === 'income') return `+ ${money}`;
  if (key === 'net') return value < 0n ? `− ${money}` : `+ ${money}`;
  return value > 0n ? `− ${money}` : money;
}

/** Cashflow je Monat: Zeilen Einnahmen, Fixkosten, Sparen, variable Ausgaben, Überschuss. */
export function CashflowTable({
  months,
  caption,
}: {
  months: readonly ProjectionMonth[];
  caption: string;
}) {
  useLang();
  const locale = getLocale();
  const rows: RowKey[] = ['income', 'fixed', 'saving', 'variable', 'net'];

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <caption className={styles.caption}>{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.corner} />
            {months.map((m) => (
              <th
                key={m.month}
                scope="col"
                className={`${styles.monthHead} ${m.kind === 'forecast' ? styles.forecast : ''}`}
              >
                {formatMonthShort(m.month, locale)}
                <span className={styles.srOnly}>
                  {' '}
                  {formatMonth(m.month, locale)}, {t(KIND_KEY[m.kind])}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((key) => (
            <tr key={key} className={key === 'net' ? styles.net : undefined}>
              <th scope="row" className={styles.rowHead}>
                {t(ROW_LABEL[key])}
              </th>
              {months.map((m) => {
                const value = cadOf(m, key);
                const positive = key === 'net' && value > 0n;
                return (
                  <td key={m.month} className={`num ${positive ? styles.ok : ''}`}>
                    {signed(key, value, locale)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
