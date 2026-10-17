import { type ReactNode, useId, useState } from 'react';
import { type ScenarioPatch, saveScenario } from '../../data/actions';
import { db } from '../../data/db';
import { useBudgets, useCategories } from '../../data/repos';
import { monthOf, type Scenario, type ScenarioExtra } from '../../domain/model';
import type { Projection } from '../../domain/projection';
import { adjustedMonthly, extraOutsidePeriod, sliderCategories } from '../../domain/scenario-view';
import { formatDay, formatMoney } from '../../i18n/format';
import { getLocale, t } from '../../i18n/t';
import { PlusIcon, TrashIcon, WarnIcon } from '../../icons/ui-icons';
import { Button, useToast } from '../../ui';
import { ExtraDialog } from './ExtraDialog';
import { PctSlider } from './PctSlider';
import styles from './ScenarioPanel.module.css';

interface Props {
  scenario: Scenario | null;
  base: Projection;
  period: { periodStart: string; periodEnd: string };
  today: string;
  /** Platz für Task 5 (Anpassung an die Budgets); hier nur durchgereicht. */
  adoptSlot?: ReactNode;
}

const DAY_OPTIONS = { day: 'numeric', month: 'short', year: 'numeric' } as const;

/** Szenario-Panel: Prozent-Regler je Kategorie, Extras (Einmalausgaben, Ziele) und Zurücksetzen. */
export function ScenarioPanel({ scenario, base, period, today, adoptSlot }: Props) {
  const locale = getLocale();
  const toast = useToast();
  const titleId = useId();
  const categories = useCategories();
  const budgets = useBudgets();
  const [dialogOpen, setDialogOpen] = useState(false);

  const categoryPct = scenario?.categoryPct ?? {};
  const extras = scenario?.extras ?? [];
  const anyPct = Object.values(categoryPct).some((v) => v !== 0);
  const sliders =
    base.variableBasis === 'none'
      ? []
      : sliderCategories(categories, budgets, base.variableByCategory, monthOf(today));

  async function write(patch: ScenarioPatch): Promise<void> {
    try {
      await saveScenario(db, patch);
    } catch (err) {
      toast(t('scen.saveError'));
      throw err;
    }
  }
  /** Für Klicks ohne Dialog: Fehler ist bereits gemeldet. */
  const fire = (patch: ScenarioPatch) => {
    void write(patch).catch(() => undefined);
  };
  const saveExtra = (e: ScenarioExtra) => write({ extras: [...extras, e] });

  return (
    <aside aria-labelledby={titleId} className={styles.panel}>
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>
          {t('scen.title')}
        </h2>
        <button
          type="button"
          className={styles.reset}
          disabled={!anyPct}
          onClick={() => fire({ categoryPct: {} })}
        >
          {t('scen.reset')}
        </button>
      </div>

      {base.variableBasis === 'none' ? (
        <p className={styles.note}>{t('scen.slider.none')}</p>
      ) : (
        <>
          <p className={styles.subtitle}>
            {t(base.variableBasis === 'budget' ? 'scen.basis.budget' : 'scen.basis.average')}
          </p>
          {sliders.length === 0 ? <p className={styles.note}>{t('scen.slider.none')}</p> : null}
          {sliders.map((c) => {
            const avg = base.variableByCategory.get(c.id) ?? 0n;
            const pct = categoryPct[c.id] ?? 0;
            return (
              <PctSlider
                key={c.id}
                label={c.name}
                value={pct}
                tileIcon={c.icon}
                tileColor={c.color}
                hint={t('scen.slider.hint', {
                  from: formatMoney(avg, 'CAD', locale),
                  to: formatMoney(adjustedMonthly(avg, pct), 'CAD', locale),
                })}
                onCommit={(v) => fire({ categoryPct: { ...categoryPct, [c.id]: v } })}
              />
            );
          })}
        </>
      )}

      <div className={styles.divider} />

      <h3 className={styles.subhead}>{t('scen.extras')}</h3>
      {extras.length === 0 ? <p className={styles.note}>{t('scen.extras.empty')}</p> : null}
      <ul className={styles.extraList}>
        {extras.map((e) => {
          const outside = extraOutsidePeriod(e, period.periodStart, period.periodEnd, today);
          const sub =
            e.kind === 'goal'
              ? t('scen.extra.goalSpan', {
                  from: formatDay(e.on, locale, DAY_OPTIONS),
                  to: formatDay(e.targetDate ?? e.on, locale, DAY_OPTIONS),
                })
              : t('scen.extra.expenseOn', { date: formatDay(e.on, locale, DAY_OPTIONS) });
          return (
            <li key={e.id} className={styles.extra}>
              <div className={styles.extraRow}>
                <div className={styles.extraText}>
                  <span className={styles.extraName}>{e.name}</span>
                  <span className={styles.extraSub}>{sub}</span>
                </div>
                <span className={`${styles.extraAmount} num`}>
                  {formatMoney(e.amountMinor, e.currency, locale)}
                </span>
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={t('scen.extra.delete', { name: e.name })}
                  onClick={() => fire({ extras: extras.filter((x) => x.id !== e.id) })}
                >
                  <TrashIcon size={20} />
                </button>
              </div>
              {outside ? (
                <p className={styles.outside}>
                  <WarnIcon size={16} />
                  <span>{t('scen.extra.outside')}</span>
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <Button variant="secondary" onClick={() => setDialogOpen(true)}>
        <PlusIcon size={20} />
        {t('scen.extra.add')}
      </Button>
      <ExtraDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSave={saveExtra} />

      {adoptSlot}
    </aside>
  );
}
