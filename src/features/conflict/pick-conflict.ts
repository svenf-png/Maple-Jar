import type { ConflictEntity } from '../../data/conflict-actions';

const isEditable = (entity: string): entity is ConflictEntity =>
  entity === 'entry' || entity === 'income' || entity === 'fixedCost' || entity === 'goal';

/**
 * Wählt den Konflikt, den die Übersicht zeigt: den ersten nach `id` unter den bearbeitbaren
 * Entitäten (Kategorien nutzen Last-Write-Wins und haben keinen Dialog). `count` zählt alle davon.
 */
export function pickConflict(
  rows: ReadonlyArray<{ id: string; entity: string; rowId: string }>,
): { entity: ConflictEntity; rowId: string; count: number } | null {
  const open = rows
    .filter((r): r is typeof r & { entity: ConflictEntity } => isEditable(r.entity))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const first = open[0];
  if (!first) return null;
  return { entity: first.entity, rowId: first.rowId, count: open.length };
}
