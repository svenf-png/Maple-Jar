import type { CSSProperties } from 'react';
import { initials } from '../domain/initials';
import styles from './Avatar.module.css';

interface Props {
  name: string;
  color: string;
  size?: number;
  ring?: boolean;
  overlap?: boolean;
  /** Alle Anzeigenamen des Haushalts; bei gleicher Initiale erscheinen zwei Buchstaben. */
  peers?: readonly string[];
}

export function Avatar({ name, color, size = 30, ring = false, overlap = false, peers }: Props) {
  const style = {
    width: size,
    height: size,
    background: color,
    fontSize: Math.round(size * (peers && initials(name, peers).length > 1 ? 0.38 : 0.45)),
  } as CSSProperties;
  const cls = [styles.avatar, ring ? styles.ring : '', overlap ? styles.overlap : '']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={cls} style={style} role="img" aria-label={name}>
      {initials(name, peers ?? [name])}
    </span>
  );
}
