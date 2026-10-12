import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { PlusIcon } from '../icons/ui-icons';
import styles from './Button.module.css';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: 'primary' | 'secondary' | 'text' | 'fab';
  busy?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  busy = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: Props) {
  const cls = [styles.button, styles[variant], className].filter(Boolean).join(' ');
  return (
    <button
      type={type}
      className={cls}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {variant === 'fab' ? <PlusIcon size={28} /> : children}
    </button>
  );
}
