import type { CSSProperties, ReactNode } from 'react';
import styles from './Chip.module.css';

interface Props {
  label: string;
  icon: ReactNode;
  color: string;
  selected: boolean;
  onToggle: () => void;
}

export function Chip({ label, icon, color, selected, onToggle }: Props) {
  const style = selected ? ({ '--chip': color } as CSSProperties) : undefined;
  return (
    <button
      type="button"
      className={styles.chip}
      aria-pressed={selected}
      style={style}
      onClick={onToggle}
    >
      <span className={styles.icon}>{icon}</span>
      {label}
    </button>
  );
}
