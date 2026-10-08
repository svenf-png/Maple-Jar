import { CheckIcon, CloudUpIcon, InfoIcon, WarnIcon } from '../icons/ui-icons';
import styles from './StatusPill.module.css';

interface Props {
  variant: 'ok' | 'warn' | 'info' | 'neutral';
  children: string;
}

const icons = { ok: CheckIcon, warn: WarnIcon, info: InfoIcon, neutral: CloudUpIcon } as const;

export function StatusPill({ variant, children }: Props) {
  const Icon = icons[variant];
  return (
    <span className={`${styles.pill} ${styles[variant]}`}>
      <Icon size={16} />
      {children}
    </span>
  );
}
