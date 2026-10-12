import { useState } from 'react';
import { PageHeader } from '../../app/PageHeader';
import { findMember } from '../../data/household';
import { disconnect } from '../../data/session';
import { useReadySession } from '../../data/use-session';
import { formatDay, formatRate } from '../../i18n/format';
import { getLocale, setLang, t, useLang } from '../../i18n/t';
import { usePersisted } from '../../platform/persist';
import { readTheme, setTheme, type ThemePref } from '../../platform/theme';
import { useTodayRate } from '../../platform/use-fx';
import { useMedia } from '../../platform/use-media';
import { Avatar, Button, Card, ConfirmDialog, ListRow, Segmented } from '../../ui';
import styles from './SettingsPage.module.css';

export function SettingsPage() {
  const lang = useLang();
  const { household, login, repo } = useReadySession();
  const desktop = useMedia('(min-width: 1024px)');
  const persisted = usePersisted();
  const fx = useTodayRate(household.settings.fxProvider);
  const [theme, setThemeState] = useState<ThemePref>(readTheme());
  const [confirm, setConfirm] = useState(false);
  const me = findMember(household, login);
  const other = household.members.find((m) => m !== me);

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
            {me ? <Avatar name={me.displayName} color={me.color} size={52} /> : null}
            <div>
              <div className={styles.name}>{me?.displayName ?? login}</div>
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
          <ListRow title={t('settings.repo')} right={repo} />
          <ListRow title={t('settings.login')} right={login} />
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
