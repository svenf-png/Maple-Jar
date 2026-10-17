import type { MapleJarDb } from '../db';
import { getMemberIds, type RowRef, refoldRows, toEventRow, waitingRefs } from '../events/apply';
import { type HlcState, parseHlc, receiveHlc, ZERO_HLC } from '../events/hlc';
import { parseEvent } from '../events/schema';
import type { SyncTransport } from '../remote/sync-transport';

export const PAGE_SIZE = 500;
/**
 * Beim Start eines Pulls ein Stück vor dem Cursor lesen. Ein Insert mit kleinerer `seq` kann nach einem
 * mit größerer committen und würde sonst übersprungen. Ereignisse sind idempotent, Wiederlesen ist sicher.
 */
export const CURSOR_OVERLAP = 100;

/** Liest alle neuen Ereignisse seitenweise. Gibt die Zahl neu übernommener Ereignisse zurück. */
export async function pullAll(
  db: MapleJarDb,
  transport: SyncTransport,
  nowMs: number = Date.now(),
): Promise<number> {
  const startCursor = ((await db.meta.get('cursor'))?.value as number | undefined) ?? 0;
  let after = Math.max(0, startCursor - CURSOR_OVERLAP);
  let added = 0;
  for (;;) {
    const page = await transport.pullEvents(after, PAGE_SIZE);
    if (page.length > 0) added += await processPage(db, page, nowMs);
    const last = page[page.length - 1];
    if (page.length < PAGE_SIZE || !last) break;
    after = last.seq;
  }
  return added;
}

async function processPage(
  db: MapleJarDb,
  page: Awaited<ReturnType<SyncTransport['pullEvents']>>,
  nowMs: number,
): Promise<number> {
  return db.transaction('rw', db.tables, async () => {
    const cursor = ((await db.meta.get('cursor'))?.value as number | undefined) ?? 0;
    let hlc = ((await db.meta.get('hlc'))?.value as HlcState | undefined) ?? ZERO_HLC;
    const known = new Set(
      (await db.events.bulkGet(page.map((p) => p.id)))
        .filter((e) => e !== undefined)
        .map((e) => e.id),
    );
    const touched: RowRef[] = [];
    const delivered: string[] = [];
    let added = 0;
    for (const { seq, ...raw } of page) {
      const parsed = parseEvent(raw);
      if (!parsed.ok) {
        await db.parked.put({
          key: `seq:${seq}`,
          seq,
          reason: parsed.reason,
          eventId: typeof raw.id === 'string' ? raw.id : null,
          at: new Date(nowMs).toISOString(),
        });
        continue;
      }
      const e = parsed.event;
      delivered.push(e.id);
      if (known.has(e.id)) continue;
      known.add(e.id);
      await db.events.put(toEventRow(e, seq));
      touched.push({ entity: e.entity, rowId: e.rowId });
      const remote = parseHlc(e.hlc);
      if (remote) hlc = receiveHlc(hlc, remote, nowMs);
      added++;
    }
    // Eigene Ereignisse, die der Server bestätigt, müssen nicht mehr gesendet werden.
    await db.outbox.bulkDelete(delivered);
    if (added > 0) {
      await refoldRows(db, [...touched, ...(await waitingRefs(db))], await getMemberIds(db));
      await db.meta.put({ key: 'hlc', value: hlc });
    }
    // Cursor erst nach erfolgreicher Verarbeitung der Seite (gleiche Transaktion).
    const maxSeq = Math.max(cursor, ...page.map((p) => p.seq));
    await db.meta.put({ key: 'cursor', value: maxSeq });
    return added;
  });
}
