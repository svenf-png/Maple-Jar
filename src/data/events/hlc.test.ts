import { describe, expect, it } from 'vitest';
import {
  compareHlc,
  formatHlc,
  HLC_PATTERN,
  MAX_DRIFT_MS,
  parseHlc,
  receiveHlc,
  tickHlc,
  ZERO_HLC,
} from './hlc';
import { DEV_A, DEV_B, T0 } from './test-helpers';

describe('hlc format', () => {
  it('round-trips and matches the pattern', () => {
    const text = formatHlc({ ms: T0, counter: 3 }, DEV_A);
    expect(text).toBe(`2027-01-01T12:00:00.000Z-0003-${DEV_A}`);
    expect(HLC_PATTERN.test(text)).toBe(true);
    expect(parseHlc(text)).toEqual({ ms: T0, counter: 3, device: DEV_A });
  });

  it('rejects malformed values', () => {
    expect(parseHlc('nope')).toBeNull();
    expect(parseHlc(`2027-13-01T12:00:00.000Z-0003-${DEV_A}`)).toBeNull();
  });

  it('text order equals (ms, counter) order', () => {
    const a = formatHlc({ ms: T0, counter: 9 }, DEV_A);
    const b = formatHlc({ ms: T0, counter: 10 }, DEV_A);
    const c = formatHlc({ ms: T0 + 1, counter: 0 }, DEV_A);
    expect(compareHlc(a, b)).toBeLessThan(0);
    expect(compareHlc(b, c)).toBeLessThan(0);
    expect(compareHlc(c, a)).toBeGreaterThan(0);
  });

  it('breaks ties by device id', () => {
    const a = formatHlc({ ms: T0, counter: 0 }, DEV_A);
    const b = formatHlc({ ms: T0, counter: 0 }, DEV_B);
    expect(compareHlc(a, b)).toBeLessThan(0);
  });
});

describe('tickHlc', () => {
  it('follows the wall clock', () => {
    expect(tickHlc(ZERO_HLC, T0)).toEqual({ ms: T0, counter: 0 });
  });

  it('stays monotonic when the clock stands still', () => {
    const a = tickHlc(ZERO_HLC, T0);
    const b = tickHlc(a, T0);
    const c = tickHlc(b, T0);
    expect([a.counter, b.counter, c.counter]).toEqual([0, 1, 2]);
  });

  it('stays monotonic when the clock jumps back', () => {
    const a = tickHlc(ZERO_HLC, T0);
    const b = tickHlc(a, T0 - 60_000);
    expect(b.ms).toBe(T0);
    expect(b.counter).toBe(1);
  });

  it('rolls over the counter', () => {
    const next = tickHlc({ ms: T0, counter: 0xffff }, T0);
    expect(next).toEqual({ ms: T0 + 1, counter: 0 });
  });
});

describe('receiveHlc', () => {
  it('adopts a remote time ahead of the local clock (clock skew)', () => {
    const remote = { ms: T0 + 5_000, counter: 4 };
    const state = receiveHlc({ ms: T0, counter: 0 }, remote, T0);
    expect(state).toEqual({ ms: T0 + 5_000, counter: 5 });
    // das nächste lokale Ereignis liegt danach, auch wenn die lokale Uhr zurückliegt
    expect(tickHlc(state, T0).ms).toBe(T0 + 5_000);
  });

  it('merges counters when all clocks agree', () => {
    const state = receiveHlc({ ms: T0, counter: 2 }, { ms: T0, counter: 7 }, T0);
    expect(state).toEqual({ ms: T0, counter: 8 });
  });

  it('resets the counter when the wall clock is ahead of both', () => {
    const state = receiveHlc({ ms: T0, counter: 2 }, { ms: T0, counter: 7 }, T0 + 10);
    expect(state).toEqual({ ms: T0 + 10, counter: 0 });
  });

  it('ignores remote times implausibly far in the future', () => {
    const state = receiveHlc(
      { ms: T0, counter: 0 },
      { ms: T0 + MAX_DRIFT_MS + 1_000, counter: 0 },
      T0,
    );
    expect(state.ms).toBe(T0);
  });
});
