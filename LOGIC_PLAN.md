# Control-logic plan — GCSC Flex Terrain Demo

Interaction/control-logic spec for `BRIEF.md`, downstream of `DESIGN_REVIEW.md`. This defines the deterministic data every scenario runs on, the priority rules the "control layer" claims to follow, and the exact-value Node test plan for test-first development. No production HTML/CSS/JS is written here — this is the contract the implementation and its tests must satisfy.

## 0. Framing

Brief says "physical-stand demo simulation, not a production EMS." So this is **not** a generic optimizer that computes dispatch from arbitrary inputs — that would be unfalsifiable and impossible to hand-verify at a stand. Instead: each scenario carries two **hand-authored, fixed** states, `baseline` (uncoordinated) and `optimized` (coordinated). The "control priorities" below are the *design rules those two states were authored to obey* — they double as invariants the test suite checks, so a future edit to the numbers can't silently violate the story (essential load touched, limit breached in the "after" state, etc.).

Everything numeric here is illustrative demo data, per the brief's constraint — not a claim of measured performance.

## 1. Data model

### 1.1 Asset nameplate (constant across all scenarios)

| Asset | Constant | Value |
|---|---|---|
| PV | `PV_MAX` | 150 kW |
| Battery | `BATTERY_MAX_CHARGE` / `BATTERY_MAX_DISCHARGE` | 60 kW / 60 kW |
| Battery | `BATTERY_CAPACITY` | 200 kWh (display only, not used in kW balance) |
| EV charger (×3) | `CHARGER_MAX` | 25 kW each (75 kW combined) |
| Heat pump | `HEATPUMP_MAX` | 30 kW |
| Grid connection | `GRID_STANDARD_LIMIT` | 150 kW |

Building load has no nameplate max — it's a fixed, scenario-specific input, never a control variable (see §2, rule 1).

### 1.2 Per-state shape

Each scenario has exactly two states, `baseline` and `optimized`, with this shape:

```
{
  buildingLoad: number,          // kW, fixed within a scenario — identical in baseline and optimized
  pv: number,                    // kW, fixed within a scenario
  importLimit: number,           // kW, fixed within a scenario
  battery: { power: number, state: 'idle' | 'laden' | 'levert-vermogen' },
  chargers: [                    // exactly 3, fixed order = physical charger 1/2/3
    { id: 1, power: number, state: 'actief' | 'gepauzeerd' | 'later' },
    { id: 2, power: number, state: 'actief' | 'gepauzeerd' | 'later' },
    { id: 3, power: number, state: 'actief' | 'gepauzeerd' | 'later' },
  ],
  heatpump: { power: number, state: 'uit' | 'normaal' | 'vooraf-opwarmen' | 'doorgeschoven' },
  actions: string[],             // exact NL action-log lines, in display order
}
```

`battery.power` sign convention: **positive = charging (load), negative = discharging (source)**. This matches how it's summed into net import in §1.3 — do not flip the sign for display; format the UI label (`laadt` / `levert`) from `battery.state`, not from the sign, so a copy change can't desync from the arithmetic.

**Rule — state is authored, never inferred from power.** A charger at 0 kW can be `gepauzeerd` (was running, deliberately paused — Netcongestie) or `later` (hasn't started yet, opportunistic — Zonpiek baseline). These are different visitor-facing claims and must not collapse into "if power === 0 then …" logic anywhere, in the implementation or in a future data edit. This is the single most likely bug an implementer introduces under time pressure, so it gets its own invariant test (§4, T9).

### 1.3 Derived values (computed, never hand-entered)

```
netImport(state) =
  state.buildingLoad
  + state.heatpump.power
  + state.chargers.reduce((sum, c) => sum + c.power, 0)
  + state.battery.power
  - state.pv

status(netImport, importLimit) =
  netImport > importLimit ? 'boven-limiet' : 'binnen-limiet'
```

`netImport` and `status` must be computed by a pure function from the state object, not stored as sibling fields on the scenario data — storing them invites drift the moment someone tweaks one charger's kW and forgets to update a hardcoded total. (This is also why every table below shows the computation, not just the result.)

## 2. Control priority rules

These are the rules the two authored states per scenario must satisfy. State them once here; both the data tables (§3) and the test suite (§4) are checked against them.

1. **Essential building load is never a control variable.** `buildingLoad` is identical between `baseline` and `optimized` in every scenario, and `actions` always includes `Gebouwlast: geen aanpassing (essentieel)` as the last line. This is the one claim in the brief ("essential load guaranteed") that must be demonstrated in data, not just asserted in copy.
2. **Fixed dispatch order, no randomness, no wall-clock dependence.** When a scenario's `optimized` state was authored, assets were considered in this order — battery → charger 1 → charger 2 → charger 3 → heat pump — in both directions:
   - **Surplus mode** (Zonpiek: PV > demand): give the surplus to battery first (fastest, invisible lever), then chargers in ascending id order, then heat pump preheat last (slowest-acting, thermal buffer absorbs timing slack best).
   - **Constrained mode** (Avondpiek, Netcongestie: demand pressure or a DSO-requested cap): pull from battery discharge first, then curtail chargers in *descending* id order (charger 3 throttled/paused before charger 2, before charger 1 — an arbitrary but fixed tie-break so the demo is repeatable), then defer heat pump last (comfort has the longest acceptable delay, so it's the last thing curtailed and the first thing restored).
   This ordering has no runtime effect (states are static data), but it's the rationale behind *which* charger got which number in §3, and it's what a future scenario/state must stay consistent with if someone extends this demo.
3. **The optimized state never breaches its own scenario's import limit.** Hard invariant, tested directly (§4, T2).
4. **The baseline state is allowed to breach the limit or merely approach it — never the optimized state.** Netcongestie's baseline is the one deliberate limit breach in the demo (it's the scenario whose entire premise is "the DSO says import is too high"); Avondpiek's baseline approaches the limit without crossing it (matches the approved copy: "nadert de aansluitlimiet"); Zonpiek's baseline is never about the limit at all — it's about wasted export, so its "problem" is expressed as a large export figure, not a limit breach.
5. **PV is never curtailed.** Not modeled as a control action in any of the three scenarios; out of scope for this demo.

## 3. Scenario data

All values in kW. `netImport` and `status` are computed per §1.3, shown here for review, not hand-entered in the implementation.

### 3.1 Zonpiek — `pv = 140`, `buildingLoad = 35`, `importLimit = 150`

| | battery | c1 | c2 | c3 | heatpump | netImport | status |
|---|---|---|---|---|---|---|---|
| baseline | 0 (idle) | 0 (later) | 0 (later) | 0 (later) | 0 (uit) | 35+0+0-140 = **-105** | binnen-limiet (export) |
| optimized | +60 (laden) | 25 (actief) | 25 (actief) | 0 (later) | 25 (vooraf-opwarmen) | 35+60+50+25-140 = **30** | binnen-limiet |

Story: baseline exports 105 kW of unused PV; optimized routes it into battery + 2 chargers + preheat, dropping to a 30 kW top-up import instead of a 105 kW export. Charger 3 stays `later` in both states — deliberately not every lever is used, so the demo doesn't read as "everything maxed out" by default.

Baseline actions: *(none logged — nothing is coordinated yet; UI shows the empty/dash state for `ACTIES NU` until Optimaliseer is pressed)*

Optimized actions (exact strings, in order):
1. `Batterij laadt 60 kW op zonne-overschot`
2. `Laadpaal 1 actief, 25 kW op zonne-overschot`
3. `Laadpaal 2 actief, 25 kW op zonne-overschot`
4. `Laadpaal 3: later`
5. `Warmtepomp vooraf opgewarmd, 25 kW`
6. `Gebouwlast: geen aanpassing (essentieel)`

### 3.2 Avondpiek — `pv = 5`, `buildingLoad = 45`, `importLimit = 150`

| | battery | c1 | c2 | c3 | heatpump | netImport | status |
|---|---|---|---|---|---|---|---|
| baseline | 0 (idle) | 25 (actief) | 25 (actief) | 25 (actief) | 30 (normaal) | 45+0+75+30-5 = **145** | binnen-limiet (near) |
| optimized | -40 (levert-vermogen) | 25 (actief) | 0 (later) | 0 (later) | 30 (normaal) | 45-40+25+30-5 = **55** | binnen-limiet |

Story: baseline has all 3 chargers plugging in at once right as heating and building load ramp — 145/150, uncomfortably close, matches the approved copy ("nadert de aansluitlimiet") without crossing it. Optimized sequences the chargers (only charger 1 runs now, 2 and 3 queued) and uses battery discharge to absorb the peak instead — 55/150, comfortable margin. Heat pump is unchanged (30 kW, `normaal`) in both states — comfort isn't the lever this scenario needs, and leaving it untouched is itself a small honest detail (not every asset has to move every time).

Baseline actions: *(none — same empty-state rule as 3.1)*

Optimized actions:
1. `Batterij levert 40 kW om de piek af te vlakken`
2. `Laadpaal 1 actief, 25 kW`
3. `Laadpaal 2: later (na laadpaal 1)`
4. `Laadpaal 3: later (na laadpaal 1 en 2)`
5. `Warmtepomp: geen aanpassing nodig, 30 kW`
6. `Gebouwlast: geen aanpassing (essentieel)`

### 3.3 Netcongestie — `pv = 20`, `buildingLoad = 40`, `importLimit = 100` *(reduced from the standard 150 kW — the DSO's temporary request is itself the scenario trigger, not a separate flag)*

| | battery | c1 | c2 | c3 | heatpump | netImport | status |
|---|---|---|---|---|---|---|---|
| baseline | 0 (idle) | 25 (actief) | 25 (actief) | 25 (actief) | 30 (normaal) | 40+0+75+30-20 = **125** | **boven-limiet** |
| optimized | -20 (levert-vermogen) | 11 (actief) | 11 (actief) | 0 (gepauzeerd) | 0 (doorgeschoven) | 40-20+22+0-20 = **22** | binnen-limiet |

Story: this is the one scenario whose baseline is a deliberate limit breach (125/100) — "zonder sturing blijft het verbruik te hoog." Optimized throttles chargers 1 and 2 to a reduced rate, pauses charger 3 outright, defers the heat pump's demand entirely, and uses the battery — landing at 22/100, well clear.

Baseline actions: *(none — same empty-state rule)*

Optimized actions:
1. `Batterij levert 20 kW binnen ingestelde grenzen`
2. `Laadpaal 1 afgeschaald naar 11 kW`
3. `Laadpaal 2 afgeschaald naar 11 kW`
4. `Laadpaal 3 gepauzeerd`
5. `Warmtevraag doorgeschoven binnen ingestelde grenzen`
6. `Gebouwlast: geen aanpassing (essentieel)`

## 4. Module/function contract

For the implementation (and the tests below) to target, `logic.js` (or equivalent, framework-free) should export:

- `ASSETS` — the §1.1 constants.
- `SCENARIOS` — `{ zonpiek, avondpiek, netcongestie }`, each `{ id, label, subtitle, baseline, optimized }` per §1.2/§3, with `power`/`state` fields as authored data — **not** `netImport`/`status` pre-baked in.
- `computeNetImport(state)` — pure function, §1.3 formula.
- `getStatus(netImport, importLimit)` — pure function, §1.3 formula.
- `getScenario(id)` — returns the scenario object; throws `RangeError` for an unknown id (explicit contract, not `undefined`-and-hope).
- A small UI-state reducer, e.g. `applyEvent(uiState, event)`, covering exactly three events:
  - `{ type: 'SELECT_SCENARIO', id }` → `{ scenarioId: id, mode: 'baseline' }` (switching scenarios always resets to baseline — never carries an "optimized" mode across scenarios).
  - `{ type: 'OPTIMIZE' }` → `{ ...uiState, mode: 'optimized' }`.
  - `{ type: 'RESET' }` → `{ ...uiState, mode: 'baseline' }` (the "Toon uitgangssituatie opnieuw" link).
  - Initial state: `{ scenarioId: 'zonpiek', mode: 'baseline' }`, per the design review's specified default.

## 5. Browserless Node test plan

Runner: Node's built-in `node:test` + `node:assert/strict`. No DOM, no browser, no external test framework — run via `node --test`. Strict test-first: this file (translated into `logic.test.js`) is written and failing before `logic.js` exists, per the brief.

Exact test cases:

**T1 — netImport arithmetic matches §3 for all 6 states.**
For each of the 6 `(scenario, mode)` pairs, `computeNetImport(SCENARIOS[s][mode])` strictly equals the table value: zonpiek baseline `-105`, zonpiek optimized `30`, avondpiek baseline `145`, avondpiek optimized `55`, netcongestie baseline `125`, netcongestie optimized `22`.

**T2 — optimized state never breaches its own limit (rule 3).**
For all 3 scenarios: `computeNetImport(optimized) <= importLimit`. Loop-based, one assertion per scenario, not a single blanket `.every()` — so a failure names the scenario.

**T3 — netcongestie baseline is the one deliberate breach (rule 4).**
`getStatus(computeNetImport(SCENARIOS.netcongestie.baseline), 100) === 'boven-limiet'`. And explicitly the negative case: zonpiek and avondpiek baselines are `'binnen-limiet'` (asserted individually, so a copy/data edit that accidentally pushes avondpiek over 150 fails loudly instead of silently changing the demo's story).

**T4 — essential load is untouched (rule 1).**
For all 3 scenarios: `baseline.buildingLoad === optimized.buildingLoad`. And: `optimized.actions.at(-1) === 'Gebouwlast: geen aanpassing (essentieel)'` for all 3 scenarios (the log line is the visible proof of the invariant, so it's tested as its own line, not folded into T1).

**T5 — Zonpiek optimize increases on-site consumption, not just import.**
Zonpiek's story isn't "closer to a limit," it's "less wasted export." Assert total on-site demand (`buildingLoad + heatpump.power + sum(chargers) `, excluding battery) is strictly greater in `optimized` (35+25+50=110) than `baseline` (35), and that `computeNetImport(baseline) < 0` (baseline is genuinely exporting) while `computeNetImport(optimized) >= 0` (surplus is absorbed, not dumped to the grid).

**T6 — Avondpiek/Netcongestie optimize strictly reduces import (peak-shaving story).**
For avondpiek and netcongestie only (not zonpiek — see T5): `computeNetImport(optimized) < computeNetImport(baseline)`.

**T7 — charger/battery/heatpump state labels are drawn from a closed enum.**
For all 6 states, every `chargers[i].state ∈ {'actief','gepauzeerd','later'}`, `battery.state ∈ {'idle','laden','levert-vermogen'}`, `heatpump.state ∈ {'uit','normaal','vooraf-opwarmen','doorgeschoven'}`. Catches a typo'd state string that would otherwise silently fail to match any CSS/label lookup at render time.

**T8 — state/power consistency.**
`battery.state === 'idle' ⇔ battery.power === 0`; `battery.power > 0 ⇒ state === 'laden'`; `battery.power < 0 ⇒ state === 'levert-vermogen'`. Same shape for chargers: `state === 'actief' ⇔ power > 0`. (This does *not* contradict §1.2's "state isn't inferred from power" rule — that rule says the *implementation* must not derive state from power at render time; this test says the *authored data* must still be internally consistent, which is a data-quality check, not a rendering rule.)

**T9 — the `gepauzeerd` vs `later` distinction survives, per §1.2.**
Explicit, non-generic assertions: `SCENARIOS.zonpiek.baseline.chargers[2].state === 'later'` (charger 3, hasn't started) and `SCENARIOS.netcongestie.optimized.chargers[2].state === 'gepauzeerd'` (charger 3, deliberately paused) — both are 0 kW, both must not collapse to the same state string. This is the single test most likely to catch a future scenario-data edit made by someone who "simplifies" charger logic to `power === 0 ? 'gepauzeerd' : 'actief'`.

**T10 — determinism / no hidden time or randomness.**
Call `computeNetImport` and `getStatus` twice on the same input (including once with a mocked/advanced `Date.now` if the implementation ever touches wall-clock time, which it shouldn't) and assert deep-equal results. Also grep-level intent (documented, not a runtime test): `logic.js` must not import `Math.random` or `Date` for anything that affects scenario numbers — flagged here so a code reviewer checks for it, since a `node:test` can't easily prove an absence.

**T11 — `getScenario` contract.**
`getScenario('zonpiek')` returns the object with `id === 'zonpiek'`; `getScenario('does-not-exist')` throws `RangeError`. (Explicit throw, not `undefined`, because a silent `undefined` scenario reaching the renderer is exactly the kind of bug that only shows up live at the stand.)

**T12 — UI-state reducer.**
- Initial state (no prior `applyEvent` call, however the implementation exposes it) is `{ scenarioId: 'zonpiek', mode: 'baseline' }`.
- `applyEvent({scenarioId:'zonpiek', mode:'optimized'}, {type:'SELECT_SCENARIO', id:'netcongestie'})` → `{scenarioId:'netcongestie', mode:'baseline'}` (proves scenario switch always drops back to baseline, never carries an optimized mode into a new scenario — this is the one interaction bug that would most undercut the "before/after" pitch if missed).
- `applyEvent({scenarioId:'avondpiek', mode:'baseline'}, {type:'OPTIMIZE'})` → `{scenarioId:'avondpiek', mode:'optimized'}`.
- `applyEvent({scenarioId:'avondpiek', mode:'optimized'}, {type:'RESET'})` → `{scenarioId:'avondpiek', mode:'baseline'}`.

**T13 — scenario data is immutable across repeated reads (no shared-mutable-state bug).**
`getScenario('zonpiek').optimized.battery.power` read twice, or read then compared against the same field on a `SCENARIOS.zonpiek.optimized` direct reference, must be identical and unaffected by any prior `applyEvent` call in the same test run — guards against an implementation that accidentally mutates the shared scenario objects in place when "applying" an optimize action, instead of the mode being a pure read-time selector.

### Explicitly out of scope for this test file

Reduced-motion behavior, animation timing (the ~600–900ms "Bezig met optimaliseren…" transition), CSS/layout, and touch-target sizing are DOM/visual concerns from `DESIGN_REVIEW.md` §4 and are not control-logic — no Node test can meaningfully cover them, and they shouldn't be faked into this suite just to raise a coverage number.

## 6. Open items for the implementer / design sign-off

1. **Charger nameplate (25 kW) and heat-pump max (30 kW) are my assumptions**, chosen for round arithmetic, not sourced from BRIEF.md (which doesn't specify capacities). Flagging in case GCSC's actual reference hardware suggests different, more credible numbers (e.g. matching a real AC charger spec) — swapping them only requires re-deriving §3's table, the priority rules in §2 don't change.
2. **Netcongestie's reduced import limit (100 kW vs the standard 150 kW) is presented as scenario data, not yet surfaced as its own copy line.** DESIGN_REVIEW.md's `Netaansluiting` panel shows "Importlimiet" as a single figure; recommend the Netcongestie scenario's `UITLEG` or a small inline note make the *temporary, DSO-requested* nature of the lowered limit explicit (e.g. "tijdelijke importlimiet: 100 kW, normaal 150 kW"), otherwise a visitor may read 100 kW as this site's permanent connection size, which is a more overstated/confusing claim than intended.
3. **Baseline states carry no `ACTIES NU` entries** (§3, "none logged") — recommend the UI show a plain-language empty state such as `Nog geen sturing actief` rather than a blank panel, so the pre-optimize moment doesn't read as broken.
