import { Link } from 'react-router';
import { PageHeader } from '../../app/PageHeader';
import { useBudgets, useCategories, useEntries, useFixedCosts } from '../../data/repos';
import { useReadySession } from '../../data/use-session';
import { monthSummary } from '../../domain/budget';
import { monthOf } from '../../domain/model';
import { formatMoney, formatMonth } from '../../i18n/format';
import { getLocale, t, useLang } from '../../i18n/t';
import { CheckIcon, WarnIcon } from '../../icons/ui-icons';
import { useEntryRate } from '../../platform/use-fx';
import { useMedia } from '../../platform/use-media';
import { Card, ProgressBar } from '../../ui';
import { BudgetRowView } from '../shared/BudgetRowView';
import { EntryRow } from '../shared/EntryRow';
import { todayIso } from '../shared/helpers';
import { DueNext } from './DueNext';
import { hasSplitData } from './donut-model';
import { GoalCards } from './GoalCards';
import { IncomeDonutChart, IncomeLegend, useIncomeSplit } from './IncomeDonut';
import styles from './OverviewPage.module.css';

export function OverviewPage() {
  useLang();
  const locale = getLocale();
  const desktop = useMedia('(min-width: 1024px)');
  const { household } = useReadySession();
  const categories = useCategories();
  const budgets = useBudgets();
  const entries = useEntries();
  const today = todayIso();
  const fixedCosts = useFixedCosts();
  const provider = household.settings.fxProvider;
  const todayRate = useEntryRate('EUR', today, provider).rate;
  const split = useIncomeSplit(entries, today, todayRate);
  const showSplit = split !== null && hasSplitData(split);
  const month = monthOf(today);
  const live = entries.filter((e) => !e.deleted);
  const summary = monthSummary({ categories, budgets, entries, month, today });
  const recent = [...live]
    .sort((a, b) =>
      a.bookedOn === b.bookedOn ? (a.hlc < b.hlc ? 1 : -1) : a.bookedOn < b.bookedOn ? 1 : -1,
    )
    .slice(0, 5);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const hasBudgets = summary.totalLimit > 0n;
  const place = household.settings.placeLabel;

  const steps = [
    { key: 'categories', done: categories.length > 0, to: '/kategorien' },
    { key: 'budgets', done: hasBudgets, to: '/budgets' },
    { key: 'entry', done: live.length > 0, to: '/erfassen' },
  ] as const;
  const onboarding = steps.some((s) => !s.done) && live.length === 0;

  const pct = hasBudgets ? Number((summary.totalSpent * 100n) / summary.totalLimit) : 0;
  const stateWarn = summary.state === 'near' || summary.state === 'over';

  return (
    <>
      <PageHeader title={formatMonth(month, locale)} showMeta={!desktop} />
      <div className={styles.stack}>
        {onboarding ? (
          <Card className={styles.card}>
            <section className={styles.welcome} aria-labelledby="welcome-title">
              <h2 id="welcome-title" className="type-title2">
                {place ? t('onboarding.welcomePlace', { place }) : t('onboarding.welcome')}
              </h2>
              <p className={styles.muted}>{t('onboarding.intro')}</p>
              <ol className={styles.steps}>
                {steps.map((s, i) => (
                  <li key={s.key} className={styles.step}>
                    <span className={`${styles.badge} ${s.done ? styles.badgeDone : ''}`}>
                      {s.done ? <CheckIcon size={16} /> : i + 1}
                    </span>
                    <span className={styles.stepText}>{t(`onboarding.step.${s.key}`)}</span>
                    {s.done ? (
                      <span className={styles.muted}>{t('onboarding.done')}</span>
                    ) : (
                      <Link to={s.to} className={styles.stepLink}>
                        {t('onboarding.go')}
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          </Card>
        ) : null}

        {hasBudgets ? (
          <Card className={styles.card}>
            <section className={styles.hero} aria-label={t('overview.available')}>
              <div className={styles.heroTop}>
                <span className={styles.muted}>{t('overview.available')}</span>
                <span className={`${styles.pill} ${stateWarn ? styles.pillWarn : styles.pillOk}`}>
                  {stateWarn ? <WarnIcon size={14} /> : <CheckIcon size={14} />}
                  {t(`overview.state.${summary.state === 'none' ? 'ok' : summary.state}`)}
                </span>
              </div>
              <div className={styles.heroMain}>
                <div className={`${styles.big} ${showSplit ? styles.bigWithChart : ''} num`}>
                  {formatMoney(summary.remaining, 'CAD', locale)}
                </div>
                {showSplit ? <IncomeDonutChart split={split} /> : null}
              </div>
              <ProgressBar
                value={pct}
                label={t('overview.available')}
                tone={stateWarn ? 'warn' : 'acc'}
              />
              <div className={`${styles.heroMeta} num`}>
                <span>
                  {t('overview.spentOf', {
                    spent: formatMoney(summary.totalSpent, 'CAD', locale),
                    limit: formatMoney(summary.totalLimit, 'CAD', locale),
                  })}
                </span>
                <span>
                  {summary.daysLeft === 1
                    ? t('overview.daysLeft.one')
                    : t('overview.daysLeft', { count: summary.daysLeft })}
                </span>
              </div>
              <div className={styles.perDay}>
                <span className={styles.muted}>{t('overview.perDay')}</span>
                <strong className="num">{formatMoney(summary.perDay, 'CAD', locale)}</strong>
              </div>
              {showSplit ? (
                <div className={styles.perDay}>
                  <span className={styles.muted}>{t('donut.title')}</span>
                  <IncomeLegend split={split} />
                </div>
              ) : null}
            </section>
          </Card>
        ) : showSplit ? (
          <Card className={styles.card}>
            <section className={styles.hero} aria-label={t('donut.title')}>
              <div className={styles.heroMain}>
                <span className={styles.donutTitle}>{t('donut.title')}</span>
                <IncomeDonutChart split={split} />
              </div>
              <IncomeLegend split={split} />
            </section>
          </Card>
        ) : null}

        <section className={styles.section} aria-labelledby="budgets-title">
          <div className={styles.sectionHead}>
            <h2 id="budgets-title" className="type-title2">
              {t('overview.budgets')}
            </h2>
            <Link to="/budgets" className={styles.link}>
              {summary.rows.length > 0
                ? t('overview.allBudgets', { count: summary.rows.length })
                : t('overview.setBudgets')}
            </Link>
          </div>
          {summary.rows.length > 0 ? (
            <Card className={styles.list}>
              {summary.rows.slice(0, 5).map((row) => (
                <BudgetRowView key={row.category.id} row={row} />
              ))}
            </Card>
          ) : (
            <p className={styles.muted}>{t('overview.noBudgets')}</p>
          )}
        </section>

        <GoalCards today={today} />

        <DueNext
          fixedCosts={fixedCosts}
          entries={entries}
          categories={categories}
          members={household.members}
          displayRate={todayRate}
          provider={provider}
          today={today}
        />

        <section className={styles.section} aria-labelledby="recent-title">
          <div className={styles.sectionHead}>
            <h2 id="recent-title" className="type-title2">
              {t('overview.recent')}
            </h2>
            <Link to="/verlauf" className={styles.link}>
              {t('overview.history')}
            </Link>
          </div>
          {recent.length > 0 ? (
            <Card className={styles.list}>
              {recent.map((e) => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  category={byId.get(e.categoryId)}
                  members={household.members}
                />
              ))}
            </Card>
          ) : (
            <Card className={styles.list}>
              <div className={styles.emptyRow}>
                <strong>{t('onboarding.noEntries')}</strong>
                <span className={styles.muted}>{t('onboarding.noEntriesHint')}</span>
              </div>
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
