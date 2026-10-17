import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PctSlider } from './PctSlider';

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
    expect(input.getAttribute('aria-valuetext')).toBe('−20 %');
    unmount();
  });
});
