// Hybrid Logical Clock. Textform: `<ISO-Zeit mit ms>-<Zähler hex4>-<deviceId>`; als Text vergleichbar.

export interface HlcState {
  ms: number;
  counter: number;
}

export interface ParsedHlc extends HlcState {
  device: string;
}

/** Fremde Zeitstempel, die weiter als das in der Zukunft liegen, werden nicht übernommen. */
export const MAX_DRIFT_MS = 24 * 60 * 60 * 1000;
const MAX_COUNTER = 0xffff;

export const HLC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z-[0-9a-f]{4}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const ZERO_HLC: HlcState = { ms: 0, counter: 0 };

export function formatHlc(state: HlcState, device: string): string {
  const counter = state.counter.toString(16).padStart(4, '0');
  return `${new Date(state.ms).toISOString()}-${counter}-${device}`;
}

export function parseHlc(text: string): ParsedHlc | null {
  if (!HLC_PATTERN.test(text)) return null;
  const ms = Date.parse(text.slice(0, 24));
  if (Number.isNaN(ms)) return null;
  return { ms, counter: Number.parseInt(text.slice(25, 29), 16), device: text.slice(30) };
}

/** Nächster Zustand für ein lokales Ereignis. Streng monoton, auch bei zurückspringender Uhr. */
export function tickHlc(prev: HlcState, nowMs: number): HlcState {
  const ms = Math.max(prev.ms, nowMs);
  const counter = ms === prev.ms ? prev.counter + 1 : 0;
  return counter > MAX_COUNTER ? { ms: ms + 1, counter: 0 } : { ms, counter };
}

/** Zustand nach dem Empfang eines fremden Ereignisses (damit spätere eigene Ereignisse danach liegen). */
export function receiveHlc(prev: HlcState, remote: HlcState, nowMs: number): HlcState {
  const usable = remote.ms <= nowMs + MAX_DRIFT_MS ? remote : ZERO_HLC;
  const ms = Math.max(prev.ms, usable.ms, nowMs);
  let counter = 0;
  if (ms === prev.ms && ms === usable.ms) counter = Math.max(prev.counter, usable.counter) + 1;
  else if (ms === prev.ms) counter = prev.counter + 1;
  else if (ms === usable.ms) counter = usable.counter + 1;
  return counter > MAX_COUNTER ? { ms: ms + 1, counter: 0 } : { ms, counter };
}

export const compareHlc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
