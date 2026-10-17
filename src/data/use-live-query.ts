import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

/** Liest aus Dexie und rendert bei jeder Änderung neu (Kern der Regel „UI liest nur aus Dexie“). */
export function useLiveQuery<T>(query: () => Promise<T> | T, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: () => {} });
    return () => sub.unsubscribe();
    // biome-ignore lint/correctness/useExhaustiveDependencies: Aufrufer geben `deps` explizit an
  }, deps);
  return value;
}
