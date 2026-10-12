import type { ConflictRow, EventRow, MapleJarDb, MaterialRow } from '../db';
import { type FoldContext, type FoldedRow, foldRow, rowKey } from './fold';
import type { AppEvent, Entity } from './schema';

// Alle Funktionen hier laufen innerhalb einer Dexie-Transaktion des Aufrufers.

export interface RowRef {
  entity: Entity;
  rowId: string;
}

const ORDER: Entity[] = ['category', 'member', 'settings', 'entry', 'budget'];

export const toAppEvent = (row: EventRow): AppEvent => ({
  v: 1,
  id: row.id,
  hlc: row.hlc,
  device: row.device,
  author: row.author,
  entity: row.entity,
  rowId: row.rowId,
  op: row.op as AppEvent['op'],
  base: row.base,
  ...(row.data ? { data: row.data } : {}),
});

export const toEventRow = (e: AppEvent, seq?: number): EventRow => ({
  id: e.id,
  hlc: e.hlc,
  entity: e.entity,
  rowId: e.rowId,
  device: e.device,
  author: e.author,
  op: e.op,
  base: e.base,
  v: e.v,
  ...(e.data ? { data: e.data } : {}),
  ...(seq === undefined ? {} : { seq }),
});

export const materialize = (row: FoldedRow): MaterialRow => ({
  ...row.fields,
  id: row.id,
  deleted: row.deleted,
  hlc: row.hlc,
  createdBy: row.createdBy,
  createdByDevice: row.createdByDevice,
  conflict: row.conflict !== null,
});

export async function getMemberIds(db: MapleJarDb): Promise<Set<string>> {
  const household = (await db.meta.get('household'))?.value as
    | { members?: Array<{ userId: string }> }
    | undefined;
  return new Set((household?.members ?? []).map((m) => m.userId));
}

async function readWaiting(db: MapleJarDb): Promise<Set<string>> {
  return new Set(((await db.meta.get('waiting'))?.value as string[] | undefined) ?? []);
}

/** Zeilen, die noch auf Referenzen warten (werden nach neuen Ereignissen erneut berechnet). */
export async function waitingRefs(db: MapleJarDb): Promise<RowRef[]> {
  return [...(await readWaiting(db))].map((k) => {
    const [entity, rowId] = k.split(':') as [Entity, string];
    return { entity, rowId };
  });
}

/** Berechnet die genannten Zeilen neu und schreibt die materialisierten Tabellen. */
export async function refoldRows(
  db: MapleJarDb,
  refs: readonly RowRef[],
  memberIds: ReadonlySet<string>,
): Promise<void> {
  const unique = [
    ...new Map(refs.map((r): [string, RowRef] => [rowKey(r.entity, r.rowId), r])).values(),
  ];
  unique.sort((a, b) => ORDER.indexOf(a.entity) - ORDER.indexOf(b.entity));
  const waiting = await readWaiting(db);

  for (const ref of unique) {
    const events = (
      await db.events.where('[entity+rowId]').equals([ref.entity, ref.rowId]).toArray()
    ).map(toAppEvent);
    const categoryIds = new Set<string>();
    for (const e of events) {
      if (typeof e.data?.categoryId === 'string') categoryIds.add(e.data.categoryId);
    }
    const found = await db.category.bulkGet([...categoryIds]);
    const existing = new Set(found.filter((r) => r !== undefined).map((r) => r.id));
    const ctx: FoldContext = {
      hasCategory: (id) => existing.has(id),
      hasMember: (id) => memberIds.has(id),
    };
    const result = foldRow(ref.entity, events, ctx);
    const table = db[ref.entity];
    const key = rowKey(ref.entity, ref.rowId);
    if (result.row) {
      await table.put(materialize(result.row));
      if (result.row.conflict) {
        const c: ConflictRow = {
          ...result.row.conflict,
          id: key,
          entity: ref.entity,
          rowId: ref.rowId,
        };
        await db.conflicts.put(c);
      } else {
        await db.conflicts.delete(key);
      }
    } else {
      await table.delete(ref.rowId);
      await db.conflicts.delete(key);
    }
    if (result.waiting.length > 0) waiting.add(key);
    else waiting.delete(key);
  }
  await db.meta.put({ key: 'waiting', value: [...waiting] });
}
