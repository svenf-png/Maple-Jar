import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HapticTarget } from './HapticTarget';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(props: { overlay: boolean; busy?: boolean; disabled?: boolean }, onTap: () => void) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <HapticTarget onTap={onTap} {...props}>
        Speichern
      </HapticTarget>,
    );
  });
  return {
    host,
    button: host.querySelector('button') as HTMLButtonElement,
    overlay: host.querySelector('input[data-haptic-switch]') as HTMLInputElement | null,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('HapticTarget', () => {
  it('mit Overlay: ein Tap auf das Overlay löst genau einmal aus', () => {
    const onTap = vi.fn();
    const { overlay, unmount } = mount({ overlay: true }, onTap);
    expect(overlay).not.toBeNull();
    act(() => overlay?.click());
    expect(onTap).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('mit Overlay: das Overlay ist ein nativer Switch, für Hilfstechnik verborgen und nicht fokussierbar', () => {
    const { overlay, unmount } = mount({ overlay: true }, vi.fn());
    expect(overlay?.hasAttribute('switch')).toBe(true);
    expect(overlay?.getAttribute('aria-hidden')).toBe('true');
    expect(overlay?.getAttribute('tabindex')).toBe('-1');
    unmount();
  });

  it('mit Overlay: der Schaltfläche-Klick löst ebenfalls genau einmal aus (Tastatur, VoiceOver)', () => {
    const onTap = vi.fn();
    const { button, unmount } = mount({ overlay: true }, onTap);
    act(() => button.click());
    expect(onTap).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('ohne Overlay: kein Switch im DOM, Klick auf die Schaltfläche löst aus', () => {
    const onTap = vi.fn();
    const { overlay, button, unmount } = mount({ overlay: false }, onTap);
    expect(overlay).toBeNull();
    act(() => button.click());
    expect(onTap).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('busy oder disabled: kein Overlay', () => {
    const busy = mount({ overlay: true, busy: true }, vi.fn());
    expect(busy.overlay).toBeNull();
    busy.unmount();
    const disabled = mount({ overlay: true, disabled: true }, vi.fn());
    expect(disabled.overlay).toBeNull();
    disabled.unmount();
  });
});
