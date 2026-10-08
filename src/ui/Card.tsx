import type { HTMLAttributes } from 'react';
import styles from './Card.module.css';

interface Props extends HTMLAttributes<HTMLDivElement> {
  radius?: 'list' | 'kpi' | 'hero';
}

export function Card({ radius = 'list', className, ...rest }: Props) {
  return (
    <div className={[styles.card, styles[radius], className].filter(Boolean).join(' ')} {...rest} />
  );
}
