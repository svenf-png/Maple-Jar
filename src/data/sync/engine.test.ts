import { describe, expect, it, vi } from 'vitest';
import { initialSyncState, reduceSync, type SyncState, statusOf } from './engine';
import { createScheduler, type SchedulerEnv } from './scheduler';

const base: SyncState = { ...initialSyncState };

describe('reduceSync / statusOf', () => {
  it('verbunden im Normalzustand', () => {
    expect(statusOf(base)).toEqual({ kind: 'connected' });
  });

  it('ausstehende Ereignisse werden gezählt', () => {
    expect(statusOf(reduceSync(base, { type: 'pending', count: 3 }))).toEqual({
      kind: 'pending',
      count: 3,
    });
  });

  it('offline hat Vorrang vor ausstehend, Anmeldung erneuern vor offline', () => {
    let s = reduceSync(base, { type: 'pending', count: 2 });
    s = reduceSync(s, { type: 'online', online: false });
    expect(statusOf(s)).toEqual({ kind: 'offline', pending: 2 });
    s = reduceSync(s, { type: 'failure', problem: 'auth' });
    expect(statusOf(s)).toEqual({ kind: 'reauth' });
  });

  it('Netzfehler ohne offene Änderungen zeigt offline mit null wartenden', () => {
    expect(statusOf(reduceSync(base, { type: 'failure', problem: 'network' }))).toEqual({
      kind: 'offline',
      pending: 0,
    });
  });

  it('Fehler schlägt ausstehend, Anmeldung erneuern schlägt Fehler', () => {
    let s = reduceSync(reduceSync(base, { type: 'pending', count: 3 }), {
      type: 'failure',
      problem: 'server',
    });
    expect(statusOf(s)).toEqual({ kind: 'error' });
    s = reduceSync(s, { type: 'failure', problem: 'auth' });
    expect(statusOf(s)).toEqual({ kind: 'reauth' });
  });

  it('andere Fehler zeigen Sync gestört (ohne ausstehende)', () => {
    expect(statusOf(reduceSync(base, { type: 'failure', problem: 'server' }))).toEqual({
      kind: 'error',
    });
  });

  it('Erfolg und erneute Anmeldung räumen Fehler auf', () => {
    let s = reduceSync(base, { type: 'failure', problem: 'auth' });
    s = reduceSync(s, { type: 'reauthenticated' });
    expect(statusOf(s)).toEqual({ kind: 'connected' });
    s = reduceSync(base, { type: 'failure', problem: 'server' });
    s = reduceSync(s, { type: 'success', at: 5 });
    expect(s).toMatchObject({ problem: null, lastSyncAt: 5, running: false });
  });
});

function fakeEnv() {
  const timers = new Map<number, { fn: () => void; ms: number; repeat: boolean }>();
  let id = 0;
  let onOnline = () => {};
  let onVisible = () => {};
  const state = { visible: true, online: true };
  const env: SchedulerEnv = {
    setTimeout: (fn, ms) => {
      timers.set(++id, { fn, ms, repeat: false });
      return id;
    },
    clearTimeout: (h) => void timers.delete(h as number),
    setInterval: (fn, ms) => {
      timers.set(++id, { fn, ms, repeat: true });
      return id;
    },
    clearInterval: (h) => void timers.delete(h as number),
    isVisible: () => state.visible,
    isOnline: () => state.online,
    listen: (o, v) => {
      onOnline = o;
      onVisible = v;
      return () => {};
    },
  };
  return {
    env,
    state,
    fire: (ms: number) => {
      for (const [key, t] of [...timers]) {
        if (t.ms === ms) {
          if (!t.repeat) timers.delete(key);
          t.fn();
        }
      }
    },
    online: () => onOnline(),
    visible: () => onVisible(),
    timers,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Scheduler', () => {
  it('läuft beim Start, bei online, beim Sichtbarwerden und im 60-s-Takt (nur sichtbar und online)', async () => {
    const f = fakeEnv();
    const run = vi.fn(async () => {});
    const s = createScheduler({ run, env: f.env });
    s.start();
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
    f.online();
    await flush();
    f.visible();
    await flush();
    expect(run).toHaveBeenCalledTimes(3);
    f.fire(60_000);
    await flush();
    expect(run).toHaveBeenCalledTimes(4);
    f.state.visible = false;
    f.fire(60_000);
    await flush();
    expect(run).toHaveBeenCalledTimes(4);
    s.stop();
    expect(f.timers.size).toBe(0);
  });

  it('poke läuft 2 s nach der Änderung und fasst mehrere Änderungen zusammen', async () => {
    const f = fakeEnv();
    const run = vi.fn(async () => {});
    const s = createScheduler({ run, env: f.env });
    s.poke();
    s.poke();
    s.poke();
    expect([...f.timers.values()].filter((t) => t.ms === 2000)).toHaveLength(1);
    f.fire(2000);
    await flush();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('parallele Auslöser laufen nie gleichzeitig, ein Folgelauf wird nachgeholt', async () => {
    const f = fakeEnv();
    let active = 0;
    let max = 0;
    const run = vi.fn(async () => {
      active++;
      max = Math.max(max, active);
      await flush();
      active--;
    });
    const s = createScheduler({ run, env: f.env });
    s.runNow();
    s.runNow();
    s.runNow();
    await new Promise((r) => setTimeout(r, 20));
    expect(max).toBe(1);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
