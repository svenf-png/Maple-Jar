import { describe, expect, it } from 'vitest';
import { type HapticEnv, hapticOverlayEnabled, isIosTouch } from './haptics';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

const env = (over: Partial<HapticEnv>): HapticEnv => ({
  userAgent: IPHONE_UA,
  platform: 'iPhone',
  maxTouchPoints: 5,
  webdriver: false,
  ...over,
});

describe('haptics', () => {
  it('erkennt iPhone mit Touch und aktiviert das Overlay', () => {
    expect(isIosTouch(env({}))).toBe(true);
    expect(hapticOverlayEnabled(env({}))).toBe(true);
  });

  it('erkennt iPad im Desktop-Modus über Touchpunkte', () => {
    const e = env({ userAgent: IPAD_DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 5 });
    expect(isIosTouch(e)).toBe(true);
    expect(hapticOverlayEnabled(e)).toBe(true);
  });

  it('Mac ohne Touch bekommt kein Overlay', () => {
    const e = env({ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 0 });
    expect(isIosTouch(e)).toBe(false);
    expect(hapticOverlayEnabled(e)).toBe(false);
  });

  it('Android bekommt kein Overlay', () => {
    const e = env({ userAgent: ANDROID_UA, platform: 'Linux armv81', maxTouchPoints: 5 });
    expect(isIosTouch(e)).toBe(false);
    expect(hapticOverlayEnabled(e)).toBe(false);
  });

  it('Automatisierung (navigator.webdriver) schaltet das Overlay ab, iOS bleibt erkannt', () => {
    const e = env({ webdriver: true });
    expect(isIosTouch(e)).toBe(true);
    expect(hapticOverlayEnabled(e)).toBe(false);
  });
});
