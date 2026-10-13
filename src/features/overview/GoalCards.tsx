import { Link } from 'react-router';
import { useContributions, useGoals } from '../../data/repos';
import { activeGoals, planDeviation, progress, savedByGoal } from '../../domain/goals';
import { formatMoney } from '../../i18n/format';
import { getLocale, t } from '../../i18n/t';
import { CheckIcon, WarnIcon } from '../../icons/ui-icons';
import { CategoryTile, ProgressBar } from '../../ui';
import { goalStatusView } from '../shared/plan-format';
import styles from './GoalCards.module.css';
import sectionStyles from './OverviewPage.module.css';

/** Bis zu drei aktive Sparziele als Karten. Ohne Ziele entfällt der Abschnitt. */
export function GoalCards({ today }: { today: string }) {
  const locale = getLocale();
  const goals = activeGoals(useGoals())
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate) || a.id.localeCompare(b.id))
    .slice(0, 3);
  const saved = savedByGoal(useContributions());
  if (goals.length === 0) return null;
  return (
    <section className={sectionStyles.section} aria-labelledby="goals-title">
      <div className={sectionStyles.sectionHead}>
        <h2 id="goals-title" className="type-title2">
          {t('overview.goals.title')}
        </h2>
        <Link to="/planung" className={sectionStyles.link}>
          {t('overview.goals.all')}
        </Link>
      </div>
      <ul className={styles.grid}>
        {goals.map((g) => {
          const have = saved.get(g.id) ?? 0n;
          const pct = progress(g, have);
          const view = goalStatusView(planDeviation(g, have, today).status);
          const warn = view.variant === 'warn';
          return (
            <li key={g.id} className={styles.cell}>
              <Link to={`/ziel/${g.id}`} className={styles.card}>
                <CategoryTile icon={g.icon} color={g.color} size={32} />
                <span className={styles.name}>{g.name}</span>
                <ProgressBar value={pct} label={g.name} tone="cat" color={g.color} height={6} />
                <span className={`${styles.of} num`}>
                  {t('overview.goals.of', {
                    pct,
                    target: formatMoney(g.targetMinor, g.currency, locale),
                  })}
                </span>
                <span className={`${styles.status} ${warn ? styles.warn : ''}`}>
                  {warn ? (
                    <WarnIcon size={14} />
                  ) : view.variant === 'ok' ? (
                    <CheckIcon size={14} />
                  ) : null}
                  {t(view.key)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
