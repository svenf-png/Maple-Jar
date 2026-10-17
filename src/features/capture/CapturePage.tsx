import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { createEntry, NoRateError, updateEntry } from '../../data/actions';
import { db } from '../../data/db';
import { useCategories, useEntries } from '../../data/repos';
import { useReadySession } from '../../data/use-session';
import { suggestCategory, suggestMerchants } from '../../domain/merchant';
import { type Currency, parseDecimalToMinor, toCadMinor } from '../../domain/money';
import { formatMoney } from '../../i18n/format';
import { getLocale, t, useLang } from '../../i18n/t';
import { type CategoryIconKey, categoryIcons } from '../../icons/category-icons';
import { CalendarIcon, CheckIcon, PersonIcon, WarnIcon } from '../../icons/ui-icons';
import { useOnline } from '../../platform/online';
import { useEntryRate } from '../../platform/use-fx';
import { Chip, Numpad, pressKey, Segmented } from '../../ui';
import { HapticTarget } from '../../ui/HapticTarget';
import { decimalSeparator, minorToInput, todayIso } from '../shared/helpers';
import styles from './CapturePage.module.css';

export function CapturePage() {
  useLang();
  const navigate = useNavigate();
  const { id } = useParams();
  const { household, userId } = useReadySession();
  const locale = getLocale();
  const categories = useCategories().filter((c) => !c.deleted && !c.hidden);
  const entries = useEntries();
  const editing = id ? entries.find((e) => e.id === id) : undefined;

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('CAD');
  const [categoryId, setCategoryId] = useState('');
  const [manualCategory, setManualCategory] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [paidBy, setPaidBy] = useState(userId);
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const online = useOnline();
  const [saved, setSaved] = useState(0);
  const loadedFor = useRef<string | null>(null);

  // Bearbeiten: Felder einmalig aus dem Eintrag übernehmen.
  useEffect(() => {
    if (!editing || loadedFor.current === editing.id) return;
    loadedFor.current = editing.id;
    setAmount(minorToInput(editing.amountMinor));
    setCurrency(editing.currency);
    setCategoryId(editing.categoryId);
    setManualCategory(true);
    setDate(editing.bookedOn);
    setPaidBy(editing.paidBy);
    setMerchant(editing.merchant);
    setNote(editing.note);
  }, [editing]);

  const rate = useEntryRate(currency, date, household.settings.fxProvider);

  // Kategorie-Vorschlag aus der Historie, solange nicht von Hand gewählt.
  const suggestion = useMemo(() => suggestCategory(entries, merchant), [entries, merchant]);
  useEffect(() => {
    if (manualCategory || !suggestion) return;
    if (categories.some((c) => c.id === suggestion.categoryId))
      setCategoryId(suggestion.categoryId);
  }, [suggestion, manualCategory, categories]);
  // Erste Kategorie vorauswählen, wenn noch keine gewählt ist.
  useEffect(() => {
    if (!categoryId && categories[0] && !editing) setCategoryId(categories[0].id);
  }, [categories, categoryId, editing]);

  const merchantHints = useMemo(
    () => (merchant.length >= 1 ? suggestMerchants(entries, merchant, 4) : []),
    [entries, merchant],
  );
  const showHints =
    merchantHints.length > 0 &&
    !(merchantHints.length === 1 && merchantHints[0]?.merchant === merchant);

  const decimal = decimalSeparator(locale);
  const shown = amount === '' ? '0' : amount.replace(',', decimal);
  const minor = parseDecimalToMinor(amount.replace(/,$/, ''));

  let conversion = '';
  if (minor && rate.rate) {
    conversion =
      currency === 'EUR'
        ? t('capture.approx', {
            amount: formatMoney(toCadMinor(minor, rate.rate.rateMicro), 'CAD', locale),
          })
        : '';
  }

  async function save() {
    if (!minor) return setError(t('capture.error.amount'));
    if (!categoryId) return setError(t('capture.error.category'));
    if (currency === 'EUR' && rate.status === 'loading') return;
    setError(null);
    setBusy(true);
    try {
      const known = currency === 'EUR' ? rate.rate : null;
      if (editing) {
        await updateEntry(db, editing.id, {
          amountMinor: minor,
          currency,
          bookedOn: date,
          categoryId,
          paidBy,
          merchant,
          note,
          rate: known,
        });
        void navigate(`/eintrag/${editing.id}`, { replace: true });
        return;
      }
      await createEntry(db, {
        amountMinor: minor,
        currency,
        bookedOn: date,
        categoryId,
        paidBy,
        merchant,
        note,
        rate: known,
      });
      setSaved((n) => n + 1);
      setFlash(true);
      setTimeout(() => {
        setFlash(false);
        setAmount('');
        setMerchant('');
        setNote('');
        setManualCategory(false);
      }, 900);
    } catch (err) {
      setError(err instanceof NoRateError ? t('capture.error.rate') : t('capture.error.save'));
    } finally {
      setBusy(false);
    }
  }

  const closeTo = editing ? `/eintrag/${editing.id}` : '/';
  const hint =
    suggestion && categoryId === suggestion.categoryId && !editing
      ? t(suggestion.count === 1 ? 'capture.suggestion.one' : 'capture.suggestion', {
          count: suggestion.count,
        })
      : null;

  return (
    <div className={styles.page}>
      <section
        className={styles.sheet}
        aria-label={t(editing ? 'capture.titleEdit' : 'capture.title')}
      >
        <div className={styles.head}>
          <Link to={closeTo} className={styles.cancel}>
            {saved > 0 ? t('capture.close') : t('common.cancel')}
          </Link>
          <h1 className={styles.title}>{t(editing ? 'capture.titleEdit' : 'capture.title')}</h1>
          <span />
        </div>

        <div className={styles.amountBlock}>
          <output className={`${styles.amount} num`} aria-label={t('capture.amount')}>
            <span className={amount === '' ? styles.placeholder : ''}>{shown}</span>
            <span className={styles.cur}>{currency === 'CAD' ? 'CA$' : '€'}</span>
          </output>
          <div className={styles.curRow}>
            <Segmented
              label={t('capture.currency')}
              value={currency}
              options={[
                { value: 'CAD', label: 'CAD' },
                { value: 'EUR', label: 'EUR' },
              ]}
              onChange={setCurrency}
            />
            <span className={`${styles.conv} num`}>
              {currency === 'EUR' && rate.status === 'loading'
                ? t('capture.rateLoading')
                : conversion}
            </span>
          </div>
          {currency === 'EUR' && rate.rate?.stale ? (
            <span className={styles.warn}>
              <WarnIcon size={14} />
              {t('capture.rateProvisional')}
            </span>
          ) : null}
        </div>

        {categories.length === 0 ? (
          <p className={styles.empty}>
            {t('capture.noCategories')}{' '}
            <Link to="/kategorien">{t('capture.createCategories')}</Link>
          </p>
        ) : (
          <fieldset className={styles.chips}>
            <legend className={styles.srOnly}>{t('capture.category')}</legend>
            {categories.map((c) => {
              const Icon =
                categoryIcons[(c.icon in categoryIcons ? c.icon : 'sonstiges') as CategoryIconKey];
              return (
                <Chip
                  key={c.id}
                  label={c.name}
                  color={c.color}
                  icon={<Icon size={16} />}
                  selected={c.id === categoryId}
                  onToggle={() => {
                    setCategoryId(c.id);
                    setManualCategory(true);
                  }}
                />
              );
            })}
          </fieldset>
        )}
        {hint ? <p className={styles.hint}>{hint}</p> : null}

        <div className={styles.fields}>
          <label className={styles.row}>
            <CalendarIcon size={20} />
            <span className={styles.rowLabel}>{t('capture.date')}</span>
            <input
              type="date"
              className={styles.dateInput}
              value={date}
              max="2099-12-31"
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
          </label>
          <div className={styles.row}>
            <PersonIcon size={20} />
            <span className={styles.rowLabel}>{t('capture.paidBy')}</span>
            <Segmented
              label={t('capture.paidBy')}
              value={paidBy}
              options={household.members.map((m) => ({ value: m.userId, label: m.displayName }))}
              onChange={setPaidBy}
            />
          </div>
          <label className={styles.row}>
            <span className={styles.rowLabel}>{t('capture.merchant')}</span>
            <input
              className={styles.text}
              value={merchant}
              maxLength={120}
              autoComplete="off"
              onChange={(e) => setMerchant(e.target.value)}
            />
          </label>
          {showHints ? (
            <ul className={styles.hints} aria-label={t('capture.suggestions')}>
              {merchantHints.map((h) => (
                <li key={h.merchant}>
                  <button
                    type="button"
                    className={styles.hintBtn}
                    onClick={() => {
                      setMerchant(h.merchant);
                    }}
                  >
                    {h.merchant}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {editing ? (
            <label className={styles.row}>
              <span className={styles.rowLabel}>{t('capture.note')}</span>
              <input
                className={styles.text}
                value={note}
                maxLength={500}
                autoComplete="off"
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          ) : null}
        </div>

        <Numpad decimal={decimal} onKey={(k) => setAmount((a) => pressKey(a, k))} />

        {error ? (
          <p className={styles.error} role="alert">
            <WarnIcon size={18} />
            <span>{error}</span>
          </p>
        ) : null}
        <HapticTarget busy={busy} onTap={() => void save()}>
          {t(editing ? 'capture.saveChanges' : 'capture.save')}
        </HapticTarget>
      </section>

      {flash ? (
        <div
          className={online ? styles.flash : `${styles.flash} ${styles.flashWithHint}`}
          role="status"
        >
          <span className={styles.flashIcon}>
            <CheckIcon size={30} />
          </span>
          <span>{t('capture.saved')}</span>
          {online ? null : <p className={styles.flashHint}>{t('capture.savedOffline')}</p>}
        </div>
      ) : null}
    </div>
  );
}
