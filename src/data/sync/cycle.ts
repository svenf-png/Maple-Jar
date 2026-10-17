import type { MapleJarDb } from '../db';
import { getMemberIds, refoldRows, waitingRefs } from '../events/apply';
import type { SyncTransport } from '../remote/sync-transport';
import { pullAll } from './pull';
import { pushOutbox } from './push';

// --- Ablauf eines Sync-Laufs -------------------------------------------------

export interface SyncResult {
  pushed: number;
  pulled: number;
}

/** Aktualisiert Haushalt und Mitglieder (z. B. wenn die zweite Person beigetreten ist). */
export async function refreshHousehold(db: MapleJarDb, transport: SyncTransport): Promise<void> {
  const household = await transport.getHousehold();
  if (!household) return;
  await db.transaction('rw', db.tables, async () => {
    await db.meta.put({ key: 'household', value: household });
    // Neue Mitglieder können wartende Einträge freigeben.
    await refoldRows(db, await waitingRefs(db), await getMemberIds(db));
  });
}

/**
 * Ein Lauf: Push (alle Outbox-Ereignisse), dann Pull ab Cursor. Wirft bei Fehlern; die Outbox bleibt dann
 * unverändert, der nächste Lauf wiederholt sicher. Haushalt wird nur geholt, wenn noch keine zwei Mitglieder
 * bekannt sind oder `forceHousehold` gesetzt ist.
 */
export async function runSync(
  db: MapleJarDb,
  transport: SyncTransport,
  options: { forceHousehold?: boolean; nowMs?: number } = {},
): Promise<SyncResult> {
  const pushed = await pushOutbox(db, transport);
  const members = (await getMemberIds(db)).size;
  if (options.forceHousehold || members < 2) await refreshHousehold(db, transport);
  const pulled = await pullAll(db, transport, options.nowMs ?? Date.now());
  return { pushed, pulled };
}
