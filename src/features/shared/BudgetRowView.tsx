import type { BudgetRow } from '../../domain/budget';
import { formatMoney } from '../../i18n/format';
import { getLocale, t } from '../../i18n/t';
import { WarnIcon } from '../../icons/ui-icons';
import { CategoryTile, ProgressBar } from '../../ui';
import styles from './BudgetRowView.module.css';

/** Budgetzeile: Fortschritt, ab 80 % und bei Überschreitung Amber mit Icon und Text (nie Rot). */
export function BudgetRowView({ row }: { row: BudgetRow }) {
  const locale = getLocale();
  const { state, pct, overBy } = row.status;
  const warn = state === 'near' || state === 'over';
  const note =
    state === 'over'
      ? t('budgets.state.over', { amount: formatMoney(overBy, 'CAD', locale) })
      : state === 'near'
        ? t('budgets.state.near', { pct })
        : null;
  return (
    <div className={styles.row}>
      <CategoryTile icon={row.category.icon} color={row.category.color} size={32} />
      <div className={styles.body}>
        <div className={styles.line}>
          <span className={styles.name}>{row.category.name}</span>
          <span className={`${styles.amounts} num`}>
            <strong>{formatMoney(row.spent, 'CAD', locale)}</strong> /{' '}
            {formatMoney(row.limit, 'CAD', locale)}
          </span>
        </div>
        <ProgressBar
          value={pct}
          label={`${row.category.name}: ${pct} %`}
          tone={warn ? 'warn' : 'cat'}
          color={row.category.color}
          height={6}
        />
        {note ? (
          <span className={styles.warn}>
            <WarnIcon size={15} />
            {note}
          </span>
        ) : null}
      </div>
    </div>
  );
}
