import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyUpdate,
  canUpdate,
  dismissUpdate,
  getUpdateSnapshot,
  isFormPath,
  shouldShowUpdatePrompt,
  startUpdateChecks,
  subscribeUpdate,
  UPDATE_CHECK_MIN_GAP_MS,
  watchRegistration,
} from './sw-update';

type Listener = () => void;

/** Kleiner EventTarget-Ersatz mit Auslöser. */
function emitter() {
  const map = new Map<string, Listener[]>();
  return {
    addEventListener: vi.fn((type: string, l: Listener) => {
      map.set(type, [...(map.get(type) ?? []), l]);
    }),
    fire: (type: string) => {
      for (const l of map.get(type) ?? []) l();
    },
  };
}

function fakeReg(
  over: {
    active?: unknown;
    installing?: unknown;
    waiting?: unknown;
    update?: () => Promise<void>;
  } = {},
) {
  const ev = emitter();
  const reg = {
    active: {},
    installing: null,
    waiting: null,
    update: vi.fn(() => Promise.resolve()),
    addEventListener: ev.addEventListener,
    ...over,
  };
  return { reg: reg as unknown as ServiceWorkerRegistration, ev, raw: reg };
}

function fakeDoc(state: 'visible' | 'hidden' = 'visible') {
  const ev = emitter();
  const doc = { visibilityState: state, addEventListener: ev.addEventListener };
  return {
    doc: doc as unknown as Document,
    show: () => {
      doc.visibilityState = 'visible';
      ev.fire('visibilitychange');
    },
    hide: () => {
      doc.visibilityState = 'hidden';
      ev.fire('visibilitychange');
    },
  };
}

beforeEach(() => {
  dismissUpdate();
});

describe('canUpdate', () => {
  it('ist wahr bei aktivem Worker ohne Installation', () => {
    expect(canUpdate(fakeReg().reg)).toBe(true);
  });
  it('ist falsch ohne aktiven Worker', () => {
    expect(canUpdate(fakeReg({ active: null }).reg)).toBe(false);
  });
  it('ist falsch während einer Installation', () => {
    expect(canUpdate(fakeReg({ installing: {} }).reg)).toBe(false);
  });
});

describe('startUpdateChecks', () => {
  it('prüft sofort einmal', () => {
    const { reg, raw } = fakeReg();
    startUpdateChecks(reg, fakeDoc().doc, () => 0);
    expect(raw.update).toHaveBeenCalledTimes(1);
  });
  it('prüft nicht ohne aktiven Worker', () => {
    const { reg, raw } = fakeReg({ active: null });
    startUpdateChecks(reg, fakeDoc().doc, () => 0);
    expect(raw.update).not.toHaveBeenCalled();
  });
  it('hält den Mindestabstand ein (59 s nein, 61 s ja)', () => {
    const { reg, raw } = fakeReg();
    const d = fakeDoc();
    let t = 1_000;
    startUpdateChecks(reg, d.doc, () => t);
    t += UPDATE_CHECK_MIN_GAP_MS - 1_000;
    d.show();
    expect(raw.update).toHaveBeenCalledTimes(1);
    t += 2_000;
    d.show();
    expect(raw.update).toHaveBeenCalledTimes(2);
  });
  it('prüft nicht im Hintergrund', () => {
    const { reg, raw } = fakeReg();
    const d = fakeDoc();
    let t = 0;
    startUpdateChecks(reg, d.doc, () => t);
    t += 10 * UPDATE_CHECK_MIN_GAP_MS;
    d.hide();
    expect(raw.update).toHaveBeenCalledTimes(1);
  });
  it('schluckt Fehler von update()', async () => {
    const { reg, raw } = fakeReg({ update: () => Promise.reject(new Error('offline')) });
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    startUpdateChecks(reg, fakeDoc().doc, () => 0);
    await new Promise((r) => setTimeout(r, 0));
    process.off('unhandledRejection', unhandled);
    expect(raw.active).toBeTruthy();
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe('watchRegistration', () => {
  it('meldet ein wartendes Update bei vorhandenem Controller', () => {
    watchRegistration(fakeReg({ waiting: {} }).reg, { controller: {} as ServiceWorker });
    expect(getUpdateSnapshot()).toBe(true);
  });
  it('meldet nichts ohne Controller (Erstinstallation)', () => {
    watchRegistration(fakeReg({ waiting: {} }).reg, { controller: null });
    expect(getUpdateSnapshot()).toBe(false);
  });
  it('meldet nichts ohne wartenden Worker', () => {
    watchRegistration(fakeReg().reg, { controller: {} as ServiceWorker });
    expect(getUpdateSnapshot()).toBe(false);
  });
  function viaUpdateFound(controller: ServiceWorker | null) {
    const worker = { state: 'installing', ...emitter() };
    const { reg, ev, raw } = fakeReg();
    raw.installing = worker as never;
    watchRegistration(reg, { controller });
    ev.fire('updatefound');
    return { worker };
  }
  it('meldet über updatefound und statechange installed mit Controller', () => {
    const { worker } = viaUpdateFound({} as ServiceWorker);
    expect(getUpdateSnapshot()).toBe(false);
    worker.state = 'installed';
    worker.fire('statechange');
    expect(getUpdateSnapshot()).toBe(true);
  });
  it('meldet über updatefound nichts ohne Controller', () => {
    const { worker } = viaUpdateFound(null);
    worker.state = 'installed';
    worker.fire('statechange');
    expect(getUpdateSnapshot()).toBe(false);
  });
  it('dismissUpdate blendet aus und benachrichtigt Abonnenten', () => {
    watchRegistration(fakeReg({ waiting: {} }).reg, { controller: {} as ServiceWorker });
    const listener = vi.fn();
    const off = subscribeUpdate(listener);
    dismissUpdate();
    expect(getUpdateSnapshot()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    watchRegistration(fakeReg({ waiting: {} }).reg, { controller: {} as ServiceWorker });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('applyUpdate', () => {
  it('schickt SKIP_WAITING und lädt genau einmal bei controllerchange', () => {
    const postMessage = vi.fn();
    const { reg } = fakeReg({ waiting: { postMessage } });
    const sw = emitter();
    const reload = vi.fn();
    applyUpdate(reg, sw, reload);
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    sw.fire('controllerchange');
    sw.fire('controllerchange');
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('lädt direkt neu, wenn nichts wartet', () => {
    const sw = emitter();
    const reload = vi.fn();
    applyUpdate(fakeReg().reg, sw, reload);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sw.addEventListener).not.toHaveBeenCalled();
  });
});

describe('shouldShowUpdatePrompt', () => {
  it('zeigt auf normalen Seiten, wenn ein Update wartet', () => {
    for (const path of [
      '/',
      '/verlauf',
      '/einstellungen',
      '/budgets',
      '/eintrag/abc',
      '/ziel/abc',
      '/planung',
    ]) {
      expect(shouldShowUpdatePrompt(true, path)).toBe(true);
    }
  });
  it('zeigt nichts ohne wartendes Update', () => {
    expect(shouldShowUpdatePrompt(false, '/')).toBe(false);
  });
  it('hält den Hinweis auf Vollbild-Formularen zurück', () => {
    for (const path of [
      '/erfassen',
      '/eintrag/abc/bearbeiten',
      '/ziel/neu',
      '/ziel/abc/bearbeiten',
      '/fixkosten/neu',
      '/fixkosten/abc',
      '/einnahme/neu',
      '/einnahme/abc',
    ]) {
      expect(isFormPath(path)).toBe(true);
      expect(shouldShowUpdatePrompt(true, path)).toBe(false);
    }
  });
});
