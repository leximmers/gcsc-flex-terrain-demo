# "Bouw je eigen industrieterrein" — technical implementation plan

Engineering counterpart to `BUILD_YOUR_TERRAIN_UX.md`, in the same relationship `LOGIC_PLAN.md` has to `DESIGN_REVIEW.md`: that doc specs the visitor journey, copy and visual rules; this doc specs the exact data shapes, pure functions and DOM mechanics an implementer builds against, plus the browserless test plan for the new logic. **Not modifying code here.** No production HTML/CSS/JS is written in this file.

Scope discipline matches the UX doc's own P0/P1 split (§9 there): everything in §1–§7 below is P0 — required for the generalized simulation to work at all. §8 (pointer-drag mechanics) is P0 for the *tap* path and P1 for the *drag* path, per the UX doc's "tap-to-place is the load-bearing path, not a fallback" framing (§0.2). New asset logic in §3.3 is flagged P0/P1 per asset, matching the UX doc's own cut list.

## 0. Why generalize instead of rewrite

`logic.js` already has the right shape: pure functions over plain data (`computeNetImport`, `getStatus`, `getScenario`, `applyEvent`), a closed reducer, and three hand-authored `(baseline, optimized)` pairs per scenario. The build-your-own feature does not need a new engine — it needs the existing per-asset numbers reinterpreted as **contributions that apply only when that asset is placed**, plus a `placedAssets` fact threaded through every read. This is the same principle UX §6 states in prose ("what changes is that any asset the visitor didn't place contributes `0`"); this doc turns that into function contracts.

Concretely: `SCENARIOS.<id>.optimized.battery.power` (e.g. Avondpiek's `-40`) is not a formula output, it's *the number the control layer would use if a battery is on this terrain in this scenario*. The generalized engine's job is selecting which of those pre-authored per-asset numbers are "on" for a given `placedAssets`, never recomputing physics. This keeps every number in the demo traceable to the same hand-verified table in `LOGIC_PLAN.md` §3 — no new arithmetic to hand-check at the stand.

## 1. Data model

### 1.1 `placedAssets`

```
placedAssets = {
  pv: boolean,
  battery: boolean,
  chargers: [boolean, boolean, boolean],   // index 0..2 = physical charger 1..3, fixed order
  heatpump: boolean,
  thermalBuffer: boolean,
  residualHeat: boolean,                    // P1, see §3.3
}
```

`chargers` is an array, not a count, so charger identity (which physical charger is placed) survives — this matters because the shipped Avondpiek/Netcongestie optimized data curtails chargers in a fixed *descending* id order (LOGIC_PLAN §2 rule 2) and Zonpiek fills them in *ascending* order; collapsing to a count would silently break that authored ordering the moment 2-of-3 chargers are placed non-contiguously (see T22).

### 1.2 `ASSET_DEFS` registry

One place that drives palette rendering, slot rendering, max-count enforcement, the "N van M" readout, and which `placedAssets` key each governs — replaces every hardcoded "6" or "7" the UX doc's mockups imply (see §7.1, this is the fix for that drift risk):

```
ASSET_DEFS = {
  pv:           { key: 'pv',           group: 'elektrisch', max: 1, connector: 'solid', requires: [] },
  battery:      { key: 'battery',      group: 'elektrisch', max: 1, connector: 'solid', requires: [] },
  charger:      { key: 'chargers',     group: 'elektrisch', max: 3, connector: 'solid', requires: [] },
  heatpump:     { key: 'heatpump',     group: 'thermisch',  max: 1, connector: 'dashed', requires: [] },
  thermalBuffer:{ key: 'thermalBuffer',group: 'thermisch',  max: 1, connector: 'dashed', requires: ['heatpump'] },
  residualHeat: { key: 'residualHeat', group: 'thermisch',  max: 1, connector: 'dashed', requires: ['heatpump'] }, // P1
}
```

`requires` is read by `getGapCallout`/inert-notice logic (§3.4) and by the palette's disabled/dimmed rendering — not by `computeNetImport`, which never needs to know about requirements, only about presence (§3.1).

### 1.3 Extended `uiState`

Extends, does not replace, the existing reducer state (`INITIAL_UI_STATE` in `logic.js`):

```
uiState = {
  step: 'build' | 'scenario' | 'result',
  placedAssets: { ...as §1.1 },
  scenarioId: 'zonpiek' | 'avondpiek' | 'netcongestie',
  mode: 'baseline' | 'optimizing' | 'optimized',
  pendingToken: number | null,
}
```

`STARTER_TERRAIN` (constant, per UX §4): `{ pv: true, battery: false, chargers: [true, false, false], heatpump: false, thermalBuffer: false, residualHeat: false }`.

`INITIAL_BUILD_STATE = { step: 'build', placedAssets: STARTER_TERRAIN, scenarioId: 'zonpiek', mode: 'baseline', pendingToken: null }`.

## 2. Thermal & behind-the-meter assets

The shipped demo already has one thermal asset (`heatpump`). This is the set to build against, following the UX doc's own P0/P1 split and its rule (§3 there) that internal proof-point mapping never becomes UI copy:

| Asset | Phase | Adds a `netImport` term? | Nameplate (illustrative, round numbers — same convention as `LOGIC_PLAN.md` §6 item 1) |
|---|---|---|---|
| `heatpump` | P0, shipped | Yes — `heatpump.power` | 30 kW (existing `ASSETS.HEATPUMP_MAX`) |
| `thermalBuffer` | P0, new | **No** — pure modifier on `heatpump`'s action log, per UX §5 | none (no kW figure to invent or defend) |
| `residualHeat` | P1, new | **No** — offsets `heatpump.power` in the optimized state only, when both placed | `RESIDUAL_HEAT_OFFSET = 10` kW — **flagged assumption**, same status as the existing charger/heat-pump nameplates: chosen for round arithmetic (10 is a clean third of the 30 kW heat-pump max), not sourced from `BRIEF.md`. Needs the same sign-off note `LOGIC_PLAN.md` §6 already carries for its own assumed numbers. |

`residualHeat` ("Restwarmtekoppeling") represents reusing on-site or nearby waste heat instead of drawing full electrical power for the heat pump — this is a mechanism claim, not a savings claim: it never states a percentage, a customer, or a deployment. It maps internally to the Suncom/THERMOS industrial-heat proof point (UX §3's internal-mapping table), and that mapping must stay out of visitor-facing copy exactly as UX §3 already requires for the other tiles.

Deliberately **not** adding: a `Zonnecarport` *logic* asset. UX §9 P1 already scopes it as "combined PV+laadplein **tile skin**" — i.e. purely a rendering/grouping treatment applied when `pv && chargers[0]` are both placed (shared visual grouping in the SVG, a shared label), never a new `placedAssets` key, never a new formula, never a new nameplate. Keeping it presentation-only avoids a second thing that would need "illustrative kW" invention for no simulation benefit. If it ships, it belongs entirely in the rendering layer (§6), with zero surface area in `logic.js` or the test suite.

## 3. Pure logic function contract

All new functions are additions to the existing `logic.js` export list (`ASSETS`, `SCENARIOS`, `computeNetImport`, `getStatus`, `getScenario`, `applyEvent`, `INITIAL_UI_STATE`) — nothing existing changes signature, so `index.html`'s current fixed-scenario code path keeps working unmodified if the build-your-terrain layer is ever disabled.

### 3.1 `getEffectiveState(scenarioId, mode, placedAssets)`

Pure function, returns an object with the **same shape** as `SCENARIOS[id][mode]` (§1.2 of `LOGIC_PLAN.md`), so every existing consumer (`computeNetImport`, `getStatus`, the renderer) works unchanged against its output:

```
getEffectiveState(scenarioId, mode, placedAssets):
  source = getScenario(scenarioId)[mode]
  return {
    buildingLoad: source.buildingLoad,        // never gated — building/net are not placeable, UX §0.4
    pv: placedAssets.pv ? source.pv : 0,
    importLimit: source.importLimit,          // a site property, not an asset — never gated
    battery: placedAssets.battery
      ? source.battery
      : { power: 0, state: 'idle' },
    chargers: source.chargers.map((c, i) =>
      placedAssets.chargers[i] ? c : { id: c.id, power: 0, state: 'later' }
    ),
    heatpump: computeEffectiveHeatpump(source.heatpump, mode, placedAssets),  // §3.3
    actions: getActionsForPlacedAssets(scenarioId, mode, placedAssets),       // §3.4
  }
```

`pv: 0` when unplaced is deliberate, not just "no contribution" — with no PV placed, `netImport` for Zonpiek's baseline stops being an export figure and just reads as raw demand, which is itself the honest "you get no surplus-export story without solar" lesson; no separate branch needed.

Unplaced chargers falling back to `{ power: 0, state: 'later' }` (never `'gepauzeerd'`) preserves the `LOGIC_PLAN.md` §1.2 invariant that `later` means "not started" and `gepauzeerd` means "was running, deliberately paused" — an unplaced charger was never running, so `'later'` is the only correct state, in both baseline and optimized mode. (T9's existing invariant test extends naturally to this — see T22.)

### 3.2 `computeNetImport` — unchanged

`computeNetImport(state)` (existing, `logic.js` line 135) takes any object matching the state shape and needs **zero changes** — it already sums whatever is in `chargers`/`battery.power`/`heatpump.power`/`pv` without knowing whether those numbers came from static `SCENARIOS` data or from `getEffectiveState`. This is the payoff of not inventing a second formula: the existing, already-tested arithmetic is reused verbatim.

### 3.3 `computeEffectiveHeatpump(sourceHeatpump, mode, placedAssets)`

```
computeEffectiveHeatpump(sourceHeatpump, mode, placedAssets):
  if (!placedAssets.heatpump) return { power: 0, state: 'uit' }
  if (mode !== 'optimized' || !placedAssets.residualHeat) return sourceHeatpump
  offset = min(sourceHeatpump.power, RESIDUAL_HEAT_OFFSET)
  return { power: sourceHeatpump.power - offset, state: sourceHeatpump.state }
```

- `thermalBuffer` never appears in this function — per §2, it has no `netImport` term, so it cannot affect `heatpump.power`. Its only effect is on the action log (§3.4). This is the concrete enforcement of UX §5's "doesn't add its own line to the import calculation."
- `residualHeat`'s offset is clamped with `min(...)` so `heatpump.power` can never go negative even if a future edit raises `RESIDUAL_HEAT_OFFSET` above 30 — cheap invariant, worth a test (T28).
- Baseline mode is never affected by `residualHeat` (`mode !== 'optimized'` guard) — residual-heat coupling is a control-layer action like everything else in this demo, not a passive site property, matching how every other asset's "before" state ignores what the control layer *could* do.

### 3.4 `getActionsForPlacedAssets(scenarioId, mode, placedAssets)`

```
getActionsForPlacedAssets(scenarioId, mode, placedAssets):
  if (mode === 'baseline') return []   // unchanged shipped rule — LOGIC_PLAN §3, "none logged"

  source = getScenario(scenarioId).optimized.actions
  lines = []

  gap = getGapCallout(scenarioId, placedAssets)   // §3.5
  if (gap) lines.push(gap)

  if (placedAssets.battery) lines.push(source[<battery line>])
  for each placed charger i, in ascending id order:
    lines.push(source[<charger i line>])
  if (placedAssets.heatpump) {
    lines.push(source[<heatpump line>])
    if (placedAssets.thermalBuffer) lines.push(BUFFER_LINE[scenarioId])   // exact strings, UX §5
  }
  lines.push('Gebouwlast: geen aanpassing (essentieel)')   // always last, always present — LOGIC_PLAN rule 1
  return lines
```

Line-picking is by **fixed index into the existing `SCENARIOS[id].optimized.actions` array**, not string matching — the existing arrays are ordered battery → charger 1 → charger 2 → charger 3 → heat pump → building (LOGIC_PLAN §2 rule 2, §3 tables), so `source[0]` is always the battery line, `source[1..3]` the charger lines in id order, `source[4]` the heat-pump line, `source[5]` the building line, across all three scenarios. This means adding a new scenario later only requires keeping that index convention, not touching `getActionsForPlacedAssets`.

`BUFFER_LINE` is a small fixed lookup, exact strings from UX §5:
```
BUFFER_LINE = {
  zonpiek: 'Warmtebuffer slaat overtollige warmte op voor de avond',
  avondpiek: 'Warmtebuffer levert warmte terug, warmtepomp blijft uit',
  netcongestie: 'Warmtebuffer levert warmte terug, warmtepomp blijft uit',
}
```
(UX §5 only gives Avondpiek's wording as an example and says "Avondpiek/Netcongestie" share the pattern — flag this as a copy open item, same as `LOGIC_PLAN.md` §6 flags its own assumptions, rather than silently picking a string here.)

### 3.5 `getGapCallout(scenarioId, placedAssets)`

Pure function, returns a string or `null`. Exact copy from UX §8 (no new wording invented here):

```
getGapCallout(scenarioId, placedAssets):
  hasBattery = placedAssets.battery
  hasCharger = placedAssets.chargers.some(Boolean)
  hasHeatpump = placedAssets.heatpump
  hasAnyFlex = hasBattery || hasCharger || hasHeatpump

  if (scenarioId === 'zonpiek' && !hasBattery)
    return 'Dit terrein heeft geen batterij. Het zonne-overschot wordt teruggeleverd aan het net in plaats van lokaal gebruikt.'
  if (scenarioId === 'avondpiek' && !hasCharger)
    return 'Dit terrein heeft geen laadpalen geplaatst. De avondpiek komt vooral van de gebouwlast.'
  if (scenarioId === 'netcongestie' && !hasAnyFlex)
    return 'Dit terrein heeft geen batterij, laadpalen of warmtepomp. Zonder flexibele bronnen kan de besturingslaag de import niet verlagen — voeg een asset toe en probeer het opnieuw.'
  return null
```

Only the three cases UX §8 actually specifies exact copy for — resist the urge to generalize this into a combinatorial rule engine for every possible gap; UX §6 explicitly says "don't need to enumerate every combination, the empty/full extremes matter most." Untriggered combinations (e.g. Zonpiek missing only a heat pump) simply get no callout, which is correct: the story still works without one.

### 3.6 `hasAnyOptimizableAsset(placedAssets)`

```
hasAnyOptimizableAsset(placedAssets) =
  placedAssets.battery || placedAssets.chargers.some(Boolean) || placedAssets.heatpump
```

Drives the zero-asset disabled state (UX §6, "Geen sturing mogelijk zonder geplaatste assets"). `pv`, `thermalBuffer` and `residualHeat` are deliberately excluded — none of them is independently dispatchable by the control layer (PV is never curtailed, per the existing `LOGIC_PLAN.md` §2 rule 5; buffer/residual-heat are inert without a heat pump, §2 above).

### 3.7 `countPlacedAssets(placedAssets)` / `TOTAL_PLACEABLE_SLOTS`

```
TOTAL_PLACEABLE_SLOTS = Object.values(ASSET_DEFS).reduce((sum, def) => sum + def.max, 0)
// = 1(pv) + 1(battery) + 3(charger) + 1(heatpump) + 1(thermalBuffer) [+ 1(residualHeat) once P1 ships]

countPlacedAssets(placedAssets) =
  (placedAssets.pv ? 1 : 0)
  + (placedAssets.battery ? 1 : 0)
  + placedAssets.chargers.filter(Boolean).length
  + (placedAssets.heatpump ? 1 : 0)
  + (placedAssets.thermalBuffer ? 1 : 0)
  + (placedAssets.residualHeat ? 1 : 0)   // only once residualHeat exists in ASSET_DEFS
```

**Flag for the implementer:** UX §2's mock and §8's copy both say `Terrein: N van 6 assets geplaatst`, but the P0 palette in UX §3 is `pv(1) + battery(1) + charger(3) + heatpump(1) + thermalBuffer(1) = 7` placeable slots, not 6 — the "6" appears to predate `thermalBuffer` being added to the palette and was never reconciled. Deriving both the count *and* the total from `ASSET_DEFS` (as above) instead of hardcoding either number sidesteps the question of which figure is "right" and makes the copy self-correct if the palette changes again — same principle `LOGIC_PLAN.md` §1.3 already applies to `netImport` ("computed, never hand-entered"). Resolve the 6-vs-7 discrepancy with whoever owns UX copy before ship; don't silently pick one here.

## 4. Reducer extension

Extends `applyEvent` (existing `logic.js` switch, line 160) with four new cases. Existing cases (`SELECT_SCENARIO`, `OPTIMIZE_REQUEST`, `OPTIMIZE_RESOLVE`, `RESET`) are untouched.

```
case 'PLACE_ASSET':      // { type: 'PLACE_ASSET', key: 'pv'|'battery'|'charger'|'heatpump'|'thermalBuffer'|'residualHeat' }
  if key === 'charger':
    idx = placedAssets.chargers.indexOf(false)   // lowest-index empty slot — UX §4 "1 → 2 → 3"
    if idx === -1: return uiState                 // already 3/3, no-op
    newChargers = placedAssets.chargers.slice()
    newChargers[idx] = true
    return { ...uiState, placedAssets: { ...placedAssets, chargers: newChargers }, mode: 'baseline', pendingToken: null }
  else:
    if placedAssets[key] === true: return uiState  // already placed (max 1), no-op
    return { ...uiState, placedAssets: { ...placedAssets, [key]: true }, mode: 'baseline', pendingToken: null }

case 'REMOVE_ASSET':     // { type: 'REMOVE_ASSET', key, index? }  index required for 'charger'
  ...mirror of PLACE_ASSET, sets the target slot back to false, same mode/pendingToken reset

case 'GOTO_STEP':        // { type: 'GOTO_STEP', step }
  return { ...uiState, step: event.step }   // touches nothing else — UX §7

case 'RESET_ALL':
  return { ...INITIAL_BUILD_STATE }          // fresh object, not a reference to a shared constant — see T26
```

`mode: 'baseline'` on every `PLACE_ASSET`/`REMOVE_ASSET` mirrors the existing `SELECT_SCENARIO` behavior (a terrain edit invalidates any prior optimize result, UX §7) and reuses the exact same field the existing reducer already resets — no new "dirty" flag needed.

Charger removal needs an explicit `index` in the event (not "remove the last one") because UX §4's tap-to-remove targets *the specific node the visitor tapped* — charger 2 can be removed while charger 1 and 3 stay placed, which the boolean-array model already supports; `indexOf(false)` for placement is a queue (fills leftmost empty), but removal is direct-addressed, not a stack pop. This asymmetry is intentional and worth a comment in the implementation, not a "simplification" to symmetric push/pop semantics.

## 5. `getEffectiveState` + reducer together replace fixed-scenario reads

Everywhere `index.html`'s current `render()` calls `getScenario(uiState.scenarioId)[mode]` (the `currentState()` helper, line 1020), the build-your-terrain version calls `getEffectiveState(uiState.scenarioId, mode, uiState.placedAssets)` instead. Every other line of `render()` — the import bar math, status dot, `Acties nu` list rendering, diagram flow-line toggling — is unchanged, because `getEffectiveState`'s output satisfies the same shape contract the renderer already consumes. This is the concrete confirmation of UX §0.1's claim that steps 2–3 are "almost exactly the existing `index.html`."

## 6. Accessible, dependency-free drag-and-drop

### 6.1 Why not the HTML5 Drag and Drop API

`draggable="true"` + `dragstart`/`dragover`/`drop` has two disqualifying problems for this stand: it has no native touch support (kiosk hardware is touchscreen — UX §0.2 exists specifically because drag is unreliable there), and it offers no built-in keyboard path, so a second, fully separate keyboard implementation would be needed anyway. Skip it entirely.

### 6.2 Pointer Events, tap-first

Build the optional drag layer on the **Pointer Events API** (`pointerdown`/`pointermove`/`pointerup`/`pointercancel`), which unifies mouse, touch and pen without a library, and layer it *on top of* plain `<button>` tap targets that already work via `click` with zero extra code:

- Every palette tile and every placed SVG node is a real, natively focusable, natively activatable control (`<button>` for palette tiles; `<g role="button" tabindex="0">` for SVG nodes, since SVG has no native button element — see §6.4). Tap-to-place/tap-to-remove is implemented as an ordinary `click` listener. This is the entire P0 interaction; it needs no pointer-tracking code at all.
- The pointer-drag layer is strictly additive: `pointerdown` on a tile starts tracking movement; if total movement stays under an **8px threshold**, do nothing extra and let the browser's native `click` fire normally on release (this is what makes a "tap" and a "cancelled drag" the same code path — no special-casing). Only past the threshold does the handler switch into drag-visual mode: `element.setPointerCapture(event.pointerId)`, render a floating ghost (`position: fixed`, follows `pointermove` via the captured pointer's coordinates), and hit-test candidate slots.
- Hit-testing reuses the diagram's existing fixed `NODES` geometry (already in `index.html`, §"diagram geometry") converted from SVG viewBox coordinates to screen coordinates via `getScreenCTM()`/`getBoundingClientRect()` — no new layout system, since UX §0.3 already fixes node positions and forbids free placement.
- "Magnetize to nearest matching empty slot within the whole diagram bounding box" (UX §4): on every `pointermove` past the threshold, compute distance from the pointer to the center of each *empty, key-matching* slot; if the pointer is anywhere inside the diagram's bounding rect, highlight the nearest match regardless of exact overlap (generous, since precise touch release is the failure mode being designed around) — this generosity should have a code comment naming the reason (grubby kiosk glass, imprecise touch), so a future "tighten the hit box" edit understands the tradeoff it's removing.
- `pointerup` over the diagram bounding box while a slot is highlighted → dispatch `PLACE_ASSET`. `pointerup` outside it, or `pointercancel` (touch interrupted mid-drag, e.g. an incoming notification or a second touch point) → discard the ghost, no state change, tile returns to its resting position. Neither path needs an animation-timing decision here (that's DESIGN_REVIEW/CSS territory) — only the state-transition boundary matters to this doc.
- Node-tap-to-remove is a plain `click`/`keydown` handler on the placed node group, no pointer-tracking needed — removal was never speced as drag-out in UX §4 ("no drag-to-remove needed").

### 6.3 Why the tap path is not a fallback, structurally

Because `click` (mouse/touch tap and keyboard Enter/Space on a focused `<button>`/`role="button"`) is the *only* thing wired to `PLACE_ASSET`/`REMOVE_ASSET` in the base implementation, and the pointer-drag layer's sole effect is calling that same dispatch earlier (on `pointerup` instead of waiting for the synthesized `click`), there is no code path where drag can do something tap cannot. This is what makes UX §0.2's "two independent paths to the same state" claim actually true at the implementation level, not just at the copy level ("sleep of tik").

### 6.4 Keyboard and screen-reader equivalence

- Palette tiles: real `<button>` elements — Tab reaches them in DOM order (grouped `Elektrisch` then `Thermisch & behind-the-meter`, per UX §3), Enter/Space activates, no custom keydown handling required.
- Placed SVG nodes (removal target): `<g role="button" tabindex="0" aria-label="…">` — SVG groups do **not** get automatic Enter/Space→click behavior the way `<button>` does, so this one spot needs an explicit `keydown` handler checking for `Enter`/`' '` and calling the same handler the `click` listener uses. Visible focus ring via `:focus-visible` on `.sld-node[role="button"]`, reusing the existing `outline: 2px solid var(--green)` pattern already defined for `.tab:focus-visible` and `.optimize-btn:focus-visible` in `index.html` — no new focus-style vocabulary.
- `aria-label` per node states current content plainly, e.g. `Batterij, 60 kW / 200 kWh, geplaatst. Tik om te verwijderen.` for a filled slot, or is omitted/inert for an empty slot (empty slots are not `role="button"` — there's nothing to activate by tapping an empty slot per UX §4, placement only happens via the palette tile).
- Empty slots still need a **visible + accessible label** (the dashed-rect micro-labels in UX §8, e.g. `+ opslag`) — implement as real SVG `<text>`, not decoration, so it's exposed the same way the existing node labels already are (`index.html`'s `svg text { fill: var(--ink) }` styling, no separate a11y-only markup needed since SVG text nodes are accessible-tree text by default).
- One shared `aria-live="polite"` region (visually hidden, reuse the existing `.visually-hidden` class already defined in `index.html`) announces placement/removal: `Batterij geplaatst.` / `Batterij verwijderd.` / `Laadpaal 2 geplaatst.` — this is also the natural anchor for the `Terrein: N van M` readout UX §10 already flags as needing `aria-live` "in spirit"; update both from the same function so they can't drift out of sync.
- The main diagram `<svg>` keeps its existing `role="img"`/`aria-labelledby`/`aria-describedby` (title+desc) from the shipped demo for the *overall* picture; the per-node `role="button"` elements inside it are the actual interactive surface, same pattern as an accessible interactive chart (container describes the whole, children are the controls).
- Nothing in §6.2's pointer-drag layer requires a keyboard equivalent of "dragging" itself — the design deliberately has no notion of "pick up via keyboard, move focus, drop," because tap/Enter already places in one step (UX §4.2's "no intermediate armed state to manage" applies equally to the keyboard path: there is no separate keyboard mode to build or maintain).

### 6.5 Thermal connector line rendering

Per UX §5, thermal assets get a dashed spine connector instead of a new hue. Implementation: the existing `sld-line` class gets one additive modifier, `sld-line.thermal { stroke-dasharray: 3 3; }` (independent of the already-existing `.animate` dasharray used for flow direction — these must compose, not conflict, since an active heat-pump line needs to be dashed *and* animated at once; verify the two `stroke-dasharray` values don't visually cancel by using distinct dash lengths for "thermal" (3 3) vs "flow animation" (6 6), or apply the thermal dash to a static underlay and the flow animation to color/opacity only — implementer's call, flagged here because it's the one visual detail with a real risk of two CSS rules silently fighting).

## 7. Browserless Node test plan (extends `logic.test.js`)

Same runner, same style as the existing suite: `node:test` + `node:assert/strict`, no DOM, exact-value assertions, one failure names one scenario/case (per `LOGIC_PLAN.md` §5's own stated style, e.g. T2). Numbered continuing from the existing T1–T15.

**T16 — `getEffectiveState` zeroes unplaced assets, both modes.**
For Zonpiek with `placedAssets = { pv: true, battery: false, chargers: [true, false, false], heatpump: false, thermalBuffer: false, residualHeat: false }`: `battery` is `{ power: 0, state: 'idle' }` and `heatpump` is `{ power: 0, state: 'uit' }` in **both** `getEffectiveState('zonpiek', 'baseline', …)` and `getEffectiveState('zonpiek', 'optimized', …)` — placement gating applies identically regardless of mode.

**T17 — generalized `computeNetImport` matches hand arithmetic for a partial terrain.**
Zonpiek, optimized, only `pv` + `chargers[0]` placed: expected `35 + 0 (heatpump off) + 25 (charger 1 only) + 0 (no battery) - 140 (pv) = -80`. Assert `computeNetImport(getEffectiveState('zonpiek', 'optimized', thatPlacedAssets)) === -80`.

**T18 — full-terrain regression guard.**
For all 3 scenarios × both modes, `getEffectiveState(id, mode, ALL_PLACED)` deep-equals `getScenario(id)[mode]` where `ALL_PLACED = { pv: true, battery: true, chargers: [true, true, true], heatpump: true, thermalBuffer: false, residualHeat: false }` (buffer/residual excluded since they're modifiers, not part of the original shipped shape). This is the single most important new test: it proves the generalization is a strict superset of the shipped demo and cannot silently change any of the six numbers `LOGIC_PLAN.md` T1 already locks down.

**T19 — zero-flexible-asset terrain cannot improve on baseline.**
For a terrain with only `pv: true` (no battery/chargers/heatpump) in Netcongestie: `computeNetImport(getEffectiveState('netcongestie', 'optimized', …)) === computeNetImport(getEffectiveState('netcongestie', 'baseline', …))` — with nothing dispatchable, optimize is numerically a no-op, matching UX §6's "import may stay at or above the temporary limit after optimize."

**T20 — gap-callout copy is exact and scenario-gated.**
`getGapCallout('zonpiek', { battery: false, ... })` equals the exact UX §8 string; `getGapCallout('zonpiek', { battery: true, ... })` is `null`. Same pair for Avondpiek/`chargers.some(Boolean)` and Netcongestie/`hasAnyFlex`. Six assertions (present/absent × 3 scenarios), each naming its scenario on failure.

**T21 — buffer is a pure action-log modifier, never a `netImport` term.**
`heatpump: true, thermalBuffer: true` vs `heatpump: true, thermalBuffer: false` with identical other placements: `computeNetImport(...)` is **identical** between the two (buffer changes nothing numeric); the `actions` array differs by exactly one line, the `BUFFER_LINE[scenarioId]` string, positioned immediately after the heat-pump line. Separately: `thermalBuffer: true, heatpump: false` produces **no** buffer line anywhere in `actions` (inert-without-heatpump case, §2/§3.3).

**T22 — charger placement preserves physical id and authored curtailment order.**
Two parts: (a) `getEffectiveState` with `chargers: [false, true, false]` (only charger 2) returns `chargers[0]` and `chargers[2]` as `{ power: 0, state: 'later' }` — never `'gepauzeerd'`, extending the existing T9 invariant to the placement-gated path. (b) In Netcongestie optimized with all 3 chargers placed, the `actions` order from `getActionsForPlacedAssets` is charger 1 line, then charger 2, then charger 3 (ascending id), matching the fixed dispatch order in `LOGIC_PLAN.md` §2 rule 2 — even though the *curtailment* decision was descending-id when the data was authored, the *display* order in `actions` stays ascending-by-id (this is what the shipped `SCENARIOS.netcongestie.optimized.actions` array already does — T22 just proves the generalized path doesn't reorder it).

**T23 — `PLACE_ASSET`/`REMOVE_ASSET` reset `mode` to `'baseline'`.**
`applyEvent({ ...someOptimizedUiState }, { type: 'PLACE_ASSET', key: 'battery' })` has `mode === 'baseline'` and unchanged `scenarioId`. Same assertion for `REMOVE_ASSET`. Mirrors the existing `SELECT_SCENARIO` behavior already covered by T12.

**T24 — `GOTO_STEP` is pure navigation.**
`applyEvent(uiState, { type: 'GOTO_STEP', step: 'scenario' })` changes only `step`; `placedAssets`, `scenarioId`, `mode`, `pendingToken` are all unchanged from the input (deep-equal on everything except `step`).

**T25 — `RESET_ALL` returns exactly the starter terrain, distinct from scenario-local `RESET`.**
`applyEvent(anyUiState, { type: 'RESET_ALL' })` deep-equals `INITIAL_BUILD_STATE`, including `placedAssets` reverting to `STARTER_TERRAIN` — contrast with `RESET`, which (per existing T12) only clears `mode` and must leave `placedAssets` untouched. Explicit test that `RESET` does **not** touch `placedAssets`.

**T26 — no shared-mutable-state bugs in the new reducer paths.**
Extends the existing T13 pattern to the new array field: placing/removing a charger must produce a **new** `chargers` array (`newState.placedAssets.chargers !== oldState.placedAssets.chargers`), and the old state's array must be unchanged after the call. Also: two calls to `RESET_ALL` each return a fresh object, not the same reference (`applyEvent(a, RESET_ALL) !== applyEvent(b, RESET_ALL)`), so a caller mutating one result can't corrupt a later reset.

**T27 — placed-count and total-slots are derived, not hand-entered.**
`TOTAL_PLACEABLE_SLOTS === Object.values(ASSET_DEFS).reduce((s, d) => s + d.max, 0)` (proves the constant isn't a hardcoded literal drifted from the registry) and `countPlacedAssets(STARTER_TERRAIN) === 2` (pv + charger 1). This test is what operationalizes the §3.7 "6 vs 7" flag — once whichever number is correct is decided, this test is what keeps the readout from silently going stale again.

**T28 — (P1) residual-heat offset is clamped and inert without a heat pump.**
`heatpump: true, residualHeat: true` in an optimized state reduces `heatpump.power` by exactly `RESIDUAL_HEAT_OFFSET`, never below 0 (construct a case where nameplate minus offset would go negative and assert the floor holds). `residualHeat: true, heatpump: false` leaves `heatpump.power` at `0`/`'uit'`, identical to `residualHeat: false` — inert, no special-cased crash or NaN.

### Explicitly out of scope for this test file

Same discipline as `LOGIC_PLAN.md` §5's own out-of-scope list, extended: pointer-drag hit-testing, ghost-element positioning, magnetize-radius tuning, `pointercancel` recovery visuals, the 8px tap/drag threshold's exact value, and the thermal dashed-line/flow-animation `stroke-dasharray` interaction (§6.5) are DOM/visual/on-device concerns — no Node test can meaningfully cover them, and per UX §11 they need a QA pass on the real kiosk touchscreen, not a simulated pointer event in a test runner. Attempting to fake pointer geometry in `node:test` would test the fake, not the interaction.

## 8. Open items for the implementer

1. **§3.7's "6 vs 7" discrepancy between UX §2/§8's copy and UX §3's actual P0 palette needs a decision before the readout ships** — recommend deriving both numbers from `ASSET_DEFS` (as specified) so whichever answer is chosen can't drift again, but the *answer itself* (does `thermalBuffer` count toward the total) is a UX call, not an engineering one.
2. **`BUFFER_LINE.zonpiek`'s exact wording is inferred, not quoted** — UX §5 gives an example string for Zonpiek (`Warmtebuffer slaat overtollige warmte op voor de avond`) and states the Avondpiek/Netcongestie pattern but only spells out one shared example for both; §3.4 above assumes they're identical. Confirm before shipping copy.
3. **`RESIDUAL_HEAT_OFFSET = 10` kW is this doc's own assumption**, flagged the same way `LOGIC_PLAN.md` §6 flags its charger/heat-pump nameplates — needs the same kind of sign-off, and only matters if P1's `residualHeat` asset actually ships.
4. **SVG `role="button"` keyboard handling (§6.4) is the one spot needing custom `keydown` code** in an otherwise button-native interaction model — worth a focused on-device screen-reader smoke test (VoiceOver/NVDA) before the stand, since SVG accessibility support varies more across browsers than plain HTML controls do.
5. **Zonnecarport (§2, P1, cosmetic-only)** — if it ships, confirm during implementation that it truly needs zero `placedAssets`/`ASSET_DEFS` changes (just a conditional CSS/grouping treatment when `pv && chargers[0]` are both present); if an implementer finds themselves wanting a new boolean for it, that's a signal the "cosmetic only" framing from UX §9 has quietly grown scope and needs a re-check against the two-week timeline (UX doc's own timeline flag, §0).
