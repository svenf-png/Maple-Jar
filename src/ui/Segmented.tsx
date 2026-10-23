import styles from './Segmented.module.css';

interface Props<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  /** Desktop: nur so breit wie die Optionen (Seiten-Tabs), statt die Spalte zu füllen. */
  fit?: boolean;
}

export function Segmented<T extends string>({ label, value, options, onChange, fit }: Props<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={fit ? `${styles.group} ${styles.fit}` : styles.group}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          className={styles.item}
          onClick={() => onChange(o.value)}
        >
          <span className={styles.face}>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
