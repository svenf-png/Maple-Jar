import type { CSSProperties } from 'react';
import { type CategoryIconKey, categoryIcons } from '../icons/category-icons';

interface Props {
  icon: string;
  color: string;
  size?: number;
}

/** Farbige Kachel mit Kategorie-Symbol. Die Farbe kommt aus den Daten. */
export function CategoryTile({ icon, color, size = 36 }: Props) {
  const Icon = categoryIcons[(icon in categoryIcons ? icon : 'sonstiges') as CategoryIconKey];
  const style = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.28),
    background: color,
    color: 'var(--onCat)',
    display: 'grid',
    placeItems: 'center',
    flex: 'none',
  } as CSSProperties;
  return (
    <span style={style} aria-hidden="true">
      <Icon size={Math.round(size * 0.58)} />
    </span>
  );
}
