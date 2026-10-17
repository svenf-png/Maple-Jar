import { useEffect, useId, useRef, useState } from 'react';
import { PCT_MAX, PCT_MIN, PCT_STEP } from '../../domain/scenario';
import { CategoryTile } from '../../ui';
import { signedPercent } from './projection-format';
import styles from './ScenarioPanel.module.css';

interface Props {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  hint: string;
  tileIcon: string;
  tileColor: string;
}

/**
 * Prozent-Regler für eine Kategorie. Gespeichert wird nur beim nativen `change`-Ereignis
 * (Loslassen bzw. Tastatur), nicht bei jedem Schritt.
 */
export function PctSlider({ label, value, onCommit, hint, tileIcon, tileColor }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  const dragging = useRef(false);
  const latest = useRef({ value, onCommit });
  const hintId = useId();

  useEffect(() => {
    latest.current = { value, onCommit };
  });

  // Der Entwurf folgt dem gespeicherten Wert, solange nicht gezogen wird.
  useEffect(() => {
    if (!dragging.current) setDraft(value);
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onNativeChange = () => {
      dragging.current = false;
      const next = Number(el.value);
      setDraft(next);
      if (next !== latest.current.value) latest.current.onCommit(next);
    };
    el.addEventListener('change', onNativeChange);
    return () => el.removeEventListener('change', onNativeChange);
  }, []);

  const text = signedPercent(draft);
  const endDrag = () => {
    dragging.current = false;
  };

  return (
    <div className={styles.slider}>
      <label className={styles.sliderLabel}>
        <span className={styles.sliderHead}>
          <CategoryTile icon={tileIcon} color={tileColor} size={22} />
          <span className={styles.sliderName}>{label}</span>
          <span className={`${styles.sliderValue} num`}>{text}</span>
        </span>
        <input
          ref={ref}
          type="range"
          className={styles.range}
          min={PCT_MIN}
          max={PCT_MAX}
          step={PCT_STEP}
          value={draft}
          aria-valuetext={text}
          aria-describedby={hintId}
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerDown={() => {
            dragging.current = true;
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      </label>
      <p id={hintId} className={styles.sliderHint}>
        {hint}
      </p>
    </div>
  );
}
