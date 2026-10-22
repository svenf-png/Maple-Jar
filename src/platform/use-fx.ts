import { useEffect, useState } from 'react';
import { type FxProvider, type FxRate, fetchRate, lastKnownRate } from '../data/fx/frankfurter';
import type { KnownRate } from '../domain/fx';

export type FxState =
  | { status: 'loading' }
  | { status: 'ready'; rate: FxRate }
  | { status: 'unavailable' };

export function useTodayRate(provider: FxProvider): FxState {
  const [state, setState] = useState<FxState>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    const today = new Date().toISOString().slice(0, 10);
    fetchRate(today, provider)
      .then((rate) => alive && setState({ status: 'ready', rate }))
      .catch(() => alive && setState({ status: 'unavailable' }));
    return () => {
      alive = false;
    };
  }, [provider]);
  return state;
}

/** Kurs für einen Tag wie `useEntryRate`, aber einmalig und ohne Hook: Tageskurs (max. 3 s), sonst letzter bekannter. */
export async function fetchKnownRate(
  provider: FxProvider,
  date: string,
): Promise<KnownRate | null> {
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 3000));
  const fetched = navigator.onLine
    ? await Promise.race([fetchRate(date, provider).catch(() => null), timeout])
    : null;
  const r = fetched ?? (await lastKnownRate(provider));
  return r ? { rateMicro: r.rateMicro, date: r.date, stale: r.stale } : null;
}

export interface EntryRateState {
  status: 'idle' | 'loading' | 'ready' | 'missing';
  rate: KnownRate | null;
}

/**
 * Kurs für einen Eintrag in EUR am Buchungsdatum. Online: Tageskurs; offline oder zu langsam: letzter
 * bekannter Kurs (als veraltet markiert, ergibt später „vorläufig“); sonst `missing`.
 */
export function useEntryRate(
  currency: 'CAD' | 'EUR',
  date: string,
  provider: FxProvider,
): EntryRateState {
  const [state, setState] = useState<EntryRateState>({ status: 'idle', rate: null });
  useEffect(() => {
    if (currency !== 'EUR') {
      setState({ status: 'idle', rate: null });
      return;
    }
    let alive = true;
    setState((s) => ({ status: 'loading', rate: s.rate }));
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 3000));
    Promise.race([fetchRate(date, provider).catch(() => null), timeout])
      .then(async (r) => r ?? (await lastKnownRate(provider)))
      .then((r) => {
        if (!alive) return;
        setState(
          r
            ? { status: 'ready', rate: { rateMicro: r.rateMicro, date: r.date, stale: r.stale } }
            : { status: 'missing', rate: null },
        );
      });
    return () => {
      alive = false;
    };
  }, [currency, date, provider]);
  return state;
}
