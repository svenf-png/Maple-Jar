import type { CSSProperties } from 'react';
import styles from './ProgressBar.module.css';

interface Props {
  /** 0 bis 100, wird begrenzt. */
  value: number;
  label: string;
  tone?: 'acc' | 'warn' | 'ok' | 'cat';
  /** Kategoriefarbe bei tone="cat". */
  color?: string;
  height?: number;
}

export function ProgressBar({ value, label, tone = 'acc', color, height = 8 }: Props) {
  const pct = Math.max(0, Math.min(100, value));
  const style = { '--bar-color': color, height } as CSSProperties;
  return (
    <div
      className={`${styles.track} ${styles[tone]}`}
      style={style}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className={styles.fill} style={{ width: `${pct}%` }} />
    </div>
  );
}
