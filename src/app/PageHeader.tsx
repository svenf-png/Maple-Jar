import { useReadySession } from '../data/use-session';
import { getLocale, t } from '../i18n/t';
import { Avatar, StatusPill } from '../ui';
import styles from './PageHeader.module.css';

export function PageHeader({ title, showMeta }: { title: string; showMeta: boolean }) {
  const { household } = useReadySession();
  const date = new Intl.DateTimeFormat(getLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  return (
    <header className={styles.header}>
      {showMeta ? (
        <div className={styles.meta}>
          <span className={styles.date}>{date}</span>
          <span className={styles.right}>
            <StatusPill variant="neutral">{t('status.connected')}</StatusPill>
            <span className={styles.avatars}>
              {household.members.map((m, i) => (
                <Avatar
                  key={m.githubLogin}
                  name={m.displayName}
                  color={m.color}
                  ring
                  overlap={i > 0}
                />
              ))}
            </span>
          </span>
        </div>
      ) : null}
      <h1 className="type-large-title">{title}</h1>
    </header>
  );
}
