import type { CSSProperties } from 'react';
import styles from './Avatar.module.css';

interface Props {
  name: string;
  color: string;
  size?: number;
  ring?: boolean;
  overlap?: boolean;
}

export function Avatar({ name, color, size = 30, ring = false, overlap = false }: Props) {
  const style = {
    width: size,
    height: size,
    background: color,
    fontSize: Math.round(size * 0.45),
  } as CSSProperties;
  const cls = [styles.avatar, ring ? styles.ring : '', overlap ? styles.overlap : '']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={cls} style={style} role="img" aria-label={name}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
