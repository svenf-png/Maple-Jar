// Löst Sync-Läufe aus: App-Start, sichtbar, online, 2 s nach lokaler Änderung, 60 s im Vordergrund.

export interface SchedulerEnv {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  isVisible(): boolean;
  isOnline(): boolean;
  /** Registriert Seitenereignisse (online, visibilitychange); gibt die Abmeldung zurück. */
  listen(onOnline: () => void, onVisible: () => void): () => void;
}

export const browserEnv: SchedulerEnv = {
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (h) => window.clearTimeout(h as number),
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (h) => window.clearInterval(h as number),
  isVisible: () => document.visibilityState === 'visible',
  isOnline: () => navigator.onLine,
  listen(onOnline, onVisible) {
    const visible = () => {
      if (document.visibilityState === 'visible') onVisible();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', visible);
    };
  },
};

export interface Scheduler {
  start(): void;
  stop(): void;
  /** Nach einer lokalen Änderung: Lauf nach `debounceMs`. */
  poke(): void;
  /** Sofort (läuft ein Lauf, folgt direkt ein weiterer). */
  runNow(): void;
}

export function createScheduler(opts: {
  run: () => Promise<void>;
  env?: SchedulerEnv;
  intervalMs?: number;
  debounceMs?: number;
}): Scheduler {
  const env = opts.env ?? browserEnv;
  const intervalMs = opts.intervalMs ?? 60_000;
  const debounceMs = opts.debounceMs ?? 2_000;
  let running = false;
  let again = false;
  let timer: unknown = null;
  let interval: unknown = null;
  let unlisten: (() => void) | null = null;

  async function execute(): Promise<void> {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        await opts.run();
      } while (again);
    } finally {
      running = false;
    }
  }

  const runNow = () => void execute();

  return {
    start() {
      if (interval !== null) return;
      unlisten = env.listen(runNow, runNow);
      interval = env.setInterval(() => {
        if (env.isVisible() && env.isOnline()) runNow();
      }, intervalMs);
      runNow();
    },
    stop() {
      if (timer !== null) env.clearTimeout(timer);
      if (interval !== null) env.clearInterval(interval);
      timer = null;
      interval = null;
      unlisten?.();
      unlisten = null;
    },
    poke() {
      if (timer !== null) env.clearTimeout(timer);
      timer = env.setTimeout(() => {
        timer = null;
        runNow();
      }, debounceMs);
    },
    runNow,
  };
}
