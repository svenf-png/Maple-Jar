import Dexie, { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import type { ActivityEvent } from '../domain/activity';
import {
  type Budget,
  type Category,
  type Entry,
  toBudget,
  toCategory,
  toEntry,
} from '../domain/model';
import { db } from './db';
import { useLiveQuery } from './use-live-query';

// Lesezugriffe der UI: nur aus Dexie, live.

export const useEntries = (): Entry[] =>
  useLiveQuery(async () => (await db.entry.toArray()).map(toEntry), [], []);

export const useCategories = (): Category[] =>
  useLiveQuery(
    async () => (await db.category.toArray()).map(toCategory).sort((a, b) => a.sort - b.sort),
    [],
    [],
  );

export const useBudgets = (): Budget[] =>
  useLiveQuery(async () => (await db.budget.toArray()).map(toBudget), [], []);

export const useConflictCount = (): number => useLiveQuery(() => db.conflicts.count(), [], 0);

/** Alle Ereignisse zu Einträgen (für Aktivität und Historie). */
export const useEntryEvents = (): ActivityEvent[] =>
  useLiveQuery(
    async () =>
      (
        await db.events
          .where('[entity+rowId]')
          .between(['entry', Dexie.minKey], ['entry', Dexie.maxKey])
          .toArray()
      ).map((e) => ({
        id: e.id,
        hlc: e.hlc,
        author: e.author,
        entity: e.entity,
        rowId: e.rowId,
        op: e.op,
        data: e.data,
      })),
    [],
    [],
  );

/** `true`, sobald die erste Abfrage geladen ist (verhindert Leerzustands-Flackern). */
export function useLoaded(): boolean {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const sub = liveQuery(() => db.entry.count()).subscribe({
      next: () => setLoaded(true),
      error: () => setLoaded(true),
    });
    return () => sub.unsubscribe();
  }, []);
  return loaded;
}
