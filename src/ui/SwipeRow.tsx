import { type ReactNode, useRef, useState } from 'react';
import { TrashIcon } from '../icons/ui-icons';
import styles from './SwipeRow.module.css';

interface Props {
  children: ReactNode;
  actionLabel: string;
  onAction: () => void;
}

const WIDTH = 84;

/**
 * Wischen nach links zeigt die Aktion (Löschen). Die Aktion ist immer ein echter Button im DOM und per Tastatur
 * erreichbar (beim Fokus schiebt sich die Zeile zur Seite).
 */
export function SwipeRow({ children, actionLabel, onAction }: Props) {
  const [offset, setOffset] = useState(0);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const moved = useRef(false);

  function down(e: React.PointerEvent) {
    start.current = { x: e.clientX, y: e.clientY, base: offset };
    moved.current = false;
  }
  function move(e: React.PointerEvent) {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) < 6 || Math.abs(e.clientY - s.y) > Math.abs(dx)) return;
    moved.current = true;
    setOffset(Math.max(-WIDTH, Math.min(0, s.base + dx)));
  }
  function up() {
    if (!start.current) return;
    start.current = null;
    if (moved.current) setOffset((o) => (o < -WIDTH / 2 ? -WIDTH : 0));
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Fokus-Weitergabe, Bedienung läuft über die Buttons
    <div className={styles.wrap} onFocus={() => setOffset(-WIDTH)} onBlur={() => setOffset(0)}>
      <button type="button" className={styles.action} onClick={onAction}>
        <TrashIcon size={20} />
        {actionLabel}
      </button>
      <div
        className={styles.content}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(e) => {
          if (moved.current) {
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
