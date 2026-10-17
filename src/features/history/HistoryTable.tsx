import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { updateEntry } from '../../data/actions';
import { db } from '../../data/db';
import type { HouseholdMember } from '../../data/household';
import { type SortDir, type SortKey, sortEntries } from '../../domain/history';
import { type Category, type Entry, entryCad } from '../../domain/model';
import { parseDecimalToMinor } from '../../domain/money';
import { formatDay, formatMoney } from '../../i18n/format';
import { getLocale, t, useLang } from '../../i18n/t';
import { CheckIcon, EditIcon, TrashIcon, WarnIcon } from '../../icons/ui-icons';
import { Card, CategoryTile, useToast } from '../../ui';
import { ConflictBadge } from '../conflict/ConflictBadge';
import { memberName, minorToInput } from '../shared/helpers';
import styles from './HistoryTable.module.css';

interface Props {
  entries: readonly Entry[];
  categories: readonly Category[];
  members: readonly HouseholdMember[];
  onDelete: (id: string) => void;
}

interface Draft {
  merchant: string;
  amount: string;
  categoryId: string;
}

/** Desktop-Verlauf als sortierbare Tabelle mit Tastatursteuerung und Inline-Bearbeitung. Lazy geladen. */
export function HistoryTable({ entries, categories, members, onDelete }: Props) {
  useLang();
  const locale = getLocale();
  const toast = useToast();
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ merchant: '', amount: '', categoryId: '' });
  const [invalid, setInvalid] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const merchantRef = useRef<HTMLInputElement>(null);
  const returnFocusId = useRef<string | null>(null);
  const busy = useRef(false);

  const sorted = useMemo(
    () => sortEntries(entries, sortKey, sortDir, locale),
    [entries, sortKey, sortDir, locale],
  );
  const byId = new Map(categories.map((c) => [c.id, c]));
  const choices = categories.filter((c) => !c.deleted);
  // Gelöschte Kategorie des Eintrags bleibt als Option sichtbar, sonst zeigt das Auswahlfeld einen falschen Wert.
  const editChoices = (categoryId: string): Category[] => {
    const current = byId.get(categoryId);
    return current?.deleted ? [...choices, current] : choices;
  };
  // Roving tabindex: die aktive Zeile ist die erste, solange nichts anderes gewählt wurde.
  const currentActive = sorted.some((e) => e.id === activeId) ? activeId : (sorted[0]?.id ?? null);

  // Fokus zurück auf die Zeile nach Speichern oder Abbrechen.
  useEffect(() => {
    if (editingId === null && returnFocusId.current) {
      rowRefs.current.get(returnFocusId.current)?.focus();
      returnFocusId.current = null;
    }
  });

  // Beim Start der Bearbeitung in das Händler-Feld springen.
  useEffect(() => {
    if (editingId) merchantRef.current?.focus();
  }, [editingId]);

  function sortBy(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (key !== sortKey) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  }

  function startEdit(id: string) {
    const e = sorted.find((x) => x.id === id);
    if (!e) return;
    setDraft({
      merchant: e.merchant,
      amount: minorToInput(e.amountMinor),
      categoryId: e.categoryId,
    });
    setInvalid(false);
    setActiveId(id);
    setEditingId(id);
  }

  function exitEdit(id: string) {
    setInvalid(false);
    setEditingId(null);
    returnFocusId.current = id;
  }

  async function save(id: string) {
    if (busy.current) return;
    const amount = parseDecimalToMinor(draft.amount);
    if (amount === null || amount <= 0) {
      setInvalid(true);
      return;
    }
    busy.current = true;
    try {
      const changed = await updateEntry(db, id, {
        merchant: draft.merchant,
        amountMinor: amount,
        categoryId: draft.categoryId,
      });
      if (changed) toast(t('history.table.saved'));
      exitEdit(id);
    } catch {
      // Zeile bleibt offen, damit nichts verloren geht.
      toast(t('history.table.saveError'));
    } finally {
      busy.current = false;
    }
  }

  function moveActive(delta: 1 | -1) {
    const index = sorted.findIndex((e) => e.id === currentActive);
    const next = sorted[Math.min(Math.max(index + delta, 0), sorted.length - 1)];
    if (!next) return;
    setActiveId(next.id);
    rowRefs.current.get(next.id)?.focus();
  }

  // Nur wenn die Zeile selbst den Fokus hat; Knöpfe und Felder behalten ihre eigenen Tasten.
  function onBodyKeyDown(ev: KeyboardEvent<HTMLTableSectionElement>) {
    if (editingId) return;
    const row = ev.target as HTMLElement;
    if (row.tagName !== 'TR' || !row.dataset.id) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      moveActive(ev.key === 'ArrowDown' ? 1 : -1);
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      startEdit(row.dataset.id);
    }
  }

  function onEditRowKeyDown(ev: KeyboardEvent<HTMLTableRowElement>, id: string) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      exitEdit(id);
    } else if (ev.key === 'Enter' && (ev.target as HTMLElement).tagName !== 'BUTTON') {
      ev.preventDefault();
      void save(id);
    }
  }

  function sortHead(key: SortKey, label: string): ReactNode {
    const arrow = key === sortKey ? (sortDir === 'asc' ? '↑' : '↓') : '';
    return (
      <button type="button" className={styles.sortButton} onClick={() => sortBy(key)}>
        {label}
        <span aria-hidden="true">{arrow}</span>
      </button>
    );
  }

  return (
    <>
      <Card className={styles.card}>
        <table className={styles.table} aria-describedby="ht-hint">
          <thead>
            <tr>
              {(['date', 'merchant'] as const).map((key) => (
                <th key={key} scope="col" aria-sort={ariaSort(key)}>
                  {sortHead(
                    key,
                    t(key === 'date' ? 'history.table.date' : 'history.table.merchant'),
                  )}
                </th>
              ))}
              <th scope="col">{t('history.table.category')}</th>
              <th scope="col">{t('history.table.person')}</th>
              <th scope="col" aria-sort={ariaSort('amount')} className={styles.right}>
                {sortHead('amount', t('history.table.amount'))}
              </th>
              <th scope="col" className={styles.right}>
                {t('history.table.original')}
              </th>
              <th scope="col" className={styles.srOnly}>
                {t('history.table.actions')}
              </th>
            </tr>
          </thead>
          <tbody onKeyDown={onBodyKeyDown}>
            {sorted.map((e) => {
              const category = byId.get(e.categoryId);
              const editing = editingId === e.id;
              const dayText = formatDay(e.bookedOn, locale, {
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
              });
              if (editing) {
                return (
                  <tr
                    key={e.id}
                    data-id={e.id}
                    className={styles.editing}
                    onKeyDown={(ev) => onEditRowKeyDown(ev, e.id)}
                  >
                    <td>{dayText}</td>
                    <td>
                      <input
                        ref={merchantRef}
                        className={styles.field}
                        type="text"
                        aria-label={t('history.table.merchant')}
                        value={draft.merchant}
                        onChange={(ev) => setDraft({ ...draft, merchant: ev.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        className={styles.select}
                        aria-label={t('history.table.category')}
                        value={draft.categoryId}
                        onChange={(ev) => setDraft({ ...draft, categoryId: ev.target.value })}
                      >
                        {editChoices(e.categoryId).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={styles.person}>{memberName(members, e.paidBy)}</td>
                    <td className={styles.right}>
                      <input
                        className={`${styles.field} ${styles.amountField}`}
                        type="text"
                        inputMode="decimal"
                        aria-label={t('history.table.amount')}
                        aria-invalid={invalid}
                        aria-describedby={invalid ? `ht-amount-err-${e.id}` : undefined}
                        value={draft.amount}
                        onChange={(ev) => {
                          setInvalid(false);
                          setDraft({ ...draft, amount: ev.target.value });
                        }}
                      />
                      {invalid ? (
                        <p id={`ht-amount-err-${e.id}`} role="alert" className={styles.warn}>
                          <WarnIcon size={16} />
                          {t('history.table.invalidAmount')}
                        </p>
                      ) : null}
                    </td>
                    <td className={styles.original}>
                      {e.currency === 'EUR' ? formatMoney(e.amountMinor, 'EUR', locale) : ''}
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={`${styles.iconButton} ${styles.save}`}
                          onClick={() => void save(e.id)}
                        >
                          <CheckIcon size={18} />
                          {t('history.table.save')}
                        </button>
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={() => exitEdit(e.id)}
                        >
                          {t('history.table.cancel')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr
                  key={e.id}
                  data-id={e.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(e.id, el);
                    else rowRefs.current.delete(e.id);
                  }}
                  tabIndex={e.id === currentActive ? 0 : -1}
                  className={styles.row}
                  onFocus={() => setActiveId(e.id)}
                >
                  <td>{dayText}</td>
                  <td>
                    <Link to={`/eintrag/${e.id}`} className={styles.link}>
                      <span className={styles.title}>{e.merchant || e.note}</span>
                    </Link>
                    {e.merchant && e.note ? <span className={styles.sub}>{e.note}</span> : null}
                    {e.conflict ? <ConflictBadge entity="entry" rowId={e.id} /> : null}
                  </td>
                  <td>
                    <span className={styles.catCell}>
                      <CategoryTile
                        icon={category?.icon ?? 'sonstiges'}
                        color={category?.color ?? 'var(--label2)'}
                        size={22}
                      />
                      {category?.name ?? ''}
                    </span>
                  </td>
                  <td className={styles.person}>{memberName(members, e.paidBy)}</td>
                  <td className={`${styles.right} num`}>
                    {formatMoney(entryCad(e), 'CAD', locale)}
                  </td>
                  <td className={`${styles.original} ${styles.right} num`}>
                    {e.currency === 'EUR' ? formatMoney(e.amountMinor, 'EUR', locale) : ''}
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={t('history.table.edit')}
                        onClick={() => startEdit(e.id)}
                      >
                        <EditIcon size={18} />
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={t('history.delete')}
                        onClick={() => onDelete(e.id)}
                      >
                        <TrashIcon size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p id="ht-hint" className={styles.hint}>
        {t('history.table.hint')}
      </p>
    </>
  );
}
