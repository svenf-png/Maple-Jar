import { useMemo } from 'react';
import { PageHeader } from '../../app/PageHeader';
import { useProjectionInput } from '../../data/projection-input';
import { useScenario } from '../../data/repos';
import { useReadySession } from '../../data/use-session';
import { monthOf } from '../../domain/model';
import { compareScenario } from '../../domain/scenario';
import { isScenarioActive } from '../../domain/scenario-view';
import { formatApprox, formatMoney, formatMonth } from '../../i18n/format';
import { getLocale, t, useLang } from '../../i18n/t';
import { InfoIcon, WarnIcon } from '../../icons/ui-icons';
import { useEntryRate } from '../../platform/use-fx';
import { useMedia } from '../../platform/use-media';
import { Card } from '../../ui';
import { PlanTabs } from '../planning/PlanTabs';
import { todayIso } from '../shared/helpers';
import { CashflowTable } from './CashflowTable';
import { ProjectionChart } from './ProjectionChart';
import styles from './ProjectionPage.module.css';
import { signedMoney } from './projection-format';
import { ScenarioPanel } from './ScenarioPanel';

type NoteKey = 'proj.basis.budget' | 'proj.basis.none' | 'proj.approx';

/** Projektion des Haushaltszeitraums mit Diagramm, Cashflow-Tabelle und Szenario-Panel. */
export function ProjectionPage() {
  useLang();
  const locale = getLocale();
  const desktop = useMedia('(min-width: 1024px)');
  const { household } = useReadySession();
  const today = todayIso();
  const rate = useEntryRate('EUR', today, household.settings.fxProvider).rate;
  const input = useProjectionInput(rate);
  const scenario = useScenario();
  const scenarioActive = isScenarioActive(scenario);
  const cmp = useMemo(
    () => (input ? compareScenario(input, scenario ?? { categoryPct: {}, extras: [] }) : null),
    [input, scenario],
  );

  const notes: Array<{ key: NoteKey; tone: 'info' | 'warn' }> = [];
  let endText = '';
  if (cmp) {
    const { base } = cmp;
    if (base.variableBasis === 'budget') notes.push({ key: 'proj.basis.budget', tone: 'info' });
    if (base.variableBasis === 'none') notes.push({ key: 'proj.basis.none', tone: 'warn' });
    if (base.approximate) notes.push({ key: 'proj.approx', tone: 'info' });
    const money = formatMoney(base.endCadMinor, 'CAD', locale);
    endText = base.approximate ? formatApprox(money) : money;
  }

  return (
    <>
      <PageHeader title={t('plan.title')} showMeta={!desktop} />
      <div className={styles.page}>
        <PlanTabs current="projection" />
        {cmp ? (
          <div className={styles.layout}>
            <div className={styles.main}>
              <Card radius="hero" className={styles.hero}>
                <span className={styles.heroLabel}>
                  {t('proj.end', {
                    month: formatMonth(monthOf(household.settings.periodEnd), locale),
                  })}
                </span>
                <span className={`${styles.heroAmount} num`}>{endText}</span>
                <span className={styles.heroNote}>{t('proj.endNote')}</span>
                {scenarioActive ? (
                  <div
                    className={`${styles.diff} ${cmp.diffEndCadMinor >= 0n ? styles.diffUp : styles.diffDown}`}
                  >
                    <span>
                      {t('proj.diff', {
                        month: formatMonth(monthOf(household.settings.periodEnd), locale),
                      })}
                    </span>
                    <span className={`${styles.diffValue} num`}>
                      {signedMoney(cmp.diffEndCadMinor, locale)}
                    </span>
                  </div>
                ) : null}
                <ProjectionChart base={cmp.base} scenario={scenarioActive ? cmp.scenario : null} />
              </Card>
              {notes.length > 0 ? (
                <ul className={styles.notes}>
                  {notes.map((n) => (
                    <li
                      key={n.key}
                      className={`${styles.note} ${n.tone === 'warn' ? styles.warn : styles.info}`}
                    >
                      {n.tone === 'warn' ? <WarnIcon size={18} /> : <InfoIcon size={18} />}
                      <span>{t(n.key)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <Card radius="list" className={styles.tableCard}>
                <CashflowTable
                  months={scenarioActive ? cmp.scenario.months : cmp.base.months}
                  caption={scenarioActive ? t('proj.table.titleScenario') : t('proj.table.title')}
                />
              </Card>
            </div>
            <div className={styles.side}>
              <ScenarioPanel
                scenario={scenario}
                base={cmp.base}
                period={{
                  periodStart: household.settings.periodStart,
                  periodEnd: household.settings.periodEnd,
                }}
                today={today}
              />
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
