import styles from './EmptyState.module.css';

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className={styles.empty}>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.text}>{text}</p>
    </div>
  );
}
