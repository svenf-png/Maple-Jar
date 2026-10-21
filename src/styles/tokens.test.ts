import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { categoryTemplate } from '../domain/category-template';

const css = readFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');

function block(source: string, startMarker: string): Record<string, string> {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Block nicht gefunden: ${startMarker}`);
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  const vars: Record<string, string> = {};
  for (const m of source.slice(open, close).matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    vars[m[1] as string] = (m[2] as string).trim();
  }
  return vars;
}

const light = block(css, ':root {');
const dark = block(css, ':root[data-theme="dark"]');
const darkMedia = block(css, ':root:not([data-theme="light"])');

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

const pairs: Array<[string, string]> = [
  ['label', 'bg'],
  ['label', 'card'],
  ['label', 'fill'],
  ['label2', 'bg'],
  ['label2', 'card'],
  ['label2', 'fill'],
  ['onAcc', 'acc'],
  ['warn', 'warnTint'],
  ['ok', 'okTint'],
  ['info', 'infoTint'],
  ['acc', 'accTint'],
];

describe.each([
  ['hell', light],
  ['dunkel (data-theme)', dark],
  ['dunkel (Media-Query)', darkMedia],
])('Kontrast %s', (_name, vars) => {
  it.each(pairs)('%s auf %s ≥ 4,5:1', (fg, bg) => {
    const ratio = contrast(vars[fg] as string, vars[bg] as string);
    expect(ratio, `${fg}/${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});

const segs = ['seg-fixed', 'seg-budget', 'seg-other', 'seg-saving'] as const;
const resolveVar = (vars: Record<string, string>, name: string): string => {
  const v = vars[name] as string;
  const ref = /^var\(--([\w-]+)\)$/.exec(v);
  return ref ? resolveVar(vars, ref[1] as string) : v;
};

describe.each([
  ['hell', light],
  ['dunkel (data-theme)', dark],
  ['dunkel (Media-Query)', darkMedia],
])('Donut-Segmente %s', (_name, vars) => {
  const seg = (n: string) => resolveVar(vars, n);
  const card = vars.card as string;
  it.each([...segs, 'seg-overflow'])('%s ≥ 3:1 auf card', (n) => {
    expect(contrast(seg(n), card), n).toBeGreaterThanOrEqual(3);
  });
  it('Nachbarsegmente unterscheiden sich in der Helligkeit (≥ 1,2:1)', () => {
    const order = [...segs, 'seg-free'];
    for (let i = 0; i < order.length - 1; i++) {
      const [a, b] = [order[i], order[i + 1]] as [string, string];
      expect(contrast(seg(a), seg(b)), `${a}/${b}`).toBeGreaterThanOrEqual(1.2);
    }
  });
  it('Sparen hebt sich von Budget-Ausgaben ab (≥ 2:1, auch in der Helligkeit)', () => {
    expect(contrast(seg('seg-saving'), seg('seg-budget'))).toBeGreaterThanOrEqual(2);
  });
  it('Überlauf ist von allen Segmenten unterscheidbar und nutzt nie --acc', () => {
    for (const n of segs) expect(seg('seg-overflow')).not.toBe(seg(n));
    for (const n of [...segs, 'seg-free', 'seg-overflow']) expect(vars[n]).not.toBe('var(--acc)');
  });
});

describe('Dunkel-Varianten sind identisch', () => {
  it('Media-Query und data-theme definieren dieselben Werte', () => {
    const { onCat: _a, ...rest } = dark;
    expect(darkMedia).toMatchObject(rest);
  });
});

describe('Kategorie-Vorlage', () => {
  it.each(categoryTemplate.map((c) => [c.key, c.color] as const))(
    'weiße Schrift auf %s ≥ 4,5:1',
    (_key, color) => {
      expect(contrast('#FFFFFF', color)).toBeGreaterThanOrEqual(4.5);
    },
  );
});

describe('Pflicht-Tokens', () => {
  it('enthalten Radien und Abstände', () => {
    expect(light['r-kpi']).toBe('18px');
    expect(light['s-7']).toBe('44px');
  });
});
