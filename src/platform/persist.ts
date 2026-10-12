import { useEffect, useState } from 'react';

let result: boolean | null = null;
let pending: Promise<boolean> | null = null;

/** Fragt bei jedem Start dauerhaften Speicher an. Fehler werden ignoriert. */
export function requestPersistence(): Promise<boolean> {
  pending ??= (async () => {
    try {
      const granted = (await navigator.storage?.persist?.()) ?? false;
      result = granted || (await navigator.storage?.persisted?.()) || false;
    } catch {
      result = false;
    }
    return result;
  })();
  return pending;
}

export function usePersisted(): boolean | null {
  const [value, setValue] = useState<boolean | null>(result);
  useEffect(() => {
    let alive = true;
    void requestPersistence().then((v) => alive && setValue(v));
    return () => {
      alive = false;
    };
  }, []);
  return value;
}
