import { useMemo, useState } from 'react';
import { adoptScenarioBudgets } from '../../data/actions';
import { db } from '../../data/db';
import type { Budget, Category } from '../../domain/model';
import { scenarioBudgets } from '../../domain/scenario';
import { nextMonth } from '../../domain/scenario-view';
import { formatMoney, formatMonth } from '../../i18n/format';
import { getLocale, t } from '../../i18n/t';
import { Button, Dialog, useToast } from '../../ui';
import styles from './AdoptBudgets.module.css';

interface Props {
  categories: readonly Category[];
  budgets: readonly Budget[];
  averages: ReadonlyMap<string, bigint>;
  categoryPct: Readonly<Record<string, number>>;
  today: string;
}

/** Übernimmt die Szenario-Vorschläge als Budgets ab dem Folgemonat, nach Bestätigung. */
export function AdoptBudgets({ categories, budgets, averages, categoryPct, today }: Props) {
  const locale = getLocale();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const month = nextMonth(today);
  const monthLabel = formatMonth(month, locale);
  const proposals = useMemo(
    () => scenarioBudgets({ categories, budgets, averages, categoryPct, month }),
    [categories, budgets, averages, categoryPct, month],
  );
  const names = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  async function confirm(): Promise<void> {
    setBusy(true);
    try {
      await adoptScenarioBudgets(db, proposals, month);
      setOpen(false);
      toast(t('scen.adopt.done', { month: monthLabel }));
    } catch {
      toast(t('scen.saveError'));
    } finally {
      setBusy(false);
    }
  }

  const none = proposals.length === 0;

  return (
    <div className={styles.wrap}>
      <Button
        variant="primary"
        className={styles.full}
        disabled={none}
        onClick={() => setOpen(true)}
      >
        {t('scen.adopt')}
      </Button>
      {none ? <p className={styles.none}>{t('scen.adopt.none')}</p> : null}
      <Dialog
        open={open}
        title={t('scen.adopt.title', { month: monthLabel })}
        onClose={() => setOpen(false)}
      >
        <ul className={styles.list}>
          {proposals.map((p) => (
            <li key={p.categoryId} className={styles.row}>
              <span className={styles.name}>{names.get(p.categoryId) ?? ''}</span>
              <span className={`${styles.amount} num`}>
                {t('scen.adopt.row', {
                  from: formatMoney(p.fromMinor, 'CAD', locale),
                  to: formatMoney(p.toMinor, 'CAD', locale),
                })}
              </span>
            </li>
          ))}
        </ul>
        <p className={styles.text}>{t('scen.adopt.text')}</p>
        <div className={styles.actions}>
          <Button variant="primary" busy={busy} onClick={() => void confirm()}>
            {t('scen.adopt.confirm')}
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
