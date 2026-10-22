import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => {
  let waiting = false;
  const listeners = new Set<() => void>();
  const set = (v: boolean) => {
    waiting = v;
    for (const l of listeners) l();
  };
  return {
    set,
    subscribeUpdate: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getUpdateSnapshot: () => waiting,
    dismissUpdate: vi.fn(() => set(false)),
    applyRegisteredUpdate: vi.fn(),
    shouldShowUpdatePrompt: (pending: boolean, pathname: string) =>
      pending && pathname !== '/erfassen',
  };
});
vi.mock('../platform/sw-update', () => store);

import { UpdatePrompt } from './UpdatePrompt';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function mount(path = '/') {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <UpdatePrompt />
      </MemoryRouter>,
    ),
  );
}

const status = () => host.querySelector('[role="status"]');
const button = (name: RegExp) =>
  Array.from(host.querySelectorAll('button')).find((b) => name.test(b.textContent ?? ''));

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  act(() => store.set(false));
  vi.clearAllMocks();
});

describe('UpdatePrompt', () => {
  it('ist ohne Update unsichtbar', () => {
    mount();
    expect(status()).toBeNull();
  });
  it('ist mit Update sichtbar', () => {
    mount();
    act(() => store.set(true));
    expect(status()).not.toBeNull();
    expect(host.textContent).toMatch(/Neue Version verfügbar|New version available/);
  });
  it('bleibt auf einem Vollbild-Formular verborgen', () => {
    mount('/erfassen');
    act(() => store.set(true));
    expect(status()).toBeNull();
  });
  it('Später blendet aus', () => {
    mount();
    act(() => store.set(true));
    act(() => button(/Später|Later/)?.click());
    expect(store.dismissUpdate).toHaveBeenCalledTimes(1);
    expect(status()).toBeNull();
  });
  it('Neu laden wendet das Update an', () => {
    mount();
    act(() => store.set(true));
    act(() => button(/Neu laden|Reload/)?.click());
    expect(store.applyRegisteredUpdate).toHaveBeenCalledTimes(1);
  });
});
