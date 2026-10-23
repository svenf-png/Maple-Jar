import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.text}>{text}</p>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
