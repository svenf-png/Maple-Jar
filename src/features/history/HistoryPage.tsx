import { lazy, Suspense, useMemo, useState } from 'react';
import { PageHeader } from '../../app/PageHeader';
import { deleteEntry, restoreEntry } from '../../data/actions';
import { db } from '../../data/db';
import { usePendingRows } from '../../data/pending';
import { useCategories, useEntries } from '../../data/repos';
import { useReadySession } from '../../data/use-session';
import { filterEntries, groupByDay, type Period } from '../../domain/history';
import { formatMoney } from '../../i18n/format';
import { getLocale, t, useLang } from '../../i18n/t';
import { SearchIcon } from '../../icons/ui-icons';
import { useMedia } from '../../platform/use-media';
import { Card, Segmented, SwipeRow, useToast } from '../../ui';
import { EntryRow } from '../shared/EntryRow';
import { dayLabel, todayIso } from '../shared/helpers';
import { ActivityFeed } from './ActivityFeed';
import styles from './HistoryPage.module.css';

// Tabelle nur für Desktop: nicht im initialen Bundle.
const HistoryTable = lazy(async () => ({
  default: (await import('./HistoryTable')).HistoryTable,
}));

type Tab = 'entries' | 'activity';

export function HistoryPage() {
  useLang();
  const locale = getLocale();
  const toast = useToast();
  const desktop = useMedia('(min-width: 1024px)');
  const { household } = useReadySession();
  const pendingRows = usePendingRows();
  const categories = useCategories();
  const entries = useEntries();
  const [tab, setTab] = useState<Tab>('entries');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [personId, setPersonId] = useState('');
  const [period, setPeriod] = useState<Period>('month');
  const today = todayIso();

  const filtered = useMemo(
    () =>
      filterEntries(
        entries,
        categories,
        { query, categoryId: categoryId || null, personId: personId || null, period },
        today,
      ),
    [entries, categories, query, categoryId, personId, period, today],
  );
  const groups = useMemo(() => groupByDay(filtered), [filtered]);
  const byId = new Map(categories.map((c) => [c.id, c]));

  async function remove(id: string) {
    await deleteEntry(db, id);
    toast(t('history.deleted'), {
      label: t('history.undo'),
      onClick: () => {
        void restoreEntry(db, id);
      },
    });
  }

  return (
    <>
      <PageHeader title={t('history.title')} showMeta={!desktop} />
      <div className={styles.stack}>
        <Segmented
          label={t('history.tabs')}
          value={tab}
          options={[
            { value: 'entries', label: t('history.tab.entries') },
            { value: 'activity', label: t('history.tab.activity') },
          ]}
          onChange={setTab}
        />
        {tab === 'activity' ? (
          <ActivityFeed />
        ) : (
          <>
            <label className={styles.search}>
              <SearchIcon size={18} />
              <input
                type="search"
                placeholder={t('history.search')}
                aria-label={t('history.search')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className={styles.filters}>
              <select
                aria-label={t('history.filter.period')}
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
              >
                <option value="month">{t('history.period.month')}</option>
                <option value="last">{t('history.period.last')}</option>
                <option value="all">{t('history.period.all')}</option>
              </select>
              <select
                aria-label={t('history.filter.category')}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">{t('history.filter.category')}</option>
                {categories
                  .filter((c) => !c.deleted)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <select
                aria-label={t('history.filter.person')}
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
              >
                <option value="">{t('history.filter.person')}</option>
                {household.members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
            {groups.length === 0 ? (
              <p className={styles.empty}>{t('history.empty')}</p>
            ) : desktop ? (
              <Suspense fallback={null}>
                <HistoryTable
                  entries={filtered}
                  categories={categories}
                  members={household.members}
                  onDelete={remove}
                />
              </Suspense>
            ) : (
              groups.map((g) => (
                <section
                  key={g.day}
                  className={styles.day}
                  aria-label={dayLabel(g.day, today, locale)}
                >
                  <div className={`${styles.dayHead} num`}>
                    <span>{dayLabel(g.day, today, locale)}</span>
                    <span>{formatMoney(g.total, 'CAD', locale)}</span>
                  </div>
                  <Card className={styles.list}>
                    {g.entries.map((e) => (
                      <SwipeRow
                        key={e.id}
                        actionLabel={t('history.delete')}
                        onAction={() => void remove(e.id)}
                      >
                        <EntryRow
                          entry={e}
                          category={byId.get(e.categoryId)}
                          members={household.members}
                          pending={pendingRows.has(`entry:${e.id}`)}
                        />
                      </SwipeRow>
                    ))}
                  </Card>
                </section>
              ))
            )}
          </>
        )}
      </div>
    </>
  );
}
