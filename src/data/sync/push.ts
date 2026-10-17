import type { EventRow, MapleJarDb } from '../db';
import type { SyncTransport, WireEvent } from '../remote/sync-transport';

const CHUNK = 200;

export const toWire = (e: EventRow): WireEvent => ({
  v: e.v,
  id: e.id,
  hlc: e.hlc,
  device: e.device,
  author: e.author,
  entity: e.entity,
  rowId: e.rowId,
  op: e.op,
  base: e.base,
  ...(e.data ? { data: e.data } : {}),
});

/**
 * Sendet alle Outbox-Ereignisse. Idempotent: bei Abbruch bleiben die Einträge in der Outbox und
 * werden beim nächsten Lauf erneut gesendet (der Server ignoriert Duplikate). Gibt die Anzahl zurück.
 */
export async function pushOutbox(db: MapleJarDb, transport: SyncTransport): Promise<number> {
  const ids = (await db.outbox.toArray()).map((o) => o.id);
  if (ids.length === 0) return 0;
  const rows = await db.events.bulkGet(ids);
  const present = rows.filter((r): r is EventRow => r !== undefined);
  const missing = ids.filter((_, i) => rows[i] === undefined);
  if (missing.length > 0) await db.outbox.bulkDelete(missing);
  present.sort((a, b) => (a.hlc < b.hlc ? -1 : a.hlc > b.hlc ? 1 : 0));
  let sent = 0;
  for (let i = 0; i < present.length; i += CHUNK) {
    const chunk = present.slice(i, i + CHUNK);
    await transport.pushEvents(chunk.map(toWire));
    await db.outbox.bulkDelete(chunk.map((e) => e.id));
    sent += chunk.length;
  }
  return sent;
}
