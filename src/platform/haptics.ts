import { useState } from 'react';

/** Umgebungsmerkmale, die über Haptik entscheiden. Als Parameter, damit die Regeln rein testbar bleiben. */
export interface HapticEnv {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  webdriver: boolean;
}

/** iPhone und iPad (auch iPad im Desktop-Modus, das sich als Mac meldet, aber Touch hat). */
export function isIosTouch(env: HapticEnv): boolean {
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return true;
  return env.platform === 'MacIntel' && env.maxTouchPoints > 1;
}

/**
 * Das Overlay (ein nativer Switch über der Schaltfläche) nur auf iOS-Touchgeräten und nicht unter
 * Automatisierung. Playwright soll so die echte Schaltfläche treffen. Ohne Haptik-Unterstützung ist das
 * Overlay ein unsichtbarer Tap-Fänger, der dieselbe Aktion auslöst.
 */
export function hapticOverlayEnabled(env: HapticEnv): boolean {
  return !env.webdriver && isIosTouch(env);
}

export function readHapticEnv(): HapticEnv {
  if (typeof navigator === 'undefined') {
    return { userAgent: '', platform: '', maxTouchPoints: 0, webdriver: false };
  }
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    webdriver: navigator.webdriver === true,
  };
}

/** Einmal pro Seitenladung berechnet: Die Umgebung ändert sich während der Sitzung nicht. */
export function useHapticOverlay(): boolean {
  const [enabled] = useState(() => hapticOverlayEnabled(readHapticEnv()));
  return enabled;
}
