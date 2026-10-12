import { t } from '../i18n/t';
import { BackspaceIcon } from '../icons/ui-icons';
import styles from './Numpad.module.css';

interface Props {
  /** Dezimalzeichen der Sprache (`,` oder `.`). */
  decimal: string;
  onKey: (key: string) => void;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function Numpad({ decimal, onKey }: Props) {
  return (
    <div className={styles.pad}>
      {DIGITS.map((d) => (
        <button key={d} type="button" className={`${styles.key} num`} onClick={() => onKey(d)}>
          {d}
        </button>
      ))}
      <button type="button" className={`${styles.key} num`} onClick={() => onKey(',')}>
        {decimal}
      </button>
      <button type="button" className={`${styles.key} num`} onClick={() => onKey('0')}>
        0
      </button>
      <button
        type="button"
        className={styles.key}
        aria-label={t('capture.key.delete')}
        onClick={() => onKey('del')}
      >
        <BackspaceIcon size={26} />
      </button>
    </div>
  );
}

/** Wendet eine Taste auf die Eingabe an. Intern immer mit Komma als Dezimalzeichen. */
export function pressKey(value: string, key: string): string {
  if (key === 'del') return value.slice(0, -1);
  if (key === ',') return value.includes(',') ? value : `${value || '0'},`;
  const [, frac] = value.split(',');
  if (frac !== undefined && frac.length >= 2) return value;
  if (value.replace(',', '').length >= 9) return value;
  return (value === '0' ? '' : value) + key;
}
