# M4 Teil A: Projektion und Szenario (Daten und Logik) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neue Entität `scenario` (ein gemeinsames Arbeitsszenario) plus reine Domain-Logik für Projektion und Szenario-Vergleich und die zugehörigen Schreibaktionen, ohne Oberfläche.

**Architecture:** `scenario` wird wie die M3-Entitäten additiv ins Ereignisschema, den Fold (Last-Write-Wins) und Dexie (Version 4) aufgenommen. `src/domain/projection.ts` rechnet Monat für Monat Ist + Prognose aus den materialisierten Zeilen (gleiche Zählregeln wie `income-split.ts`). `src/domain/scenario.ts` übersetzt ein Szenario in eine `ProjectionAdjust` und schlägt Budgets vor. `src/data/actions.ts` schreibt Szenario und Budgets.

**Tech Stack:** TypeScript 7 (strict), Zod mini (`zod/mini`), Dexie 4, Vitest 5, fake-indexeddb, Biome.

**Spec:** `docs/prompts/M4.md` (Abschnitte 1 und 2)

## Global Constraints

- `CLAUDE.md` gilt vollständig. Testdaten nur „Person A/B“, „Supermarkt A“, „Café B“, fiktive Beträge; keine echten Namen, Orte, Händler, URLs.
- Geld: Integer in Minor Units, Berechnungen mit `bigint`, kein Float. Rundung über `roundDiv` aus `src/domain/schedule.ts` (kaufmännisch).
- `src/domain/` bleibt rein: kein React, kein Dexie, kein IO.
- Keine `any`, Dateinamen kebab-case. Kommentare auf Deutsch, im Stil des umgebenden Codes (knapp).
- Commits: Conventional Commits auf Englisch, ohne Modellnamen, ohne personenbezogene Daten. Vor jedem Commit `npm run lint && npm run typecheck && npm test && npm run check:privacy` (alle grün).
- Bestehende Entitäten und Schema-Version (`SCHEMA_VERSION = 1`) bleiben unverändert.
- Konstanten: Regler `PCT_MIN = -50`, `PCT_MAX = 50`, `PCT_STEP = 5`; höchstens 200 Schlüssel in `categoryPct`, höchstens 50 `extras`; `SCENARIO_ID = '00000000-0000-4000-8000-00000000005c'`.

## Review Focus

1. Gebuchte Fixkosten dürfen nie doppelt zählen (Eintrag **und** Fälligkeit), auch nicht in Zukunftsmonaten mit früh gebuchtem Eintrag. Test in Task 2 („zählt eine gebuchte Fälligkeit nur einmal, auch in der Zukunft“).
2. Ein gelöschter gebuchter Eintrag gilt als nicht gebucht: die Fälligkeit zählt wieder. Test in Task 2.
3. Zeitraum endet mitten im Monat oder heute liegt außerhalb des Zeitraums: anteilige bzw. keine Prognose, keine Ausnahme. Tests in Task 2.
4. Zwei Geräte legen das Szenario gleichzeitig an (gleiche feste ID): ergibt eine Zeile ohne Konflikt. Test in Task 1.
5. Ungültige Reglerwerte (7 %, 60 %) werden beim Schreiben abgelehnt und nichts wird gespeichert. Test in Task 4.

---

### Task 1: Entität `scenario` in Schema, Modell, Fold und Dexie

**Files:**
- Modify: `src/data/events/schema.ts` (ENTITIES, fieldSchemas, createSchemas, updateSchemas, Kommentar über ENTITIES)
- Modify: `src/data/events/fold.ts:49-59` (FOLD_ORDER)
- Modify: `src/data/db.ts` (Feld `scenario`, `this.version(4)`)
- Modify: `src/domain/model.ts` (Typen, `toScenario`, `SCENARIO_ID`)
- Modify: `src/domain/test-data.ts` (Builder `scenario`)
- Test: `src/data/events/schema.test.ts`, `src/data/events/fold.test.ts`, `src/data/db.test.ts`

**Interfaces:**
- Produces (in `src/domain/model.ts`):
  ```ts
  export const SCENARIO_ID = '00000000-0000-4000-8000-00000000005c';
  export type ScenarioExtraKind = 'expense' | 'goal';
  export interface ScenarioExtra {
    id: string; kind: ScenarioExtraKind; name: string; amountMinor: number;
    currency: Currency; on: string; targetDate?: string;
  }
  export interface Scenario {
    id: string; categoryPct: Record<string, number>; extras: ScenarioExtra[];
    deleted: boolean; hlc: string;
  }
  export const toScenario: (r: Row) => Scenario;
  ```
- Produces (in `src/domain/test-data.ts`): `scenario(over?: Partial<Scenario>): Scenario` mit Standard `{ id: SCENARIO_ID, categoryPct: {}, extras: [], deleted: false, hlc: '2027-01-01T00:00:00.000Z-0000-d' }`.
- Produces: `'scenario'` ist Teil von `Entity`; `db.scenario` ist eine `EntityTable<MaterialRow, 'id'>`.

- [ ] **Step 1: Failing tests schreiben**

In `src/data/events/schema.test.ts` die bestehende Zeile `expect(ok({ ...mk({ op: 'delete' }), entity: 'scenario' })).toBe(false);` ersetzen durch `entity: 'receipt'` (unbekannte Entität bleibt ungültig). Neuer Block:

```ts
describe('scenario', () => {
  const CAT = '00000000-0000-4000-8000-0000000000c1';
  const X = '00000000-0000-4000-8000-0000000000e1';
  const goalExtra = { id: X, kind: 'goal', name: 'Ziel A', amountMinor: 50_000, currency: 'CAD', on: '2027-03-01', targetDate: '2027-09-01' };
  const sc = (op: 'create' | 'update', data: Record<string, unknown>) =>
    ok(mk({ entity: 'scenario', op, data }));

  it('akzeptiert ein gültiges Szenario', () => {
    expect(sc('create', { categoryPct: { [CAT]: -20 }, extras: [goalExtra] })).toBe(true);
    expect(sc('create', { categoryPct: {}, extras: [] })).toBe(true);
    expect(sc('update', { categoryPct: { [CAT]: 50 } })).toBe(true);
  });
  it('lehnt Reglerwerte außerhalb −50..50 oder nicht in 5er-Schritten ab', () => {
    expect(sc('update', { categoryPct: { [CAT]: 7 } })).toBe(false);
    expect(sc('update', { categoryPct: { [CAT]: 55 } })).toBe(false);
    expect(sc('update', { categoryPct: { [CAT]: -55 } })).toBe(false);
    expect(sc('update', { categoryPct: { 'keine-uuid': 5 } })).toBe(false);
  });
  it('prüft Extras: goal braucht targetDate > on, expense hat keins', () => {
    expect(sc('update', { extras: [{ ...goalExtra, targetDate: '2027-03-01' }] })).toBe(false);
    const { targetDate: _t, ...noTarget } = goalExtra;
    expect(sc('update', { extras: [noTarget] })).toBe(false);
    expect(sc('update', { extras: [{ ...noTarget, kind: 'expense' }] })).toBe(true);
    expect(sc('update', { extras: [{ ...goalExtra, kind: 'expense' }] })).toBe(false);
    expect(sc('update', { extras: [{ ...goalExtra, amountMinor: 0 }] })).toBe(false);
  });
  it('begrenzt Extras auf 50 und Regler auf 200 Kategorien', () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ ...goalExtra, id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` }));
    expect(sc('update', { extras: many })).toBe(false);
    const pct = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, 5]));
    expect(sc('update', { categoryPct: pct })).toBe(false);
  });
});
```

In `src/data/events/fold.test.ts` (Hilfen `mk`, `DEV_A`, `DEV_B` aus `test-helpers.ts`, `foldRow` wie im Datei-Kopf importiert; Kontext wie die übrigen Tests der Datei):

```ts
it('Szenario: zwei gleichzeitige create mit fester ID ergeben eine Zeile ohne Konflikt (Last-Write-Wins)', () => {
  const a = mk({ entity: 'scenario', rowId: SCENARIO_ROW, op: 'create', data: { categoryPct: {}, extras: [] }, at: 0, device: DEV_A });
  const b = mk({ entity: 'scenario', rowId: SCENARIO_ROW, op: 'create', data: { categoryPct: { [CAT_1]: 10 }, extras: [] }, at: 5, device: DEV_B });
  const u1 = mk({ entity: 'scenario', rowId: SCENARIO_ROW, op: 'update', data: { categoryPct: { [CAT_1]: -10 } }, base: [a.id, b.id], at: 10, device: DEV_A });
  const u2 = mk({ entity: 'scenario', rowId: SCENARIO_ROW, op: 'update', data: { categoryPct: { [CAT_1]: 20 } }, base: [a.id, b.id], at: 20, device: DEV_B });
  const r = foldRow('scenario', [u2, b, u1, a], ctx);
  expect(r.row?.fields.categoryPct).toEqual({ [CAT_1]: 20 });
  expect(r.row?.conflict).toBeNull();
});
```
mit `const SCENARIO_ROW = '00000000-0000-4000-8000-00000000005c';` und `ctx` wie in den übrigen Tests der Datei (alle Referenzen vorhanden).

In `src/data/db.test.ts` neuer Test „Dexie-Migration auf Version 4“: eine Dexie-Datenbank mit dem Version-3-Schema (Stores aus `db.ts` Version 3 kopieren) öffnen, je eine Zeile in `entry` und `goal` (`{ id: 'x', deleted: false }`) und `meta` (`deviceId`) schreiben, schließen, `new MapleJarDb(name).open()`; erwartet: beide Zeilen und `deviceId` unverändert vorhanden, `db.tables.map(t => t.name)` enthält `'scenario'`, `db.verno` ist `4`. Außerdem `'scenario'` in die Tabellenliste des bestehenden Version-2-Tests aufnehmen.

- [ ] **Step 2: Tests laufen lassen, sie schlagen fehl**

Run: `npx vitest run src/data/events/schema.test.ts src/data/events/fold.test.ts src/data/db.test.ts`
Expected: FAIL (scenario unbekannt, keine Tabelle `scenario`, `verno` 3).

- [ ] **Step 3: Implementieren**

- `schema.ts`: `'scenario'` ans Ende von `ENTITIES`; Kommentar über `ENTITIES` aktualisieren. In `fieldSchemas`:
  ```ts
  scenario: {
    categoryPct: z.record(z.uuid(), z.int().check(z.gte(-50), z.lte(50), z.multipleOf(5)))
      .check(z.refine((r) => Object.keys(r).length <= 200)),
    extras: z.array(scenarioExtra).check(z.maxLength(50)),
  },
  ```
  mit `scenarioExtra = z.strictObject({ id: z.uuid(), kind: z.enum(['expense','goal']), name: text(80), amountMinor: positiveMinor, currency, on: isoDate, targetDate: z.optional(isoDate) }).check(z.refine((x) => x.kind === 'goal' ? x.targetDate !== undefined && x.targetDate > x.on : x.targetDate === undefined))`. `createSchemas.scenario = z.strictObject(fieldSchemas.scenario)`, `updateSchemas.scenario = z.partial(z.strictObject(fieldSchemas.scenario)).check(atLeastOne)`. Wenn `z.record(...).check(...)` oder `z.multipleOf` in der installierten Version anders heißt: in `node_modules/zod/v4/mini/` nachsehen, nicht raten.
- `fold.ts`: `'scenario'` in `FOLD_ORDER` direkt nach `'settings'`. **Nicht** in `CONFLICT_ENTITIES`.
- `db.ts`: Feld `scenario!: EntityTable<MaterialRow, 'id'>;` und `this.version(4).stores({ ...alle Stores aus Version 3..., scenario: 'id' })` (ohne Upgrade-Funktion).
- `model.ts`: Typen und `SCENARIO_ID` aus dem Interfaces-Block, `toScenario = (r: Row): Scenario => r as unknown as Scenario` neben den anderen `to*`-Funktionen. `Currency` ist schon importiert.
- `test-data.ts`: Builder `scenario` wie oben.

- [ ] **Step 4: Tests laufen lassen, sie sind grün**

Run: `npx vitest run src/data/events src/data/db.test.ts && npm run typecheck && npm run lint`
Expected: PASS, keine Typ- und Lint-Fehler.

- [ ] **Step 5: Gesamte Suite und Commit**

Run: `npm test && npm run check:privacy` (alles grün), dann:
```bash
git add src/data/events/schema.ts src/data/events/schema.test.ts src/data/events/fold.ts src/data/events/fold.test.ts src/data/db.ts src/data/db.test.ts src/domain/model.ts src/domain/test-data.ts
git commit -m "feat(data): add scenario entity with schema, fold order and dexie v4"
```

---

### Task 2: `src/domain/projection.ts`

**Files:**
- Create: `src/domain/projection.ts`
- Test: `src/domain/projection.test.ts`

**Interfaces:**
- Consumes: `Entry`, `Income`, `FixedCost`, `GoalContribution`, `Goal`, `Budget`, `Category`, `entryCad`, `monthOf` (`model.ts`); `limitFor` (`budget.ts`); `occurrenceKey`, `OccurrenceIds` (`fixed-cost.ts`); `KnownRate` (`fx.ts`); `toCadMinor` (`money.ts`); `occurrences`, `addMonths`, `addDays`, `daysInMonth`, `roundDiv` (`schedule.ts`).
- Produces:
  ```ts
  export interface ProjectionInput {
    periodStart: string;            // YYYY-MM-01
    periodEnd: string;              // YYYY-MM-DD, >= periodStart
    today: string;
    incomes: readonly Income[]; fixedCosts: readonly FixedCost[]; entries: readonly Entry[];
    contributions: readonly GoalContribution[]; goals: readonly Goal[];
    budgets: readonly Budget[]; categories: readonly Category[];
    rate: KnownRate | null;
    /** occurrenceIds(fixedCosts, periodStart, periodEnd) */
    fixedEntryIds: OccurrenceIds;
    /** coverageByFixedCost(fixedCosts, entries, periodEnd) */
    coveredUntil: ReadonlyMap<string, string>;
  }
  export interface ProjectionAdjust {
    /** Kategorie-ID → Prozent (−50..50), wirkt nur auf die variable Prognose. */
    categoryPct: Readonly<Record<string, number>>;
    /** Monatserster → zusätzliche variable Ausgaben bzw. zusätzliches Sparen (CAD-Minor). */
    extraVariable: ReadonlyMap<string, bigint>;
    extraSaving: ReadonlyMap<string, bigint>;
  }
  export type MonthKind = 'actual' | 'current' | 'forecast';
  export type VariableBasis = 'average' | 'budget' | 'none';
  export interface ProjectionMonth {
    month: string; kind: MonthKind;
    incomeCadMinor: bigint; fixedCadMinor: bigint; savingCadMinor: bigint; variableCadMinor: bigint;
    /** income − fixed − saving − variable */
    netCadMinor: bigint;
    cumulativeCadMinor: bigint;
  }
  export interface VariableAverages { basis: VariableBasis; byCategory: Map<string, bigint> }
  export interface Projection {
    months: ProjectionMonth[];
    endCadMinor: bigint;            // cumulative des letzten Monats, 0 ohne Monate
    variableBasis: VariableBasis;
    variableByCategory: Map<string, bigint>;
    approximate: boolean;
  }
  export function variableAverages(input: Pick<ProjectionInput, 'entries' | 'budgets' | 'categories' | 'today'>): VariableAverages;
  export function projection(input: ProjectionInput, adjust?: ProjectionAdjust): Projection;
  ```

Regeln (aus der Spezifikation, Abschnitt 1):
- Monate: jeder Kalendermonat von `periodStart` bis `monthOf(periodEnd)`. `kind`: Monat < `monthOf(today)` → `actual`, gleich → `current`, größer → `forecast`.
- Ist-Teil je Monat = Tage im Monat, die im Zeitraum liegen (alle Tage, auch nach heute, für die es Daten gibt):
  - Einnahmen: `occurrences(inc, von, bis)` × Betrag (EUR mit `rate`, ohne Kurs 0; jede EUR-Umrechnung oder jeder fehlende Kurs setzt `approximate = true`). Gelöschte ignorieren.
  - Einträge (nicht gelöscht, `bookedOn` im Monat und im Zeitraum): `source: 'fixed'` → `saving`, wenn die Fixkosten `isSaving` haben, sonst `fixed`; `manual` → `variable`. Betrag `entryCad(e)`.
  - Fixkosten-Fälligkeiten (nicht gelöschte Fixkosten) im Monat und im Zeitraum: überspringen, wenn `dueOn <= coveredUntil.get(fc.id)`, oder wenn `fixedEntryIds.get(occurrenceKey(fc.id, dueOn))` auf einen vorhandenen, nicht gelöschten Eintrag zeigt; sonst Betrag nach `fixed` bzw. `saving`.
  - Beiträge mit `amountMinor > 0`, nicht gelöscht, `contributedOn` im Monat und im Zeitraum → `saving` (Währung des Ziels, unbekanntes Ziel = CAD).
- Prognose-Teil je Monat: `days` = Anzahl Tage `d` im Monat mit `d > today`, `d >= periodStart`, `d <= periodEnd`. Je Kategorie `c` aus `variableAverages(...).byCategory`: `roundDiv(A_c * BigInt(100 + (adjust?.categoryPct[c] ?? 0)) * BigInt(days), 100n * BigInt(daysInMonth))`, Summe → `variable`.
- `adjust.extraVariable` / `extraSaving`: Wert des Monats auf `variable` bzw. `saving` addieren (nur für Monate, die in `months` vorkommen).
- `variableAverages`: Kandidaten = die drei Monate vor `monthOf(today)`, nur solche ≥ Monat des frühesten nicht gelöschten manuellen Eintrags. `n` Kandidaten > 0: je Kategorie `roundDiv(Summe entryCad der manuellen Einträge in den Kandidatenmonaten, n)`, Kategorien mit Summe 0 weglassen, `basis: 'average'`. Sonst je nicht gelöschter Kategorie `limitFor(budgets, id, monthOf(today))?.monthlyLimitCadMinor` > 0 → `basis: 'budget'`; ist die Map leer → `basis: 'none'`.

Testdaten (gemeinsam, Builder aus `test-data.ts`): Zeitraum `2027-01-01`..`2027-04-30`, heute `2027-03-14`, `income()` (300 000 CAD monatlich ab 2027-01-01), `fixedCost()` (120 000 CAD monatlich ab 2027-01-01, `id: 'f-rent'`), manuelle Einträge CAT_A: `2027-01-10` 10 000, `2027-02-10` 20 000, `2027-03-05` 5 000; `fixedEntryIds` und `coveredUntil` leer; `rate: null`, keine Beiträge/Ziele/Budgets, `categories: [category()]`.

- [ ] **Step 1: Failing tests schreiben** (`src/domain/projection.test.ts`)

```ts
it('rechnet Ist und Prognose pro Monat und kumuliert', () => {
  const p = projection(base());
  expect(p.variableBasis).toBe('average');
  expect(p.variableByCategory.get(CAT_A)).toBe(15_000n);
  expect(p.months.map((m) => [m.month, m.kind, m.variableCadMinor, m.netCadMinor, m.cumulativeCadMinor])).toEqual([
    ['2027-01-01', 'actual', 10_000n, 170_000n, 170_000n],
    ['2027-02-01', 'actual', 20_000n, 160_000n, 330_000n],
    ['2027-03-01', 'current', 13_226n, 166_774n, 496_774n], // 5 000 Ist + 15 000 × 17/31 = 8 226
    ['2027-04-01', 'forecast', 15_000n, 165_000n, 661_774n],
  ]);
  expect(p.months.every((m) => m.incomeCadMinor === 300_000n && m.fixedCadMinor === 120_000n)).toBe(true);
  expect(p.endCadMinor).toBe(661_774n);
  expect(p.approximate).toBe(false);
});
it('zählt eine gebuchte Fälligkeit nur einmal, auch in der Zukunft', () => {
  // Einträge `source: 'fixed'`, fixedCostId 'f-rent', 120 000, für 2027-01-01 (ID 'e-jan') und 2027-04-01 (ID 'e-apr');
  // fixedEntryIds: occurrenceKey('f-rent', '2027-01-01') → 'e-jan', occurrenceKey('f-rent', '2027-04-01') → 'e-apr'
  // erwartet: fixedCadMinor je Monat 120 000; variableByCategory CAT_A weiterhin 15 000 (fixe Einträge zählen nicht variabel)
});
it('ein gelöschter gebuchter Eintrag gilt als nicht gebucht', () => {
  // wie oben, aber 'e-jan' mit deleted: true → Januar fixedCadMinor 120 000 (Fälligkeit zählt), nicht 0 und nicht 240 000
});
it('Fixkosten mit isSaving und positive Beiträge zählen als Sparen, Entnahmen nicht', () => {
  // fixedCost({ isSaving: true, amountMinor: 20_000 }) zusätzlich; contribution 10 000 am 2027-02-10 und −5 000 am 2027-02-11
  // erwartet: Januar savingCadMinor 20 000, Februar 30 000, März 20 000
});
it('fällt ohne vollständigen Vormonat auf Budgets zurück, ohne Budgets auf none', () => {
  // heute 2027-01-14: budgets [budget()] (CAT_A 100 000) → basis 'budget', byCategory CAT_A 100 000
  // ohne Budgets → basis 'none', Prognose variable = nur Ist
});
it('rechnet EUR mit bekanntem Kurs und markiert approximate; ohne Kurs zählt 0', () => {
  // income({ currency: 'EUR', amountMinor: 100_000 }) statt CAD, rate { rateMicro: 1_500_000n, date: '2027-03-14', stale: false }
  // → incomeCadMinor 150 000 je Monat, approximate true; mit rate null → 0, approximate true
});
it('Reglerwerte und Extras wirken nur auf die Prognose', () => {
  const p = projection(base(), { categoryPct: { [CAT_A]: -20 }, extraVariable: new Map([['2027-04-01', 50_000n]]), extraSaving: new Map([['2027-04-01', 7_000n]]) });
  expect(p.months[0]?.variableCadMinor).toBe(10_000n);   // Ist unverändert
  expect(p.months[2]?.variableCadMinor).toBe(11_581n);   // 5 000 + 15 000 × 80 % × 17/31 = 6 581
  expect(p.months[3]?.variableCadMinor).toBe(62_000n);   // 12 000 + 50 000
  expect(p.months[3]?.savingCadMinor).toBe(7_000n);
});
it('Zeitraum endet mitten im Monat: anteilige Prognose', () => {
  // periodEnd '2027-04-15' → April variableCadMinor 7 500 (15 000 × 15/30), Einnahme und Fixkosten am 01.04. zählen
});
it('heute vor dem Zeitraum: alles Prognose; heute nach dem Zeitraum: keine Prognose', () => {
  // heute 2026-12-20 (basis 'budget' mit budget() oder 'none'): alle kinds 'forecast'
  // heute 2027-06-10: alle kinds 'actual', variableCadMinor = nur Ist (10 000, 20 000, 5 000, 0)
});
it('ignoriert gelöschte Zeilen und Einträge außerhalb des Zeitraums', () => {
  // income deleted, Eintrag 2026-12-31 und 2027-05-01 → nicht gezählt
});
```
Die Kommentare legen die erwarteten Werte fest; jeder Test prüft sie mit `expect(...).toBe(...)` auf `bigint`-Werte.

- [ ] **Step 2: Tests laufen lassen, sie schlagen fehl**

Run: `npx vitest run src/domain/projection.test.ts`
Expected: FAIL („Failed to resolve import ./projection“).

- [ ] **Step 3: `projection.ts` implementieren** nach den Regeln oben. Kopfkommentar mit den Regeln (knapp, deutsch), JSDoc an den exportierten Funktionen. Kein Code aus `income-split.ts` kopieren, wo ein Import reicht.

- [ ] **Step 4: Tests grün**

Run: `npx vitest run src/domain/projection.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/projection.ts src/domain/projection.test.ts
git commit -m "feat(domain): add monthly projection with actuals and forecast"
```

---

### Task 3: `src/domain/scenario.ts`

**Files:**
- Create: `src/domain/scenario.ts`
- Test: `src/domain/scenario.test.ts`

**Interfaces:**
- Consumes: `projection`, `ProjectionInput`, `ProjectionAdjust`, `Projection` (Task 2); `Scenario`, `ScenarioExtra`, `Category`, `Budget`, `monthOf` (`model.ts`); `limitFor` (`budget.ts`); `KnownRate`; `toCadMinor`; `addMonths`, `monthsBetween`, `roundDiv` (`schedule.ts`).
- Produces:
  ```ts
  export const PCT_MIN = -50; export const PCT_MAX = 50; export const PCT_STEP = 5;
  export function scenarioAdjust(
    scenario: Pick<Scenario, 'categoryPct' | 'extras'>, today: string, rate: KnownRate | null,
  ): { adjust: ProjectionAdjust; approximate: boolean };
  export interface ScenarioComparison { base: Projection; scenario: Projection; diffEndCadMinor: bigint }
  export function compareScenario(input: ProjectionInput, scenario: Pick<Scenario, 'categoryPct' | 'extras'>): ScenarioComparison;
  export interface BudgetProposal { categoryId: string; fromMinor: bigint; toMinor: bigint }
  export function scenarioBudgets(input: {
    categories: readonly Category[]; budgets: readonly Budget[];
    averages: ReadonlyMap<string, bigint>; categoryPct: Readonly<Record<string, number>>; month: string;
  }): BudgetProposal[];
  ```

Regeln:
- `scenarioAdjust`: `categoryPct` unverändert durchreichen. `expense`: nur wenn `on > today`, Betrag (EUR mit `rate`, ohne Kurs 0; EUR setzt `approximate`) auf `extraVariable[monthOf(on)]`. `goal`: `n = max(1, monthsBetween(on, targetDate))`, Gesamtbetrag `T` (umgerechnet) auf die Monate `addMonths(monthOf(on), k)` für `k = 0..n-1` verteilen: `T / n` (abgerundet), die ersten `T % n` Monate +1; nur Monate ≥ `monthOf(today)` in `extraSaving` aufnehmen. Mehrere Extras im selben Monat addieren.
- `compareScenario`: `base = projection(input)`, `scenario = projection(input, adjust)` mit `approximate = scenario.approximate || adjust.approximate`, `diffEndCadMinor = scenario.endCadMinor − base.endCadMinor`.
- `scenarioBudgets`: für nicht gelöschte Kategorien in `sort`-Reihenfolge mit `pct = categoryPct[id]` ≠ 0 (fehlend = 0): Basis = `limitFor(budgets, id, month)?.monthlyLimitCadMinor` wenn > 0, sonst `averages.get(id) ?? 0n`; Basis 0 → überspringen; `toMinor = roundDiv(roundDiv(base × (100 + pct), 100n), 100n) × 100n`.

- [ ] **Step 1: Failing tests schreiben**

```ts
const X1 = '00000000-0000-4000-8000-0000000000e1';
const X2 = '00000000-0000-4000-8000-0000000000e2';
const goalX = (over = {}): ScenarioExtra => ({ id: X1, kind: 'goal', name: 'Ziel A', amountMinor: 120_000, currency: 'CAD', on: '2027-03-10', targetDate: '2027-06-10', ...over });
const expenseX = (over = {}): ScenarioExtra => ({ id: X2, kind: 'expense', name: 'Ausgabe A', amountMinor: 50_000, currency: 'CAD', on: '2027-04-20', ...over });

it('verteilt ein neues Ziel gleichmäßig auf die Monate', () => {
  const { adjust } = scenarioAdjust({ categoryPct: {}, extras: [goalX()] }, '2027-03-01', null);
  expect([...adjust.extraSaving]).toEqual([['2027-03-01', 40_000n], ['2027-04-01', 40_000n], ['2027-05-01', 40_000n]]);
});
it('verteilt den Rest auf die ersten Monate, die Summe bleibt exakt', () => {
  const { adjust } = scenarioAdjust({ categoryPct: {}, extras: [goalX({ amountMinor: 100_001 })] }, '2027-03-01', null);
  expect([...adjust.extraSaving.values()]).toEqual([33_334n, 33_334n, 33_333n]);
});
it('zählt Zielraten nur ab dem laufenden Monat', () => {
  const { adjust } = scenarioAdjust({ categoryPct: {}, extras: [goalX()] }, '2027-04-02', null);
  expect([...adjust.extraSaving.keys()]).toEqual(['2027-04-01', '2027-05-01']);
});
it('Einmalausgabe zählt nur, wenn sie nach heute liegt', () => {
  expect(scenarioAdjust({ categoryPct: {}, extras: [expenseX()] }, '2027-04-19', null).adjust.extraVariable.get('2027-04-01')).toBe(50_000n);
  expect(scenarioAdjust({ categoryPct: {}, extras: [expenseX()] }, '2027-04-20', null).adjust.extraVariable.size).toBe(0);
});
it('rechnet EUR-Extras mit Kurs um und markiert approximate', () => {
  const rate = { rateMicro: 1_500_000n, date: '2027-04-01', stale: false };
  const r = scenarioAdjust({ categoryPct: {}, extras: [expenseX({ currency: 'EUR' })] }, '2027-04-01', rate);
  expect(r.adjust.extraVariable.get('2027-04-01')).toBe(75_000n);
  expect(r.approximate).toBe(true);
  expect(scenarioAdjust({ categoryPct: {}, extras: [expenseX({ currency: 'EUR' })] }, '2027-04-01', null).adjust.extraVariable.get('2027-04-01') ?? 0n).toBe(0n);
});
it('vergleicht Basis und Szenario am Zeitraumende', () => {
  // Eingabe wie `base()` in projection.test.ts (dort als Export `projectionFixture` aus einer gemeinsamen Datei
  // `src/domain/projection.fixture.ts` herausziehen und in beiden Tests verwenden).
  // categoryPct { [CAT_A]: -20 } → diffEndCadMinor = 3 000 (April) + 1 645 (März: 8 226 − 6 581) = 4 645n
});
it('schlägt Budgets ab dem nächsten Monat vor, auf ganze Einheiten gerundet', () => {
  const props = scenarioBudgets({
    categories: [category(), category({ id: CAT_B, sort: 1 }), category({ id: 'c-del', deleted: true, sort: 2 })],
    budgets: [budget()], // CAT_A 100 000 ab 2027-01-01
    averages: new Map([[CAT_B, 15_050n]]),
    categoryPct: { [CAT_A]: -20, [CAT_B]: 10, 'c-del': 10 },
    month: '2027-04-01',
  });
  expect(props).toEqual([
    { categoryId: CAT_A, fromMinor: 100_000n, toMinor: 80_000n },
    { categoryId: CAT_B, fromMinor: 15_050n, toMinor: 16_600n },
  ]);
});
it('überspringt Kategorien mit 0 % oder ohne Basis', () => {
  // categoryPct { [CAT_A]: 0, [CAT_B]: 10 }, keine Budgets, averages leer → []
});
```

- [ ] **Step 2: Tests laufen lassen, sie schlagen fehl**

Run: `npx vitest run src/domain/scenario.test.ts`
Expected: FAIL (Modul fehlt).

- [ ] **Step 3: `scenario.ts` implementieren**, dazu `src/domain/projection.fixture.ts` (nur Testdaten, exportiert `projectionFixture(over?: Partial<ProjectionInput>): ProjectionInput`) anlegen und `projection.test.ts` darauf umstellen (gleiche Werte).

- [ ] **Step 4: Tests grün**

Run: `npx vitest run src/domain && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/scenario.ts src/domain/scenario.test.ts src/domain/projection.fixture.ts src/domain/projection.test.ts
git commit -m "feat(domain): add scenario adjustments, comparison and budget proposals"
```

---

### Task 4: Aktionen, Hook und Dokumentation

**Files:**
- Modify: `src/data/actions.ts` (neuer Abschnitt `// --- M4: Szenario ---` am Dateiende)
- Modify: `src/data/repos.ts` (Hook `useScenario`)
- Modify: `docs/PLAN.md` (Tabelle 2.3, Zeile `scenario`)
- Test: `src/data/actions.test.ts`

**Interfaces:**
- Consumes: `SCENARIO_ID`, `Scenario`, `ScenarioExtra`, `toScenario` (Task 1); `BudgetProposal` (Task 3); `appendLocalEvent` (`write.ts`); `setBudget` (gleiche Datei).
- Produces:
  ```ts
  export interface ScenarioPatch { categoryPct?: Record<string, number>; extras?: ScenarioExtra[] }
  /** Legt das Arbeitsszenario an oder schreibt nur geänderte Felder. Einträge mit 0 % werden entfernt. */
  export async function saveScenario(db: MapleJarDb, patch: ScenarioPatch): Promise<boolean>;
  /** Setzt die vorgeschlagenen Limits ab `month` und entfernt die übernommenen Kategorien aus `categoryPct`. */
  export async function adoptScenarioBudgets(db: MapleJarDb, proposals: readonly BudgetProposal[], month: string): Promise<void>;
  // repos.ts
  export const useScenario: () => Scenario | null;
  ```

Verhalten `saveScenario`: `categoryPct` vor dem Vergleich von 0-Werten bereinigen. Keine Zeile `SCENARIO_ID` vorhanden → `create` mit `{ categoryPct: patch.categoryPct ?? {}, extras: patch.extras ?? [] }`, Rückgabe `true`. Sonst nur Felder schreiben, deren JSON sich vom materialisierten Stand unterscheidet (`update`), keine Änderung → `false`. Schemafehler wirft `appendLocalEvent` (nichts wird geschrieben). `useScenario`: `useLiveQuery` auf `db.scenario.get(SCENARIO_ID)`, gelöscht oder fehlend → `null`.

- [ ] **Step 1: Failing tests schreiben** (in `src/data/actions.test.ts`, eigener `describe('Szenario', ...)`, Setup aus dem bestehenden `beforeEach`)

```ts
it('legt das Szenario beim ersten Speichern an und schreibt danach nur Änderungen', async () => {
  expect(await saveScenario(db, { categoryPct: { [cat]: -10 } })).toBe(true);
  const row = await db.scenario.get(SCENARIO_ID);
  expect(row?.categoryPct).toEqual({ [cat]: -10 });
  expect(row?.extras).toEqual([]);
  const before = await db.events.count();
  expect(await saveScenario(db, { categoryPct: { [cat]: -10 } })).toBe(false);
  expect(await db.events.count()).toBe(before);
  expect(await saveScenario(db, { categoryPct: { [cat]: 0 } })).toBe(true);
  expect((await db.scenario.get(SCENARIO_ID))?.categoryPct).toEqual({});
});
it('lehnt ungültige Reglerwerte ab und schreibt nichts', async () => {
  await expect(saveScenario(db, { categoryPct: { [cat]: 7 } })).rejects.toThrow();
  await expect(saveScenario(db, { categoryPct: { [cat]: 60 } })).rejects.toThrow();
  expect(await db.scenario.count()).toBe(0);
  expect(await db.outbox.count()).toBe(outboxBefore); // Wert vor den Aufrufen merken
});
it('übernimmt Budgets ab dem Monat und entfernt die übernommenen Regler', async () => {
  await saveScenario(db, { categoryPct: { [cat]: -20 } });
  await adoptScenarioBudgets(db, [{ categoryId: cat, fromMinor: 100_000n, toMinor: 80_000n }], '2027-04-01');
  const b = (await db.budget.toArray()).find((r) => r.categoryId === cat && r.validFrom === '2027-04-01');
  expect(b?.monthlyLimitCadMinor).toBe(80_000);
  expect((await db.scenario.get(SCENARIO_ID))?.categoryPct).toEqual({});
});
```

- [ ] **Step 2: Tests laufen lassen, sie schlagen fehl**

Run: `npx vitest run src/data/actions.test.ts`
Expected: FAIL (Exporte fehlen).

- [ ] **Step 3: Implementieren** (`saveScenario`, `adoptScenarioBudgets` in `actions.ts`, `useScenario` in `repos.ts`). In `docs/PLAN.md` Tabelle 2.3 die Zeile `scenario` ersetzen durch: `` | `scenario` (1×, feste ID) | `categoryPct` (`{categoryId: -20}`, −50..50 in 5er-Schritten), `extras` (Einmalausgaben `expense` mit `on`, neue Ziele `goal` mit `on` und `targetDate`) | ``.

- [ ] **Step 4: Volle Prüfung**

Run: `npm run lint && npm run typecheck && npm test && npm run build && npm run check:size && npm run check:privacy`
Expected: alles grün, `check:size` unter 150 KB (Teil A lädt nichts Neues ins Haupt-Bundle, nur `schema.ts` wächst minimal).

- [ ] **Step 5: Commit**

```bash
git add src/data/actions.ts src/data/actions.test.ts src/data/repos.ts docs/PLAN.md
git commit -m "feat(data): add scenario save and budget adoption actions"
```
