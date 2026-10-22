import type { ComponentProps } from 'react';
import { useHapticOverlay } from '../platform/haptics';
import { Button } from './Button';
import styles from './HapticTarget.module.css';

type ButtonProps = ComponentProps<typeof Button>;

interface Props extends Omit<ButtonProps, 'onClick'> {
  /** Wird genau einmal ausgelöst: über das Overlay (direkter Tap) oder über die Schaltfläche. */
  onTap: () => void;
  /** Überschreibt die automatische Erkennung (Tests und Sonderfälle). */
  overlay?: boolean;
}

/**
 * Schaltfläche mit Haptik auf iOS. Ein direkter Tap schaltet das native Switch-Overlay um, das die
 * Haptik auslöst. Programmatische Klicks auf das Overlay sind verboten (kein `el.click()`), weil iOS
 * sie nicht als Nutzeraktion zählt. Tastatur und VoiceOver nutzen die Schaltfläche.
 */
export function HapticTarget({ onTap, overlay, disabled = false, busy = false, ...rest }: Props) {
  const auto = useHapticOverlay();
  const active = (overlay ?? auto) && !disabled && !busy;
  return (
    <span className={styles.wrap}>
      <Button {...rest} disabled={disabled} busy={busy} onClick={() => onTap()} />
      {active ? (
        <input
          ref={(el) => el?.setAttribute('switch', '')}
          type="checkbox"
          checked={false}
          onChange={() => onTap()}
          aria-hidden="true"
          tabIndex={-1}
          data-haptic-switch=""
          className={styles.overlay}
        />
      ) : null}
    </span>
  );
}
