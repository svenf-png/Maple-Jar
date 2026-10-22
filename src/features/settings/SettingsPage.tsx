import { useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../../app/PageHeader';
import { db } from '../../data/db';
import { exportEntriesCsv, exportEventsJson } from '../../data/export';
import { findMember } from '../../data/household';
import { disconnect } from '../../data/session';
import { todayIso } from '../../data/today';
import { useLiveQuery } from '../../data/use-live-query';
import { useReadySession } from '../../data/use-session';
import type { CsvLabels } from '../../domain/csv';
import { formatDay, formatRate } from '../../i18n/format';
import { getLocale, setLang, t, useLang } from '../../i18n/t';
import { downloadFile } from '../../platform/download';
import { usePersisted } from '../../platform/persist';
import { readTheme, setTheme, type ThemePref } from '../../platform/theme';
import { useTodayRate } from '../../platform/use-fx';
import { useMedia } from '../../platform/use-media';
import { Avatar, Button, Card, ConfirmDialog, ListRow, Segmented } from '../../ui';
import styles from './SettingsPage.module.css';
import { SetupLinkCard } from './SetupLinkCard';

export function SettingsPage() {
  const lang = useLang();
  const { household, userId, username } = useReadySession();
  const desktop = useMedia('(min-width: 1024px)');
  const persisted = usePersisted();
  const fx = useTodayRate(household.settings.fxProvider);
  const [theme, setThemeState] = useState<ThemePref>(readTheme());
  const [confirm, setConfirm] = useState(false);
  const me = findMember(household, userId);
  const other = household.members.find((m) => m.userId !== userId);

  const parked = useLiveQuery(() => db.parked.toArray(), [], []);
  const conflicts = useLiveQuery(() => db.conflicts.count(), [], 0);
  const waiting = useLiveQuery(
    async () => (((await db.meta.get('waiting'))?.value as string[] | undefined) ?? []).length,
    [],
    0,
  );
  const [exportError, setExportError] = useState(false);
  const [csvError, setCsvError] = useState(false);

  async function exportData() {
    setExportError(false);
    try {
      const json = await exportEventsJson(db);
      downloadFile(
        `maple-jar-export-${new Date().toISOString().slice(0, 10)}.json`,
        json,
        'application/json',
      );
    } catch {
      setExportError(true);
    }
  }

  async function exportCsv() {
    setCsvError(false);
    try {
      const labels: CsvLabels = {
        headers: [
          t('csv.date'),
          t('csv.merchant'),
          t('csv.note'),
          t('csv.category'),
          t('csv.amount'),
          t('csv.currency'),
          t('csv.amountCad'),
          t('csv.paidBy'),
          t('csv.source'),
        ],
        source: { manual: t('csv.source.manual'), fixed: t('csv.source.fixed') },
      };
      const csv = await exportEntriesCsv(db, household.members, labels);
      downloadFile(`maple-jar-entries-${todayIso()}.csv`, csv, 'text/csv;charset=utf-8');
    } catch {
      setCsvError(true);
    }
  }

  const providerLabel = t(`setup.fx.${household.settings.fxProvider}`);
  let fxText = t('settings.fx.loading');
  if (fx.status === 'unavailable') fxText = t('settings.fx.unavailable');
  if (fx.status === 'ready') {
    const date = formatDay(fx.rate.date, getLocale(), { day: '2-digit', month: '2-digit' });
    fxText = t(fx.rate.stale ? 'settings.fx.offline' : 'settings.fx.value', {
      rate: formatRate(fx.rate.rateMicro, getLocale()),
      provider: providerLabel,
      date,
    });
  }

  return (
    <>
      <PageHeader title={t('settings.title')} showMeta={!desktop} />
      <div className={styles.stack}>
        <Card>
          <div className={styles.profile}>
            {me ? (
              <Avatar
                name={me.displayName}
                color={me.color}
                size={52}
                peers={household.members.map((m) => m.displayName)}
              />
            ) : null}
            <div>
              <div className={styles.name}>{me?.displayName ?? username}</div>
              <div className={styles.sub}>
                {other
                  ? t('settings.sharedWith', { name: other.displayName })
                  : t('settings.alone')}
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <ListRow
            title={t('settings.language')}
            right={
              <Segmented
                label={t('settings.language')}
                value={lang}
                options={[
                  { value: 'de', label: 'DE' },
                  { value: 'en', label: 'EN' },
                ]}
                onChange={setLang}
              />
            }
          />
          <ListRow
            title={t('settings.appearance')}
            right={
              <Segmented
                label={t('settings.appearance')}
                value={theme}
                options={[
                  { value: 'auto', label: t('settings.appearance.auto') },
                  { value: 'light', label: t('settings.appearance.light') },
                  { value: 'dark', label: t('settings.appearance.dark') },
                ]}
                onChange={(v) => {
                  setTheme(v);
                  setThemeState(v);
                }}
              />
            }
          />
          <ListRow title={t('settings.fx')} right={<span className="num">{fxText}</span>} />
        </Card>
        <Card>
          <ListRow
            title={t('settings.persisted')}
            right={persisted === null ? '' : persisted ? t('common.yes') : t('common.no')}
          />
          <ListRow title={t('settings.login')} right={username} />
        </Card>
        <Card>
          <Link to="/kategorien" className={styles.navLink}>
            <ListRow title={t('settings.categories')} chevron />
          </Link>
          <Link to="/budgets" className={styles.navLink}>
            <ListRow title={t('settings.budgets')} chevron />
          </Link>
        </Card>
        <SetupLinkCard />
        <Card>
          <ListRow
            title={t('settings.export')}
            right={
              <Button
                variant="secondary"
                aria-label={t('settings.export')}
                onClick={() => void exportData()}
              >
                {t('settings.export.action')}
              </Button>
            }
          />
          {exportError ? (
            <p role="alert" className={styles.sub}>
              {t('settings.export.error')}
            </p>
          ) : null}
          <ListRow
            title={t('settings.exportCsv')}
            right={
              <Button
                variant="secondary"
                aria-label={t('settings.exportCsv')}
                onClick={() => void exportCsv()}
              >
                {t('settings.exportCsv.action')}
              </Button>
            }
          />
          {csvError ? (
            <p role="alert" className={styles.sub}>
              {t('settings.export.error')}
            </p>
          ) : null}
        </Card>
        <Card>
          <h2 className="type-label">{t('settings.diagnostics')}</h2>
          <ListRow title={t('settings.diagnostics.parked')} right={String(parked.length)} />
          <ListRow title={t('settings.diagnostics.waiting')} right={String(waiting)} />
          <ListRow title={t('settings.diagnostics.conflicts')} right={String(conflicts)} />
          {parked.map((p) => (
            <ListRow key={p.key} title={p.reason} right={p.seq === null ? '' : `#${p.seq}`} />
          ))}
        </Card>
        <Button variant="secondary" onClick={() => setConfirm(true)}>
          {t('settings.logout')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        title={t('settings.logout.confirmTitle')}
        text={t('settings.logout.confirmText')}
        confirmLabel={t('settings.logout.confirm')}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          void disconnect();
        }}
      />
    </>
  );
}
