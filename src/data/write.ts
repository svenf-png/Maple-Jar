import type { MapleJarDb } from './db';
import { getMemberIds, refoldRows, toAppEvent, toEventRow } from './events/apply';
import { headsOf } from './events/fold';
import { formatHlc, type HlcState, tickHlc, ZERO_HLC } from './events/hlc';
import { type AppEvent, type Entity, type Op, parseEvent, SCHEMA_VERSION } from './events/schema';

export interface NewEvent {
  entity: Entity;
  rowId: string;
  op: Op;
  /** create: vollständig; update: nur geänderte Felder. */
  data?: Record<string, unknown>;
}

const listeners = new Set<() => void>();

/** Wird nach jeder lokalen Änderung aufgerufen (der Scheduler löst darüber den Sync nach 2 s aus). */
export const onLocalChange = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/**
 * Schreiben = eine Dexie-Transaktion: Ereignis in `events` und `outbox`, materialisierte Zeile aktualisieren.
 * Wirft, wenn das Ereignis das Schema verletzt (nichts wird geschrieben).
 */
export async function appendLocalEvent(
  db: MapleJarDb,
  input: NewEvent,
  nowMs: number = Date.now(),
): Promise<AppEvent> {
  const event = await db.transaction('rw', db.tables, async () => {
    const [deviceId, userId, hlcState] = await Promise.all([
      db.meta.get('deviceId'),
      db.meta.get('userId'),
      db.meta.get('hlc'),
    ]);
    if (typeof deviceId?.value !== 'string' || typeof userId?.value !== 'string') {
      throw new Error('No session');
    }
    const existing = (
      await db.events.where('[entity+rowId]').equals([input.entity, input.rowId]).toArray()
    ).map(toAppEvent);
    const state: HlcState = tickHlc((hlcState?.value as HlcState | undefined) ?? ZERO_HLC, nowMs);
    const candidate = {
      v: SCHEMA_VERSION,
      id: crypto.randomUUID(),
      hlc: formatHlc(state, deviceId.value),
      device: deviceId.value,
      author: userId.value,
      entity: input.entity,
      rowId: input.rowId,
      op: input.op,
      base: headsOf(existing),
      ...(input.data ? { data: input.data } : {}),
    };
    const parsed = parseEvent(candidate);
    if (!parsed.ok) throw new Error(`Invalid event: ${parsed.reason}`);
    await db.events.put(toEventRow(parsed.event));
    await db.outbox.put({ id: parsed.event.id });
    await db.meta.put({ key: 'hlc', value: state });
    await refoldRows(db, [{ entity: input.entity, rowId: input.rowId }], await getMemberIds(db));
    return parsed.event;
  });
  for (const l of listeners) l();
  return event;
}
