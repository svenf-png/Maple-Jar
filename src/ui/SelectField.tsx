import type { ReactNode, SelectHTMLAttributes } from 'react';
import { ChevronDownIcon } from '../icons/ui-icons';
import styles from './SelectField.module.css';

type Variant = 'filter' | 'edit' | 'plain';

interface Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  variant?: Variant | undefined;
  className?: string | undefined;
  children: ReactNode;
}

const WRAP_CLASS: Record<Variant, string | undefined> = {
  filter: undefined,
  edit: styles.wrapEdit,
  plain: undefined,
};

const SELECT_CLASS: Record<Variant, string | undefined> = {
  filter: styles.filter,
  edit: styles.edit,
  plain: styles.plain,
};

/** Natives <select> mit eigenem Pfeil. Tastatur, Screenreader und iOS-Rad bleiben nativ. */
export function SelectField({ variant = 'filter', className, children, ...rest }: Props) {
  const wrapClass = [styles.wrap, WRAP_CLASS[variant], className ?? null].filter(Boolean).join(' ');
  const selectClass = [styles.select, SELECT_CLASS[variant]].filter(Boolean).join(' ');
  return (
    <span className={wrapClass}>
      <select {...rest} className={selectClass}>
        {children}
      </select>
      <ChevronDownIcon size={18} className={styles.chevron} />
    </span>
  );
}
