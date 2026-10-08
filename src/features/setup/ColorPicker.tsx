import type { CSSProperties } from 'react';
import { MEMBER_COLORS, type MemberColor } from '../../data/household';
import { CheckIcon } from '../../icons/ui-icons';
import styles from './SetupPage.module.css';

interface Props {
  label: string;
  value: string;
  onChange: (color: MemberColor) => void;
}

export function ColorPicker({ label, value, onChange }: Props) {
  return (
    <div role="group" aria-label={label} className={styles.colors}>
      {MEMBER_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={c === value}
          aria-label={c}
          className={styles.swatch}
          style={{ '--swatch': c } as CSSProperties}
          onClick={() => onChange(c)}
        >
          {c === value ? <CheckIcon size={18} /> : null}
        </button>
      ))}
    </div>
  );
}
