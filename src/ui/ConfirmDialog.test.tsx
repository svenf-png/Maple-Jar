import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setLang } from '../i18n/t';
import { ConfirmDialog } from './ConfirmDialog';

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

const hosts: HTMLElement[] = [];
afterEach(() => {
  for (const h of hosts.splice(0)) h.remove();
});

function mount(props: Partial<Parameters<typeof ConfirmDialog>[0]>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  const handlers = { onConfirm: vi.fn(), onCancel: vi.fn(), onAlt: vi.fn() };
  act(() => {
    createRoot(host).render(
      <ConfirmDialog
        open
        title="Titel"
        text={'Noch nicht synchronisiert: 3. Beim Abmelden gehen sie verloren.'}
        confirmLabel={'Trotzdem abmelden'}
        altLabel={'Erst synchronisieren'}
        {...handlers}
        {...props}
      />,
    );
  });
  const button = (name: string) =>
    [...host.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement;
  return { host, button, ...handlers };
}

describe('ConfirmDialog mit Warnung', () => {
  it('zeigt die Anzahl im Text und alle drei Aktionen', () => {
    const { host, button } = mount({});
    expect(host.textContent).toContain('Noch nicht synchronisiert: 3');
    expect(button('Erst synchronisieren')).toBeTruthy();
    expect(button('Trotzdem abmelden')).toBeTruthy();
    expect(button('Abbrechen')).toBeTruthy();
  });

  it('„Erst synchronisieren“ löst nur die Alternative aus, nicht die Bestätigung', () => {
    const { button, onAlt, onConfirm } = mount({});
    act(() => button('Erst synchronisieren').click());
    expect(onAlt).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('ohne Alternative bleibt nur Bestätigen und Abbrechen', () => {
    const { host } = mount({ altLabel: undefined, onAlt: undefined });
    expect(host.querySelectorAll('button')).toHaveLength(2);
  });
});
