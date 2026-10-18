import type { ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDownIcon } from '../icons/ui-icons';
import styles from './SelectField.module.css';

interface Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  variant?: 'filter' | 'edit';
  className?: string | undefined;
  children: ReactNode;
}

/** Natives <select> mit eigenem Pfeil. Tastatur, Screenreader und iOS-Rad bleiben nativ. */
export function SelectField({ variant = 'filter', className, children, ...rest }: Props) {
  const wrapClass = [styles.wrap, variant === 'edit' ? styles.wrapEdit : null, className ?? null]
    .filter(Boolean)
    .join(' ');
  const selectClass = [styles.select, variant === 'edit' ? styles.edit : styles.filter]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={wrapClass}>
      <select {...rest} className={selectClass}>
        {children}
      </select>
      <ChevronDownIcon size={18} className={styles.chevron} />
    </span>
  );
}
