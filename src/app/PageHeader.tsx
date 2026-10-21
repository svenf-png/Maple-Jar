import { useReadySession } from '../data/use-session';
import { getLocale } from '../i18n/t';
import { Avatar } from '../ui';
import styles from './PageHeader.module.css';
import { SyncStatusPill } from './SyncStatusPill';

export function PageHeader({ title, showMeta }: { title: string; showMeta: boolean }) {
  const { household } = useReadySession();
  const names = household.members.map((m) => m.displayName);
  const date = new Intl.DateTimeFormat(getLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  return (
    <header className={styles.header}>
      {showMeta ? (
        <div className={styles.meta}>
          <span className={styles.date}>{date}</span>
          <span className={styles.right}>
            <SyncStatusPill />
            <span className={styles.avatars}>
              {household.members.map((m, i) => (
                <Avatar
                  key={m.userId}
                  name={m.displayName}
                  color={m.color}
                  peers={names}
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
