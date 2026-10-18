import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { setBudget } from '../../data/actions';
import { db } from '../../data/db';
import { useBudgets, useCategories, useEntries } from '../../data/repos';
import { type BudgetRow, limitFor, monthSummary, spentIn } from '../../domain/budget';
import { type Category, monthOf } from '../../domain/model';
import { minorToDecimal, parseDecimalToMinor } from '../../domain/money';
import { formatMoney, formatMonth } from '../../i18n/format';
import { getLocale, t, useLang } from '../../i18n/t';
import { WarnIcon } from '../../icons/ui-icons';
import { Button, Card, CategoryTile, Dialog, TextField, useToast } from '../../ui';
import { BudgetRowView } from '../shared/BudgetRowView';
import { todayIso } from '../shared/helpers';
import styles from './BudgetsPage.module.css';

export function BudgetsPage() {
  useLang();
  const locale = getLocale();
  const toast = useToast();
  const categories = useCategories().filter((c) => !c.deleted && !c.hidden);
  const budgets = useBudgets();
  const entries = useEntries();
  const today = todayIso();
  const month = monthOf(today);
  const summary = monthSummary({ categories, budgets, entries, month, today });
  const [editing, setEditing] = useState<Category | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const rowOf = (c: Category): BudgetRow | null =>
    summary.rows.find((r) => r.category.id === c.id) ?? null;

  function open(c: Category) {
    const limit = limitFor(budgets, c.id, month)?.monthlyLimitCadMinor ?? 0;
    setValue(limit > 0 ? minorToDecimal(limit).replace('.', locale === 'de-DE' ? ',' : '.') : '');
    setError(null);
    setEditing(c);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const text = value.trim() === '' ? '0' : value.trim();
    const minor = parseDecimalToMinor(text);
    if (minor === null) return setError(t('budgets.limitInvalid'));
    await setBudget(db, editing.id, month, minor);
    setEditing(null);
    toast(t('budgets.saved'));
  }

  return (
    <div className={styles.page}>
      <div className={styles.bar}>
        <Link to="/" className={styles.link}>
          {t('budgets.back')}
        </Link>
        <Link to="/kategorien" className={styles.link}>
          {t('budgets.manage')}
        </Link>
      </div>
      <h1 className="type-large-title">{t('budgets.title')}</h1>
      <p className={`${styles.muted} num`}>
        {t('budgets.summary', {
          month: formatMonth(month, locale),
          spent: formatMoney(summary.totalSpent, 'CAD', locale),
          limit: formatMoney(summary.totalLimit, 'CAD', locale),
        })}
      </p>
      {summary.rows.length > 0 ? (
        <div className={styles.counts}>
          <span className={styles.calm}>{t('budgets.calm', { count: summary.calm })}</span>
          {summary.attention > 0 ? (
            <span className={styles.attention}>
              <WarnIcon size={14} />
              {t('budgets.attention', { count: summary.attention })}
            </span>
          ) : null}
        </div>
      ) : null}

      {categories.length === 0 ? (
        <p className={styles.muted}>{t('budgets.empty')}</p>
      ) : (
        <Card className={styles.list}>
          {categories.map((c) => {
            const row = rowOf(c);
            return (
              <div key={c.id} className={styles.item}>
                {row ? (
                  <BudgetRowView row={row} />
                ) : (
                  <div className={styles.noLimit}>
                    <CategoryTile icon={c.icon} color={c.color} size={32} />
                    <div>
                      <div className={styles.name}>{c.name}</div>
                      <div className={styles.muted}>{t('budgets.noLimitHint')}</div>
                    </div>
                    <span className={`${styles.muted} num`}>
                      {formatMoney(spentIn(entries, month, c.id), 'CAD', locale)}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  className={styles.hit}
                  aria-label={`${t('budgets.edit')}: ${c.name}`}
                  onClick={() => open(c)}
                />
              </div>
            );
          })}
        </Card>
      )}

      <Dialog open={editing !== null} title={editing?.name ?? ''} onClose={() => setEditing(null)}>
        <form onSubmit={(e) => void save(e)} noValidate className={styles.form}>
          <TextField
            label={t('budgets.limitLabel')}
            hint={t('budgets.limitHint', { month: formatMonth(month, locale) })}
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={error ?? undefined}
          />
          <div className={styles.actions}>
            <Button type="submit">{t('common.save')}</Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
