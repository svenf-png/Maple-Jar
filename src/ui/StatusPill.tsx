import type { ComponentType } from 'react';
import { CheckIcon, CloudUpIcon, InfoIcon, WarnIcon } from '../icons/ui-icons';
import styles from './StatusPill.module.css';

interface Props {
  variant: 'ok' | 'warn' | 'info' | 'neutral';
  /** Überschreibt das Symbol der Variante. */
  icon?: ComponentType<{ size?: number }>;
  children: string;
}

const icons = { ok: CheckIcon, warn: WarnIcon, info: InfoIcon, neutral: CloudUpIcon } as const;

export function StatusPill({ variant, icon, children }: Props) {
  const Icon = icon ?? icons[variant];
  return (
    <span className={`${styles.pill} ${styles[variant]}`}>
      <Icon size={16} />
      {children}
    </span>
  );
}
