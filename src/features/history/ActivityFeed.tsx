import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { db, getMeta, setMeta } from '../../data/db';
import { useCategories, useEntryEvents } from '../../data/repos';
import { useReadySession } from '../../data/use-session';
import { type ActivityItem, buildActivity, isNewActivity } from '../../domain/activity';
import type { Currency } from '../../domain/money';
import { formatMoney } from '../../i18n/format';
import { getLocale, t } from '../../i18n/t';
import { Avatar, Card } from '../../ui';
import { dayLabel, dayOfMs, memberName, todayIso } from '../shared/helpers';
import styles from './ActivityFeed.module.css';

const FIELD_KEYS = {
  amountMinor: 'field.amountMinor',
  currency: 'field.currency',
  bookedOn: 'field.bookedOn',
  categoryId: 'field.categoryId',
  paidBy: 'field.paidBy',
  merchant: 'field.merchant',
  note: 'field.note',
} as const;

/** Text zu einem Aktivitätseintrag, ohne Rohdaten außerhalb der Felder. */
export function activityText(
  item: ActivityItem,
  authorName: string,
  names: { category: (id: string) => string; person: (id: string) => string },
): string {
  const locale = getLocale();
  const money = (minor: number) => formatMoney(minor, item.currency as Currency, locale);
  const merchant = item.merchant || t('activity.unnamed');
  const name = authorName || t('activity.someone');
  switch (item.kind) {
    case 'added':
      return item.merchant
        ? t('activity.added', { name, merchant, amount: money(item.amountMinor) })
        : t('activity.addedNoMerchant', { name, amount: money(item.amountMinor) });
    case 'amountChanged': {
      const c = item.changes.find((x) => x.field === 'amountMinor');
      return t('activity.amountChanged', {
        name,
        from: money(Number(c?.from ?? 0)),
        to: money(Number(c?.to ?? 0)),
      });
    }
    case 'edited': {
      const c = item.changes[0];
      if (item.changes.length === 1 && c && c.field in FIELD_KEYS) {
        const show = (v: unknown): string => {
          if (v === undefined || v === '') return t('field.empty');
          if (c.field === 'categoryId') return names.category(String(v));
          if (c.field === 'paidBy') return names.person(String(v));
          return String(v);
        };
        return t('activity.fieldChanged', {
          name,
          field: t(FIELD_KEYS[c.field as keyof typeof FIELD_KEYS]),
          from: show(c.from),
          to: show(c.to),
        });
      }
      return t('activity.edited', { name, merchant });
    }
    case 'deleted':
      return t('activity.deleted', { name, merchant });
    case 'restored':
      return t('activity.restored', { name, merchant });
  }
}

export function ActivityFeed() {
  const locale = getLocale();
  const { household, userId } = useReadySession();
  const events = useEntryEvents();
  const categories = useCategories();
  const [seen, setSeen] = useState<string | null | undefined>(undefined);
  const feed = buildActivity(events);
  const latest = useRef<string | null>(null);
  latest.current = feed[0]?.hlc ?? null;

  useEffect(() => {
    let alive = true;
    void getMeta<string>('activitySeen', db).then((v) => alive && setSeen(v ?? null));
    return () => {
      alive = false;
      // Beim Verlassen gelten alle bisherigen Einträge als gesehen.
      if (latest.current) void setMeta('activitySeen', latest.current, db);
    };
  }, []);

  const today = todayIso();
  const days = new Map<string, ActivityItem[]>();
  for (const item of feed) {
    const day = dayOfMs(item.at);
    days.set(day, [...(days.get(day) ?? []), item]);
  }

  if (feed.length === 0) return <p className={styles.empty}>{t('activity.empty')}</p>;

  return (
    <>
      {[...days].map(([day, items]) => (
        <section key={day} className={styles.day} aria-label={dayLabel(day, today, locale)}>
          <h2 className={styles.dayHead}>{dayLabel(day, today, locale)}</h2>
          <Card className={styles.list}>
            {items.map((item) => {
              const member = household.members.find((m) => m.userId === item.author);
              const isNew = seen !== undefined && isNewActivity(item, userId, seen);
              return (
                <Link key={item.id} to={`/eintrag/${item.entryId}`} className={styles.item}>
                  <Avatar
                    name={member?.displayName ?? '?'}
                    color={member?.color ?? '#7F7569'}
                    size={32}
                  />
                  <span className={styles.text}>
                    {activityText(item, memberName(household.members, item.author), {
                      category: (id) => categories.find((c) => c.id === id)?.name ?? '',
                      person: (id) => memberName(household.members, id),
                    })}
                  </span>
                  {isNew ? <span className={styles.badge}>{t('activity.new')}</span> : null}
                </Link>
              );
            })}
          </Card>
        </section>
      ))}
    </>
  );
}
