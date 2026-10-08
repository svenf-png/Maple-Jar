import { useEffect, useState } from 'react';
import type { FxProvider } from '../data/fx/frankfurter';
import { type FxRate, fetchRate } from '../data/fx/frankfurter';

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
