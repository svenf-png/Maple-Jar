import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setLang } from '../../i18n/t';
import { LogoutDialog } from './LogoutDialog';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  setLang('de');
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanup.splice(0)) c();
});

function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  cleanup.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  const render = (open: boolean, pending: number) =>
    act(() =>
      root.render(
        <LogoutDialog open={open} pending={pending} onOpenChange={() => {}} onError={() => {}} />,
      ),
    );
  const labels = () => [...host.querySelectorAll('button')].map((b) => b.textContent);
  return { host, render, labels };
}

describe('LogoutDialog', () => {
  it('hält Text und Knöpfe stabil, wenn sich die Live-Zahl im offenen Dialog ändert', () => {
    const { host, render, labels } = mount();
    render(false, 2);
    render(true, 2);
    const before = { text: host.textContent, labels: labels() };
    expect(before.text).toContain('Noch nicht synchronisiert: 2');
    expect(before.labels[0]).toBe('Erst synchronisieren');
    render(true, 0);
    expect({ text: host.textContent, labels: labels() }).toEqual(before);
    render(true, 5);
    expect({ text: host.textContent, labels: labels() }).toEqual(before);
  });

  it('nimmt beim erneuten Öffnen die aktuelle Zahl', () => {
    const { host, render, labels } = mount();
    render(true, 2);
    render(true, 0);
    render(false, 0);
    render(true, 0);
    expect(host.textContent).toContain('Zugangsdaten und alle lokalen Daten');
    expect(labels()).toHaveLength(2);
  });
});
