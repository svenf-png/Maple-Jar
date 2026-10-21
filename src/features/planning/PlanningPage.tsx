import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PageHeader } from '../../app/PageHeader';
import {
  useCategories,
  useContributions,
  useFixedCosts,
  useGoals,
  useIncomes,
} from '../../data/repos';
import { useReadySession } from '../../data/use-session';
import { activeGoals, planDeviation, savedByGoal } from '../../domain/goals';
import type { FixedCost, Income } from '../../domain/model';
import { toCadMinor } from '../../domain/money';
import { formatApprox, formatMoney } from '../../i18n/format';
import { getLocale, t, useLang } from '../../i18n/t';
import { useTodayRate } from '../../platform/use-fx';
import { useMedia } from '../../platform/use-media';
import { Button, Card, CategoryTile, EmptyState } from '../../ui';
import { ConflictBadge } from '../conflict/ConflictBadge';
import { BottomSheet } from '../shared/BottomSheet';
import { memberName, todayIso } from '../shared/helpers';
import { amountWithOriginal, dueLabel, perMonthLabel, repeatLabel } from '../shared/plan-format';
import { GoalCardBody } from './GoalParts';
import styles from './PlanningPage.module.css';
import { PlanTabs } from './PlanTabs';
import { monthlyCadTotal, nextOccurrence } from './plan-helpers';

export function PlanningPage() {
  useLang();
  const locale = getLocale();
  const navigate = useNavigate();
  const desktop = useMedia('(min-width: 1024px)');
  const { household } = useReadySession();
  const today = todayIso();
  const fx = useTodayRate(household.settings.fxProvider);
  const rateMicro = fx.status === 'ready' ? fx.rate.rateMicro : null;
  const allGoals = useGoals();
  const goals = activeGoals(allGoals);
  const archived = allGoals.filter((g) => !g.deleted && g.archivedAt != null);
  const savedMap = savedByGoal(useContributions());
  const categories = useCategories();
  const fixedCosts = useFixedCosts().filter((f) => !f.deleted);
  const incomes = useIncomes().filter((i) => !i.deleted);
  const [adding, setAdding] = useState(false);

  // Kopfzeile Sparziele: Summe des Standes in CAD (EUR-Ziele mit dem heutigen Kurs, ohne Kurs weggelassen).
  let goalsTotal = 0n;
  let goalsApprox = false;
  let goalsIncomplete = false;
  for (const g of goals) {
    const s = savedMap.get(g.id) ?? 0n;
    if (g.currency === 'CAD') goalsTotal += s;
    else if (rateMicro != null) {
      goalsTotal += toCadMinor(s, rateMicro);
      goalsApprox = true;
    } else goalsIncomplete = true;
  }

  const byNext = <T extends FixedCost | Income>(
    list: T[],
  ): Array<{ row: T; next: string | null }> =>
    list
      .map((row) => ({ row, next: nextOccurrence(row, today) }))
      .sort(
        (a, b) =>
          (a.next ?? '9999').localeCompare(b.next ?? '9999') ||
          a.row.name.localeCompare(b.row.name),
      );
  const fixedRows = byNext(fixedCosts);
  const incomeRows = byNext(incomes);
  const fixedSum = monthlyCadTotal(fixedCosts, rateMicro, today);
  const incomeSum = monthlyCadTotal(incomes, rateMicro, today);

  const amountView = (a: { amountMinor: number; currency: 'CAD' | 'EUR' }) =>
    amountWithOriginal(a.amountMinor, a.currency, rateMicro, locale);
  const sub = (row: FixedCost | Income, next: string | null, who?: string) =>
    [who, repeatLabel(row), next ? dueLabel(next, today, locale) : t('plan.ended')]
      .filter(Boolean)
      .join(' · ');

  return (
    <>
      <PageHeader title={t('plan.title')} showMeta={!desktop} />
      <div className={styles.tabRow}>
        <PlanTabs current="list" />
        <button
          type="button"
          className={styles.newBtn}
          aria-haspopup="dialog"
          onClick={() => setAdding(true)}
        >
          {t('plan.new')}
        </button>
      </div>
      <div className={styles.stack}>
        <section aria-labelledby="pl-goals">
          <div className={styles.sectionHead}>
            <h2 id="pl-goals" className={styles.sectionTitle}>
              {t('plan.section.goals')}
            </h2>
            {goals.length > 0 ? (
              <span className={`${styles.sectionSum} num`}>
                {(() => {
                  const total = t('plan.goals.total', {
                    amount: formatMoney(goalsTotal, 'CAD', locale),
                  });
                  return goalsApprox ? formatApprox(total) : total;
                })()}
              </span>
            ) : null}
          </div>
          {goals.length === 0 ? (
            <EmptyState title={t('plan.goals.empty.title')} text={t('plan.goals.empty.text')} />
          ) : (
            <ul className={`${styles.plain} ${styles.stackList}`}>
              {goals.map((g) => {
                const s = savedMap.get(g.id) ?? 0n;
                const dev = planDeviation(g, s, today);
                return (
                  <li key={g.id}>
                    <Card radius="list">
                      <Link to={`/ziel/${g.id}`} className={styles.goalLink}>
                        <GoalCardBody goal={g} savedMinor={s} dev={dev} today={today} />
                      </Link>
                      {g.conflict ? (
                        <div className={styles.badgeWrap}>
                          <ConflictBadge entity="goal" rowId={g.id} />
                        </div>
                      ) : null}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {goalsIncomplete ? <p className={styles.hint}>{t('plan.partial')}</p> : null}

        {archived.length > 0 ? (
          <section aria-labelledby="pl-archived">
            <div className={styles.sectionHead}>
              <h2 id="pl-archived" className={styles.sectionTitle}>
                {t('plan.section.archived')}
              </h2>
            </div>
            <Card radius="list">
              <ul className={styles.plain}>
                {archived.map((g) => (
                  <li key={g.id} className={styles.item}>
                    <Link to={`/ziel/${g.id}`} className={styles.rowLink}>
                      <CategoryTile icon={g.icon} color={g.color} />
                      <span className={styles.rowText}>
                        <span className={styles.rowTitle}>{g.name}</span>
                      </span>
                    </Link>
                    {g.conflict ? (
                      <div className={styles.badgeWrap}>
                        <ConflictBadge entity="goal" rowId={g.id} />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ) : null}

        <section aria-labelledby="pl-fixed">
          <div className={styles.sectionHead}>
            <h2 id="pl-fixed" className={styles.sectionTitle}>
              {t('plan.section.fixed')}
            </h2>
            {fixedRows.length > 0 ? (
              <span className={`${styles.sectionSum} num`}>
                {perMonthLabel(fixedSum.total, locale)}
              </span>
            ) : null}
          </div>
          {fixedRows.length === 0 ? (
            <EmptyState title={t('plan.fixed.empty.title')} text={t('plan.fixed.empty.text')} />
          ) : (
            <Card radius="list">
              <ul className={styles.plain}>
                {fixedRows.map(({ row, next }) => {
                  const cat = categories.find((c) => c.id === row.categoryId);
                  const v = amountView(row);
                  return (
                    <li key={row.id} className={styles.item}>
                      <Link to={`/fixkosten/${row.id}`} className={styles.rowLink}>
                        <CategoryTile
                          icon={cat?.icon ?? 'sonstiges'}
                          color={cat?.color ?? 'var(--seg-other)'}
                        />
                        <span className={styles.rowText}>
                          <span className={styles.rowTitle}>{row.name}</span>
                          <span className={styles.rowSub}>
                            {sub(row, next)}
                            {row.isSaving ? (
                              <span className={styles.tag}>{t('plan.saving')}</span>
                            ) : null}
                            {row.autobook ? (
                              <span className={styles.tag}>{t('plan.autobook')}</span>
                            ) : null}
                          </span>
                        </span>
                        <span className={styles.amounts}>
                          <span className={`${styles.amount} num`}>
                            {v.cad ? (v.approximate ? formatApprox(v.cad) : v.cad) : v.eur}
                          </span>
                          {v.cad && v.eur ? (
                            <span className={`${styles.orig} num`}>{v.eur}</span>
                          ) : null}
                        </span>
                      </Link>
                      {row.conflict ? (
                        <div className={styles.badgeWrap}>
                          <ConflictBadge entity="fixedCost" rowId={row.id} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {fixedSum.incomplete ? <p className={styles.hint}>{t('plan.partial')}</p> : null}
        </section>

        <section aria-labelledby="pl-income">
          <div className={styles.sectionHead}>
            <h2 id="pl-income" className={styles.sectionTitle}>
              {t('plan.section.income')}
            </h2>
            {incomeRows.length > 0 ? (
              <span className={`${styles.sectionSum} num`}>
                {perMonthLabel(incomeSum.total, locale)}
              </span>
            ) : null}
          </div>
          {incomeRows.length === 0 ? (
            <EmptyState title={t('plan.income.empty.title')} text={t('plan.income.empty.text')} />
          ) : (
            <Card radius="list">
              <ul className={styles.plain}>
                {incomeRows.map(({ row, next }) => {
                  const v = amountView(row);
                  const who = row.memberId ? memberName(household.members, row.memberId) : '';
                  return (
                    <li key={row.id} className={styles.item}>
                      <Link to={`/einnahme/${row.id}`} className={styles.rowLink}>
                        <span className={styles.rowText}>
                          <span className={styles.rowTitle}>{row.name}</span>
                          <span className={styles.rowSub}>{sub(row, next, who)}</span>
                        </span>
                        <span className={styles.amounts}>
                          <span className={`${styles.amount} ${styles.income} num`}>
                            <span className={styles.srOnly}>{t('plan.incomeLabel')}: </span>+{' '}
                            {v.cad ? (v.approximate ? formatApprox(v.cad) : v.cad) : v.eur}
                          </span>
                          {v.cad && v.eur ? (
                            <span className={`${styles.orig} num`}>{v.eur}</span>
                          ) : null}
                        </span>
                      </Link>
                      {row.conflict ? (
                        <div className={styles.badgeWrap}>
                          <ConflictBadge entity="income" rowId={row.id} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {incomeSum.incomplete ? <p className={styles.hint}>{t('plan.partial')}</p> : null}
        </section>
      </div>

      <BottomSheet open={adding} title={t('plan.add.title')} onClose={() => setAdding(false)}>
        <div className={styles.sheetChoices}>
          {(
            [
              ['plan.add.goal', '/ziel/neu'],
              ['plan.add.fixed', '/fixkosten/neu'],
              ['plan.add.income', '/einnahme/neu'],
            ] as const
          ).map(([key, to]) => (
            <Button
              key={to}
              variant="secondary"
              onClick={() => {
                setAdding(false);
                void navigate(to);
              }}
            >
              {t(key)}
            </Button>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
