import type { ReactNode } from 'react';
import { useMedia } from '../platform/use-media';
import styles from './AppShell.module.css';
import { Sidebar } from './Sidebar';

/**
 * Rahmen für Vollbild-Unterseiten: Auf dem Desktop bleibt die Seitenleiste sichtbar.
 * Das `<main>`-Landmark liegt immer hier (genau einmal), die Seiten selbst rendern `<div>`.
 */
export function SubShell({ children }: { children: ReactNode }) {
  const desktop = useMedia('(min-width: 1024px)');
  if (!desktop) return <main>{children}</main>;
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
