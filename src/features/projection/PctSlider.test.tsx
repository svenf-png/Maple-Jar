import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLocale } from '../../i18n/t';
import { PctSlider } from './PctSlider';
import { signedPercent } from './projection-format';

// Die Komponente sendet nur beim nativen `change`-Ereignis, nicht bei React onChange/input.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(value: number, onCommit: (v: number) => void) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <PctSlider
        label="Kategorie A"
        value={value}
        onCommit={onCommit}
        hint="Ø 100 → 110"
        tileIcon="sonstiges"
        tileColor="steelblue"
      />,
    );
  });
  const input = host.querySelector('input') as HTMLInputElement;
  return {
    input,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('PctSlider', () => {
  it('speichert nicht bei input-Ereignissen', () => {
    const onCommit = vi.fn();
    const { input, unmount } = mount(0, onCommit);
    act(() => {
      setNativeValue(input, '20');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onCommit).not.toHaveBeenCalled();
    unmount();
  });

  it('speichert beim nativen change-Ereignis, wenn der Wert sich ändert', () => {
    const onCommit = vi.fn();
    const { input, unmount } = mount(0, onCommit);
    act(() => {
      setNativeValue(input, '20');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(20);
    unmount();
  });

  it('speichert nicht, wenn der Wert dem gespeicherten entspricht', () => {
    const onCommit = vi.fn();
    const { input, unmount } = mount(20, onCommit);
    act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onCommit).not.toHaveBeenCalled();
    unmount();
  });

  it('zeigt Vorzeichen und Minus U+2212 im Wert', () => {
    const { input, unmount } = mount(-20, () => {});
    expect(input.getAttribute('aria-valuetext')).toBe('−20%');
    unmount();
  });

  it('übernimmt eine Eingabe, die vor den passiven Effekten eintrifft', async () => {
    const flag = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean | undefined };
    const before = flag.IS_REACT_ACT_ENVIRONMENT;
    flag.IS_REACT_ACT_ENVIRONMENT = false;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const onCommit = vi.fn();
    const observer = new MutationObserver(() => {
      const input = host.querySelector<HTMLInputElement>('input[type=range]');
      if (!input) return;
      observer.disconnect();
      // Mikrotask direkt nach dem Commit, vor den passiven Effekten.
      setNativeValue(input, '-20');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    observer.observe(host, { childList: true, subtree: true });
    try {
      root.render(
        <PctSlider
          label="Kategorie A"
          value={0}
          onCommit={onCommit}
          tileIcon="sonstiges"
          tileColor="steelblue"
        />,
      );
      await new Promise((r) => setTimeout(r, 0));
      expect(onCommit).toHaveBeenCalledWith(-20);
      const input = host.querySelector('input') as HTMLInputElement;
      expect(input.getAttribute('aria-valuetext')).toBe(signedPercent(-20, getLocale()));
    } finally {
      observer.disconnect();
      root.unmount();
      host.remove();
      flag.IS_REACT_ACT_ENVIRONMENT = before;
    }
  });
});
