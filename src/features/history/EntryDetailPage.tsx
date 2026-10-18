import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { deleteEntry, restoreEntry } from '../../data/actions';
import { db } from '../../data/db';
import { useCategories, useEntries, useEntryEvents, useFixedCosts } from '../../data/repos';
import { useReadySession } from '../../data/use-session';
import { entryHistory } from '../../domain/activity';
import { entryCad } from '../../domain/model';
import { formatDay, formatMoney, formatRate } from '../../i18n/format';
import { loadPlanMessages } from '../../i18n/plan-messages';
import { getLocale, t, useLang } from '../../i18n/t';
import { InfoIcon, TrashIcon, WarnIcon } from '../../icons/ui-icons';
import { Button, Card, CategoryTile, ListRow, useToast } from '../../ui';
import { useConflictDialog } from '../conflict/use-conflict-dialog';
import { dayLabel, dayOfMs, memberName, todayIso } from '../shared/helpers';
import { activityText } from './ActivityFeed';
import styles from './EntryDetailPage.module.css';

export function EntryDetailPage() {
  useLang();
  const locale = getLocale();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { household } = useReadySession();
  const entries = useEntries();
  const categories = useCategories();
  const events = useEntryEvents();
  const entry = entries.find((e) => e.id === id);
  const category = categories.find((c) => c.id === entry?.categoryId);
  const fixedCosts = useFixedCosts();
  const fixedCost = fixedCosts.find((f) => f.id === entry?.fixedCostId);
  const conflictDialog = useConflictDialog('entry', id);
  // Die Texte für Konflikt und Fixkosten-Verweis liegen im Planungs-Paket (lazy).
  const needsPlan = Boolean(entry?.conflict || entry?.source === 'fixed');
  const [planReady, setPlanReady] = useState(false);
  useEffect(() => {
    if (needsPlan) void loadPlanMessages().then(() => setPlanReady(true));
  }, [needsPlan]);

  if (!entry) {
    return (
      <div className={styles.page}>
        <Link to="/verlauf" className={styles.back}>
          {t('detail.back')}
        </Link>
        <p className={styles.muted}>{t('detail.notFound')}</p>
      </div>
    );
  }

  const cad = entryCad(entry);
  const history = entryHistory(events, entry.id);
  const today = todayIso();
  const approx =
    entry.currency === 'CAD'
      ? null
      : t('detail.rate', {
          amount: formatMoney(entry.amountMinor, 'EUR', locale),
          rate: formatRate(BigInt(entry.fxRateMicro), locale),
          date: formatDay(entry.fxRateDate, locale, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          }),
        });

  async function remove() {
    if (!entry) return;
    await deleteEntry(db, entry.id);
    toast(t('history.deleted'), {
      label: t('history.undo'),
      onClick: () => {
        void restoreEntry(db, entry.id);
      },
    });
    void navigate('/verlauf', { replace: true });
  }

  return (
    <div className={styles.page}>
      <div className={styles.bar}>
        <Link to="/verlauf" className={styles.back}>
          {t('detail.back')}
        </Link>
        {!entry.deleted ? (
          <Link to={`/eintrag/${entry.id}/bearbeiten`} className={styles.back}>
            {t('detail.edit')}
          </Link>
        ) : null}
      </div>
      <h1 className={styles.visuallyHidden}>{t('detail.title')}</h1>

      <section className={styles.hero}>
        <CategoryTile
          icon={category?.icon ?? 'sonstiges'}
          color={category?.color ?? '#7F7569'}
          size={56}
        />
        <span className={styles.merchant}>{entry.merchant || category?.name}</span>
        <span className={`${styles.amount} num`}>{formatMoney(cad, 'CAD', locale)}</span>
        {approx ? <span className={`${styles.muted} num`}>{approx}</span> : null}
        {entry.fxProvisional ? (
          <span className={styles.warn}>
            <WarnIcon size={14} />
            {t('detail.provisional')}
          </span>
        ) : null}
      </section>

      {entry.deleted ? (
        <div className={styles.banner}>
          <WarnIcon size={18} />
          <span>{t('detail.deletedBanner')}</span>
          <Button variant="secondary" onClick={() => void restoreEntry(db, entry.id)}>
            {t('detail.restore')}
          </Button>
        </div>
      ) : null}
      {entry.conflict ? (
        <div className={styles.conflict} role="note">
          <InfoIcon size={18} />
          <span>
            <strong>{t('history.conflict')}</strong> {t('detail.conflictText')}
          </span>
          {planReady ? (
            <Button variant="secondary" onClick={() => void conflictDialog.show()}>
              {t('conflict.title')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {conflictDialog.dialog}
      {planReady && entry.source === 'fixed' && fixedCost ? (
        <Link to={`/fixkosten/${fixedCost.id}`} className={styles.back}>
          {t('conflict.fromFixed', { name: fixedCost.name })}
        </Link>
      ) : null}

      <Card className={styles.card}>
        <ListRow title={t('detail.category')} right={category?.name ?? ''} />
        <ListRow
          title={t('detail.date')}
          right={formatDay(entry.bookedOn, locale, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        />
        <ListRow title={t('detail.paidBy')} right={memberName(household.members, entry.paidBy)} />
        {entry.note ? <ListRow title={t('detail.note')} right={entry.note} /> : null}
      </Card>

      <p className={styles.muted}>
        {t('detail.createdBy', { name: memberName(household.members, entry.createdBy) })}
      </p>

      <section aria-labelledby="hist-title" className={styles.history}>
        <h2 id="hist-title" className="type-title2">
          {t('detail.history')}
        </h2>
        <Card className={styles.card}>
          {history.map((item) => (
            <div key={item.id} className={styles.histRow}>
              <span>
                {activityText(item, memberName(household.members, item.author), {
                  category: (cid) => categories.find((c) => c.id === cid)?.name ?? '',
                  person: (pid) => memberName(household.members, pid),
                })}
              </span>
              <span className={styles.muted}>{dayLabel(dayOfMs(item.at), today, locale)}</span>
            </div>
          ))}
        </Card>
      </section>

      {!entry.deleted ? (
        <Button variant="secondary" onClick={() => void remove()}>
          <span className={styles.delete}>
            <TrashIcon size={18} />
            {t('detail.delete')}
          </span>
        </Button>
      ) : null}
    </div>
  );
}
