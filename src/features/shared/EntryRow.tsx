import { Link } from 'react-router';
import type { HouseholdMember } from '../../data/household';
import { type Category, type Entry, entryCad } from '../../domain/model';
import { formatMoney } from '../../i18n/format';
import { getLocale, t } from '../../i18n/t';
import { CalendarIcon, InfoIcon } from '../../icons/ui-icons';
import { CategoryTile } from '../../ui';
import styles from './EntryRow.module.css';
import { memberName } from './helpers';

interface Props {
  entry: Entry;
  category: Category | undefined;
  members: readonly HouseholdMember[];
}

/** Zeile für Übersicht und Verlauf: Hauptbetrag in CAD, Originalbetrag in EUR darunter. */
export function EntryRow({ entry, category, members }: Props) {
  const locale = getLocale();
  const fixed = entry.source === 'fixed';
  // Die Plan-Texte laden die Routen (Übersicht, Verlauf) vor dem Rendern; fehlen sie, entfällt die Marke.
  const fixedLabel = fixed ? t('fixed.badge') : '';
  const title = entry.merchant || category?.name || '';
  const sub = [category?.name, memberName(members, entry.paidBy)].filter(Boolean).join(' · ');
  return (
    <Link to={`/eintrag/${entry.id}`} className={styles.row}>
      <CategoryTile icon={category?.icon ?? 'sonstiges'} color={category?.color ?? '#7F7569'} />
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        <span className={styles.sub}>
          {sub}
          {fixed && fixedLabel !== 'fixed.badge' ? (
            <span className={styles.fixed}>
              <CalendarIcon size={14} />
              {fixedLabel}
            </span>
          ) : null}
          {entry.conflict ? (
            <span className={styles.conflict}>
              <InfoIcon size={14} />
              {t('history.conflict')}
            </span>
          ) : null}
        </span>
      </span>
      <span className={styles.amounts}>
        <span className={`${styles.amount} num`}>
          {formatMoney(entryCad(entry), 'CAD', locale)}
        </span>
        {entry.currency === 'EUR' ? (
          <span className={`${styles.orig} num`}>
            {formatMoney(entry.amountMinor, 'EUR', locale)}
            {entry.fxProvisional ? ` · ${t('history.provisional')}` : ''}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
