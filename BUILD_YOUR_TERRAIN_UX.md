# "Bouw je eigen industrieterrein" — interaction model

Experience-design pass, additive to `DESIGN_REVIEW.md`. That doc specced a **look-and-see** demo (three fixed scenarios, one optimize button). This doc specs the requested upgrade: a **build-your-own** demo where the visitor assembles the terrain first, then stress-tests their own choices. It reuses the console visual grammar, token set, reducer pattern and copy voice already established — it does not replace them.

Not modifying code here. This is the spec to build from.

**Timeline flag up front:** today is 2026-09-08, the stand is 2026-09-22 — a two-week build window. §9 splits this into a P0 that ships and a P1 that only happens if P0 lands early. Do not start P1 work before P0 is demo-ready end to end.

## 0. Framing decisions

**0.1 The build step is prepended, not bolted on.** Visitor journey becomes: build the terrain → pick a situation → optimize & compare. Steps 2 and 3 are almost exactly the existing `index.html` (scenario tabs, import bar, uitleg, acties nu, optimize button) — they now just run against *whatever the visitor placed* instead of a fixed asset list. Nothing about the console rail, the SLD diagram grammar, the palette of four hues, or the hairline/no-shadow visual language changes.

**0.2 Drag-and-drop, with tap-to-place as the load-bearing path, not a fallback.** Real pointer/touch drag from a palette tile onto a highlighted matching slot is the primary, marketed affordance ("sleep"). But kiosk touchscreens make freeform drag unreliable under stand conditions (grubby glass, visitors dragging too fast, drag-cancel edge cases), so every tile is *also* directly tappable: tap a palette tile to place it into the next open matching slot; tap a placed node to remove it. This is the same pattern already used for reduced motion in `DESIGN_REVIEW.md` §4 — two independent paths to the same state, because the one that "should" work (OS setting / precise drag) is not the one that reliably gets used on the stand's own hardware. Copy says "sleep of tik" everywhere a placement action is described, so neither path is presented as the "real" one.

**0.3 The canvas stays a single-line diagram, not a floorplan.** The temptation with "build your own terrain" is a literal map with building icons and drag-anywhere placement — that is exactly the generic-SaaS/stock-imagery territory `DESIGN_REVIEW.md` §6 flags. Instead: the terrain diagram keeps its fixed spine-and-node layout from the existing demo. What's new is that **some node positions start empty** (dashed placeholder rectangles) instead of always-populated. Placing an asset fills a specific, fixed slot; it never repositions the diagram. This means ~90% of the existing SVG-building code (`buildDiagram`, `setLineFlow`, `setNodeState`) is reused unchanged — only slot emptiness is new.

**0.4 Net and Gebouwlast are not placeable — they're the terrain.** The brief's essential-load guarantee ("essentieel, altijd gegarandeerd") is a claim this demo makes; a visitor should not be able to remove the thing that proves it. Grid connection and building load are pre-drawn, unremovable anchors with a `vast` (fixed) badge instead of a remove control. Everything else — PV, battery, chargers, heat pump, thermal buffer — is optional and starts empty or pre-filled per §4.

## 1. Visitor journey

```
ATTRACT ──tap "Begin met bouwen"──▶ STAP 1 · BOUWEN ──▶ STAP 2 · SITUATIE ──▶ STAP 3 · VERGELIJKEN ──▶ (reset) ──▶ ATTRACT
                                         ▲                    │                        │
                                         └────── "Wijzig terrein" ─────────────────────┘
```

- **Attract (idle, 0s):** kiosk default when nobody is interacting. Title, one-line promise, big CTA. This is also what a walk-up visitor sees from 2m away, so it must read the value prop without a tap. See §8 for copy.
- **Stap 1 · Terrein bouwen (target 30–60s):** palette + canvas. Visitor adds/removes assets. Free to linger; no timer, no auto-advance — a visitor deciding whether to add a battery is the demo working, not the demo stalling.
- **Stap 2 · Situatie kiezen (target 10–20s):** the three existing scenario tabs (Zonpiek / Avondpiek / Netcongestie), now applied to the visitor's own terrain. Import bar, uitleg and acties-nu update live per the existing pattern.
- **Stap 3 · Optimaliseren & vergelijken (target 20–40s):** the existing `Optimaliseer terrein` button and before/after reveal, now scoped to the visitor's asset set — including the gap-callouts in §6 when they left something out.
- **Free navigation, not a locked wizard:** a persistent `Wijzig terrein` link/step-tab is always reachable from steps 2–3, so a visitor can go back, add a battery, and immediately re-run the scenario they were just looking at. The pedagogical payoff of this whole feature is "try it without the battery, then try it with the battery" — that loop must never require a full reset.
- **Reset for the next visitor:** `Nieuw terrein bouwen` (full reset — see §8) is reachable from every step, not just the end state, since a mid-build abandonment (visitor walks off, staffer needs to reset for the next person) is the common case at a stand, not the edge case.
- **Inactivity return-to-attract:** after ~90s with no input on any step, fade to the Attract screen. This both resets the kiosk for the next visitor and doubles as a soft attention-grabber for anyone standing nearby. Skip this in the P0 cut if time is short (manual reset alone covers the staffed-stand case) — see §9.

Default state is never a blank canvas: on load, and after `Nieuw terrein bouwen`, Stap 1 opens with a small starter terrain already placed (§4), not an empty grid. `DESIGN_REVIEW.md` already established that an empty kiosk reads as broken, not inviting — that logic applies even harder here, since an empty *building* surface reads as broken in a way an empty *viewing* surface doesn't.

## 2. Composition per step

```
┌──────────────────────────────────────────────────────────────────────────┐
│ GCSC · Terrein-simulatie   SIMULATIE · ILLUSTRATIEVE CIJFERS   ⏱ 18:20 ⤫  │
├──────────────────────────────────────────────────────────────────────────┤
│ [ 1 Terrein bouwen ]  [ 2 Situatie kiezen ]  [ 3 Optimaliseren ]  Nieuw ↺ │  step rail, replaces old helper line
├───────────────────────────────────────────────┬──────────────────────────┤
│  Sleep of tik een asset naar het terrein.      │  PALET                   │
│  Netaansluiting en gebouwlast staan vast.      │  ── Elektrisch ──        │
│                                                 │  [PV] [Batterij]         │
│  ┌─────────────────────────────────────────┐   │  [Laadpaal]              │
│  │        [ terrain diagram, filled +        │   │  ── Thermisch &         │
│  │          empty dashed slots ]             │   │     behind-the-meter ─  │
│  │   Net ──┬── Batterij [leeg: + opslag]     │   │  [Warmtepomp]           │
│  │         ├── Zonnepanelen                  │   │  [Warmtebuffer]         │
│  │         ├── Laadpaal 1 [leeg: + laadpaal] │   │                          │
│  │         ├── [leeg: + laadpaal]            │   │  Terrein: 2 van 6       │
│  │         ├── Warmtepomp [leeg]             │   │  assets geplaatst        │
│  │         └── Gebouwlast (vast) 🔒          │   │                          │
│  └─────────────────────────────────────────┘   │  [ Volgende: situatie → ]│
├───────────────────────────────────────────────┴──────────────────────────┤
│ ● nominaal  ● sturing/waarschuwing   Beperkte beweging: uit               │
│ Cijfers zijn een illustratief simulatiescenario, geen meetdata.           │
└──────────────────────────────────────────────────────────────────────────┘
```

Steps 2 and 3 reuse the exact layout already shipped in `index.html` (scenario tabs where the palette was, `NETAANSLUITING` / `UITLEG` / `ACTIES NU` / optimize button in the right rail) — the only new element carried into every step is the **step rail** replacing the single helper line, and a small `Terrein: N van 6 assets geplaatst` readout so a visitor who skips ahead can see at a glance whether they built a minimal or fully-loaded terrain.

Grid, spacing, hairline dividers, panel headers, type scale: unchanged from `DESIGN_REVIEW.md` §1–2. The palette panel uses the same `panel` / `panel-header` treatment as `NETAANSLUITING` and `UITLEG` already do — it is a console panel, not a toolbox widget.

## 3. Palette of assets

Two labeled groups, mirroring the brief's core proposition verbatim ("GCSC connects existing solar panels, EV charging, batteries, HVAC/heat pumps and thermal storage") — the group split *is* the argument that GCSC spans electrical and thermal, so it stays visible rather than being flattened into one list.

| Group | Tile | Subtitle (visitor-facing) | Spec chip (mono, illustrative) | Max count |
|---|---|---|---|---|
| Elektrisch | `Zonnepanelen` | Opwek uit zon | `140 kW piek` | 1 |
| Elektrisch | `Batterij` | Elektrische opslag | `60 kW / 200 kWh` | 1 |
| Elektrisch | `Laadpaal` | Flexibel elektrisch verbruik | `25 kW per paal` | 3 |
| Thermisch & behind-the-meter | `Warmtepomp` | Flexibele warmtevraag | `30 kW` | 1 |
| Thermisch & behind-the-meter | `Warmtebuffer` | Thermische opslag | `verlengt vooraf verwarmen` | 1 |

Fixed anchors — drawn on the canvas, never in the palette, never removable:

| Node | Label | Subtitle | Badge |
|---|---|---|---|
| Grid entry | `Net` | netaansluiting | — |
| Essential load | `Gebouwlast` | essentieel, altijd gegarandeerd | `vast` |

**Internal mapping — do not surface in visitor-facing copy.** Kept here only so an engineer or a staffer fielding a follow-up question knows why these specific tiles exist; none of this is a UI string, and none of it should read on the stand as "this is deployed":
- `Warmtepomp` (predictive pre-heat behavior) ↔ SOMA retrofit heating control concept.
- `Warmtebuffer` (thermal state estimation / shifting) ↔ Suncom / THERMOS thermal storage and industrial-heat work.
- `Batterij` + `Laadpaal` + carport-style PV framing (P1, §9) ↔ Amperapark embedded/protocol interoperability opportunity space.
- The palette itself (supplier-independent tiles behind one control layer) ↔ Flex Hub's brand-independent, local-first control model.

None of these names, product identifiers, or "this is how it works at X" claims belong in visitor copy — the brief's constraint against claiming production deployment applies to implication, not just literal wording. If a staffer wants to go deeper, that's a conversation, not a UI label.

## 4. Canvas & drag/drop mechanics

**Starter terrain (on load / after full reset):** `Net` + `Gebouwlast` (fixed) + `Zonnepanelen` + `Laadpaal 1` pre-placed. Everything else (`Batterij`, `Laadpaal 2/3`, `Warmtepomp`, `Warmtebuffer`) starts as an empty dashed slot. This gives an immediately legible, non-broken diagram while leaving obvious gaps that invite the drag/tap interaction — a visitor's eye goes to the dashed rectangles.

**Placement:**
- *Drag path:* press-hold a palette tile, drag over the canvas; the matching empty slot(s) highlight (border shifts from hairline to `--green`, per the existing `.sld-node.on` treatment) as the drag enters the diagram area; releasing over a highlighted slot places it, with slot-snapping generous enough that an imprecise touch release still lands (magnetize to nearest matching empty slot within the whole diagram bounding box, not just the exact rectangle).
- *Tap path:* tap a palette tile → it fills the next open matching slot immediately (for `Laadpaal`, in order 1 → 2 → 3). No intermediate "armed" state to manage — this keeps the tap path a true one-step equivalent of drag, not a two-step mode switch that behaves differently.
- *Removal:* tap a placed (non-fixed) node → confirveturns to its empty dashed slot, tile becomes available in the palette again. No drag-to-remove needed; tap is sufficient and more reliable for a "take this away" action.
- *Full slots:* once `Batterij`, `Warmtepomp`, or `Warmtebuffer` is placed, that palette tile shows a `geplaatst` state (dimmed, non-interactive except as an implicit "tap the node to remove" pointer) rather than disappearing — a visitor should always be able to see the full catalog of what GCSC can connect, even mid-build.
- *Laadpaal count:* palette shows one `Laadpaal` tile with a small `1/3` counter; placing increments toward the 3 fixed charger slots on the spine; at 3/3 the tile dims.

**What the canvas will not do:** free positioning, resizing, rotation, or a literal parcel/map background. The diagram's job is to look like an instrument reading, not a level editor — see §0.3.

## 5. Thermal / behind-the-meter assets — behavior detail

This is the part of the upgrade that most directly demonstrates the brief's "not just electrical" claim, so it gets the most explanation. Both tiles reuse the existing node visual language (square/rect node on the spine, `1–2px` radius, no new color) — thermal assets are distinguished by a **dashed connector line** to the spine (vs. solid for electrical), not by a new hue. This keeps the closed four-hue palette from `DESIGN_REVIEW.md` §2 intact while still giving a visitor a "these are a different kind of asset" cue on sight.

**Warmtepomp** (already in the shipped demo) — unchanged behavior: contributes 30 kW nominal thermal-electric load; in optimized mode can be pre-heated ahead of a PV surplus or curtailed/shifted under congestion, within "vooraf ingestelde grenzen" (the same phrase already used in the shipped copy — do not invent a new phrase for the same constraint).

**Warmtebuffer** (new) — deliberately *not* another kW slider. It doesn't add its own line to the import calculation; it's a modifier on what the heat pump is allowed to do:
- Without a buffer placed: heat pump pre-heat/shift actions are shown as smaller, single-step moves (matches today's shipped `Warmtepomp vooraf opgewarmd, 25 kW` style line).
- With a buffer placed: the same scenario's optimized action log gets a second, buffer-specific line — e.g. `Warmtebuffer slaat overtollige warmte op voor de avond` (Zonpiek) or `Warmtebuffer levert warmte terug, warmtepomp blijft uit` (Avondpiek/Netcongestie) — and the `Warmtepomp` node's optimized state can hold at `uit`/idle for longer while the buffer covers demand, which is visually the buffer "doing work" without needing its own numeric readout.
- If `Warmtebuffer` is placed but `Warmtepomp` is not: it's inert. Copy on tap/hover of an inert buffer: `Warmtebuffer werkt samen met een warmtepomp. Plaats ook een warmtepomp om dit te activeren.` This is a deliberate, honest constraint (a buffer needs something to buffer) rather than a workaround to make every tile independently "do something" — don't paper over it with a fake standalone behavior.

This keeps the thermal story real without inventing a second numeric model that would need its own fake precision.

## 6. Scenario simulation — generalized rules

The existing engine (`computeNetImport`, the three `SCENARIOS` objects, `applyEvent`) hardcodes one fixed asset list. The upgrade needs the same shape of computation but conditioned on which assets are actually on the canvas. This section is a rules table, not code — the exact refactor of `logic.js`/`index.html` is a follow-on engineering pass, but every rule below is meant to be directly implementable against the existing reducer pattern.

**Net import formula, generalized** (extends the existing `computeNetImport`):
```
netImport = buildingLoad
          + (heatpumpPlaced ? heatpump.power : 0)
          + sum(chargers[i].power for i in placed chargers)
          + (batteryPlaced ? battery.power : 0)
          - (pvPlaced ? pv.output : 0)
```
Environmental parameters per scenario (PV output level, charger demand pattern, building load, import limit) stay exactly as already defined in `SCENARIOS.*.baseline` — those describe the *situation*, not the visitor's asset choices, so they don't change. What changes is that any asset the visitor didn't place contributes `0` and is dropped from both the diagram (dashed/idle node) and the `ACTIES NU` log.

**Dispatch rules for `Optimaliseer terrein`, per scenario, conditioned on presence:**

| Scenario | If `Batterij` placed | If `Laadpaal`(s) placed | If `Warmtepomp` placed | If none of the above placed |
|---|---|---|---|---|
| Zonpiek | Charges on PV surplus (as shipped) | Charges on PV surplus, in placement order | Pre-heats on PV surplus | `Uitleg` states the surplus is exported unused; no action-log entries beyond `Gebouwlast: geen aanpassing` |
| Avondpiek | Discharges to flatten peak (as shipped) | Sequenced instead of simultaneous | No change needed (already off-peak-shaped) | Import simply tracks raw demand; `Uitleg` states nothing is available to flatten the peak |
| Netcongestie | Discharges within set bounds (as shipped) | Scaled down / paused in placement order | Shifted within set bounds; buffer covers if present | Import may stay at or above the temporary limit after optimize; this is the one case worth showing plainly rather than softening — see gap-callout below |

**Gap-callouts.** When `Optimaliseer terrein` is pressed on a terrain missing the asset that scenario most needs, the `Uitleg` optimized copy names the gap instead of silently doing nothing — this is the pedagogical core of the whole feature (comparing "with" vs "without" is the point of letting visitors build). Example, Netcongestie with nothing flexible placed:
> `Dit terrein heeft geen batterij, laadpalen of warmtepomp. Zonder flexibele bronnen kan de besturingslaag de import niet verlagen — voeg een asset toe en probeer het opnieuw.`

This is still inside the brief's constraints: it states a mechanism ("without flexible sources, the layer cannot lower import"), not a number, and it doesn't claim the *fully-loaded* terrain achieves any specific percentage either — it only ever shows "binnen limiet" / "boven limiet" as a state, exactly as the shipped demo already does.

**Zero-asset edge case:** a terrain with only `Net` + `Gebouwlast` still simulates — `Optimaliseer terrein` becomes disabled with inline copy `Geen sturing mogelijk zonder geplaatste assets` rather than silently doing nothing when pressed, so the button never looks broken.

## 7. State model extension (for implementation)

Extends the existing reducer (`applyEvent` / `uiState`) rather than replacing it:

```
uiState = {
  step: 'build' | 'scenario' | 'result',
  placedAssets: {
    pv: boolean,
    battery: boolean,
    chargers: [boolean, boolean, boolean],
    heatpump: boolean,
    thermalBuffer: boolean,
  },
  scenarioId: 'zonpiek' | 'avondpiek' | 'netcongestie',
  mode: 'baseline' | 'optimizing' | 'optimized',
  pendingToken: string | null,
}
```

New event types, same style as the existing `SELECT_SCENARIO` / `OPTIMIZE_REQUEST` / `OPTIMIZE_RESOLVE` / `RESET`:
- `PLACE_ASSET { key }` / `REMOVE_ASSET { key }` — mutate `placedAssets`; also reset `mode` to `'baseline'` (a terrain edit invalidates any prior optimized result, same logic already applied to `SELECT_SCENARIO`).
- `GOTO_STEP { step }` — pure navigation, does not touch `placedAssets`, `scenarioId`, or `mode` (this is what makes the "add a battery, immediately re-check the scenario I was on" loop in §1 work).
- `RESET_ALL` — returns to `INITIAL_UI_STATE` with the starter terrain from §4, distinct from the existing scenario-local `RESET` (which only clears `mode`, per the shipped `Toon uitgangssituatie opnieuw` behavior — keep both, they answer different questions: "undo my optimize" vs. "start over for the next visitor").

`computeNetImport` and the per-scenario baseline/optimized data need to become functions of `placedAssets` rather than static objects, per the rules in §6 — flagged here as the one real logic refactor this feature requires; everything else (diagram building, tabs, panels, motion handling) is additive.

## 8. Dutch copy

Same voice and constraints as `DESIGN_REVIEW.md` §5 — plain language, no invented figures, same avoid-list (`slim`, `naadloos`, `revolutionair`, `baanbrekend`, standalone `real-time`, `ontketen`, `krachtig`, exclamation marks).

**Attract screen**
- Title: `Bouw je eigen bedrijventerrein`
- Subline: `Sleep bronnen en verbruikers op het terrein en ontdek hoe GCSC ze op elkaar afstemt.`
- CTA: `Begin met bouwen`

**Step rail**
- `1 · Terrein bouwen`
- `2 · Situatie kiezen`
- `3 · Optimaliseren`
- Reset control (always visible): `Nieuw terrein ↺`

**Step 1 helper line**
> `Sleep of tik een asset naar het terrein. Netaansluiting en gebouwlast staan altijd vast.`

**Palette section headers**
- `Elektrisch`
- `Thermisch & behind-the-meter`

**Palette tile subtitles / spec chips** — see table in §3 (exact strings already given there).

**Placed-count readout**
> `Terrein: {N} van 6 assets geplaatst`

**Empty slot micro-labels** (inside the dashed placeholder rect, small-caps like existing node labels)
- `+ opwek`
- `+ opslag`
- `+ laadpaal`
- `+ warmtepomp`
- `+ warmtebuffer`

**Inert-buffer notice** (on tap/hover of a placed `Warmtebuffer` with no `Warmtepomp`)
> `Warmtebuffer werkt samen met een warmtepomp. Plaats ook een warmtepomp om dit te activeren.`

**Step navigation**
- Forward: `Volgende: situatie kiezen →`
- Back link (persistent on steps 2–3): `← Wijzig terrein`

**Gap-callout uitleg additions** (appended/replacing the optimized `Uitleg` copy when a scenario's key asset is missing — baseline copy per scenario is unchanged from the shipped demo)
- Zonpiek, no `Batterij`: `Dit terrein heeft geen batterij. Het zonne-overschot wordt teruggeleverd aan het net in plaats van lokaal gebruikt.`
- Avondpiek, no `Laadpaal`: `Dit terrein heeft geen laadpalen geplaatst. De avondpiek komt vooral van de gebouwlast.`
- Netcongestie, no flexible asset at all: `Dit terrein heeft geen batterij, laadpalen of warmtepomp. Zonder flexibele bronnen kan de besturingslaag de import niet verlagen — voeg een asset toe en probeer het opnieuw.`

**Disabled-optimize state** (zero flexible assets placed)
> `Geen sturing mogelijk zonder geplaatste assets`

**Reset confirmation** (since `Nieuw terrein ↺` discards an in-progress build — see §10 on why this needs a confirm)
> `Terrein wissen en opnieuw beginnen?` — buttons `Annuleren` / `Nieuw terrein`

**Footer disclaimer** — unchanged, still always visible per the shipped demo:
> `Cijfers zijn een illustratief simulatiescenario, geen meetdata.`

## 9. Scope & phasing (two-week window)

**P0 — must ship for 22 Sept:**
- Step rail + free navigation (§1, §7's `GOTO_STEP`).
- Tap-to-place for the full palette (§3) minus `Warmtebuffer`'s cross-asset copy nuance — ship the simple version first.
- `Warmtepomp`, `Batterij`, `Laadpaal` ×3, `Zonnepanelen` placeable; `Net`/`Gebouwlast` fixed.
- One thermal/behind-the-meter addition: `Warmtebuffer`, since it reuses existing node rendering and only needs the action-log/copy branching in §5 — this is the cheapest way to land the "thermal, not just electrical" story.
- Generalized `computeNetImport` + dispatch rules (§6, §7) — this is the one real logic change and should be built and tested before any visual polish.
- Starter terrain, full reset with confirm, gap-callouts for the two or three most common missing-asset cases (don't need to enumerate every combination — the empty/full extremes matter most).
- Everything already shipped and working (reduced motion, disclaimer, hairline console styling) carries over unchanged.

**P1 — only if P0 is demo-ready with days to spare:**
- Real pointer/touch drag layered on top of tap-to-place (§0.2) — tap-to-place alone is a complete, honest demo; drag is a polish layer, not a blocker.
- `Restwarmtekoppeling` (industrial waste-heat) tile.
- `Zonnecarport` combined PV+laadplein tile skin.
- Idle attract-loop with auto-demo playback and the 90s inactivity return-to-attract (§1).
- Terrain-size toggle (klein/middel/groot scaling building load and import limit together).

If forced to cut further inside P0, cut `Warmtebuffer` before cutting the generalized dispatch logic — a fixed-asset build-your-terrain with only electrical tiles still delivers the "with vs. without flexibility" payoff; a demo with a fixed asset list and no working simulation underneath it does not.

## 10. Constraint check

| Constraint (from `BRIEF.md`) | How this spec holds it |
|---|---|
| No claim of existing production deployment | Palette tiles are generic categories (`Batterij`, `Warmtepomp`), never named products; internal proof-point mapping in §3 is explicitly marked not-for-UI. |
| No invented savings %, revenue, customers, standards, market access | Gap-callouts and dispatch rules (§6) describe *mechanism* (what the control layer can/can't do) and *state* (binnen/boven limiet), never a percentage or currency figure. |
| Figures are illustrative, not measured | All tile specs are labeled `illustratief` via the same header badge and footer disclaimer already shipped; nothing new claims to be measured data. |
| Physical-stand simulation, not a production EMS | Dispatch rules are a fixed rules table (§6), not a real optimizer — kept deliberately simple enough that no visitor could mistake it for live grid telemetry. |
| Dutch, plain language | All new copy in §8 follows the existing avoid-list and sentence-level plainness of the shipped `Uitleg`/`Acties nu` copy. |
| Reduced-motion accessible | New drag interaction gets a fully equivalent, non-drag tap path from day one (§0.2), the same dual-path principle already used for motion; live-region announcements for placement/removal specified in §7 in spirit (`aria-live` on `Terrein: N van 6 assets geplaatst` is the natural anchor — implementation detail for the follow-on engineering pass). |
| Console / monitor style, not marketing landing page | No new hues (thermal assets distinguished by dashed vs. solid connector line, §5); no icons-in-circles; palette panel uses the same hairline `panel`/`panel-header` treatment as every other console panel; no map/floorplan background (§0.3). |

## 11. Open items for implementation

- Exact drag hit-testing/snap radius needs on-device tuning with the actual kiosk touchscreen, not just spec'd here — budget a QA pass with the real hardware, not a laptop trackpad.
- `Nieuw terrein ↺` confirm dialog (§8) is a small new UI pattern (a modal/confirm) not present in the shipped demo at all — needs its own tiny visual spec (hairline panel, two buttons, no backdrop blur/gradient) before implementation, flagged here rather than invented mid-build.
- Decide before building whether `GOTO_STEP` back-navigation from step 3 to step 1 should visually preserve the `mode: 'optimized'` badge state or force back to baseline — recommendation: force back to baseline (editing the terrain invalidates the old optimize result, consistent with `PLACE_ASSET`/`REMOVE_ASSET` already doing this per §7), but call it out since it's a judgment call, not derived from the brief.
