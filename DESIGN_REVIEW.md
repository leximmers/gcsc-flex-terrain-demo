# Design review — GCSC Flex Terrain Demo

Design lead pass on `BRIEF.md`. This is a spec for implementation, not a mockup — concrete enough to build from, opinionated enough to argue with.

## 0. Framing decision

The strongest way to hit "Monitor / demo-console, not marketing landing page" is to borrow the visual grammar of a **single-line electrical diagram (SLD)**, not a SaaS "system architecture" diagram. Concretely: orthogonal (right-angle) connector lines on a spine, small square/circle junction nodes, small-caps labels, no clouds, no bubble icons, no curved connector lines. This single choice does more to avoid "generic SaaS" than any amount of color restraint, so it's the anchor the rest of the spec hangs off.

Second decision: the terrain diagram and the console are **one instrument, not a diagram next to a text panel that happens to update together**. Selecting a scenario and pressing "Optimaliseer terrein" must visibly move things in the diagram (line color, dash flow, node status chips) at the same moment the numbers and action log update. If the diagram is static and only the sidebar text changes, the demo reads as a slideshow, not a control system.

## 1. Composition

Target instrument: a kiosk monitor or laptop in landscape, viewed from ~1–2m at a stand, operated by touch or mouse by a visitor who has never seen it.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ GCSC · Terrein-simulatie        SIMULATIE · ILLUSTRATIEVE CIJFERS  ⏱ 18:20 ⤫│  header, 56–64px
├───────────────────────────────────────────────┬──────────────────────────┤
│  Kies een scenario om te zien hoe GCSC stuurt  │  NETAANSLUITING          │
│  [ Zonpiek ] [ Avondpiek ] [ Netcongestie ]    │  ┌────────────────────┐  │
│   Veel zon,   Laden na      Netbeheerder        │  │  import bar +      │  │
│   weinig      werktijd      vraagt minder       │  │  limietlijn         │  │
│   verbruik    begint        import              │  │  128 kW / 150 kW    │  │
│                                                 │  │  Binnen limiet ●    │  │
│  ┌─────────────────────────────────────────┐   │  └────────────────────┘  │
│  │        [ single-line terrain diagram ]    │   │  UITLEG                  │
│  │   Net ──┬── Batterij                      │   │  "De besturingslaag      │
│  │         ├── Zonnepanelen                  │   │   stuurt het overschot   │
│  │         ├── Laadpaal 1 / 2 / 3            │   │   naar de batterij…"     │
│  │         ├── Warmtepomp (flexibel)         │   │                          │
│  │         └── Gebouwlast (essentieel) 🔒    │   │  ACTIES NU                │
│  └─────────────────────────────────────────┘   │  · Batterij laadt 18 kW   │
│                                                 │  · Laadpaal 2 gepauzeerd  │
│                                                 │  · Warmtepomp vooraf aan  │
│                                                 │                          │
│                                                 │  [  Optimaliseer terrein ]│
├───────────────────────────────────────────────┴──────────────────────────┤
│ ● nominaal  ● sturing/waarschuwing   Beperkte beweging: uit               │  footer, 40–48px
│ Cijfers zijn een illustratief simulatiescenario, geen meetdata.           │
└──────────────────────────────────────────────────────────────────────────┘
```

Grid: 12-column CSS grid. Left zone (terrain + scenario tabs) spans 7–8 columns, right zone (console rail) spans 4–5 columns, min-width 420px so the numeric readouts never wrap. Header and footer are fixed-height hairline-bordered strips, not cards.

**Left zone, top to bottom:**
1. One persistent helper line above the tabs (`Kies een scenario om te zien hoe GCSC het terrein aanstuurt.`) — always visible, even after a scenario is picked. Walk-up visitors arrive mid-demo; this line is the one sentence that has to work with zero prior context.
2. Three scenario tabs, each with a title and a one-line plain-language subtitle baked into the tab itself (not hidden in a tooltip) — this is what makes jargon like "Netcongestie" legible to a non-technical visitor in the same glance.
3. The terrain diagram, fixed aspect ratio (~16:9 within its own box), SVG-based single-line diagram as described in §0.

**Right zone, top to bottom:**
1. `NETAANSLUITING` panel: current import as a large tabular-numeral figure, a horizontal bar with a distinct limit marker line, and a one-word status (`Binnen limiet` / `Boven limiet`).
2. `UITLEG` — 2–3 sentence plain-language paragraph, rewritten per scenario and per optimize state (before/after copy in §4).
3. `ACTIES NU` — a short live list (3–5 lines) of the control layer's current coordinated actions, one line per asset, prefixed with a bullet, not icons-in-circles.
4. `Optimaliseer terrein` button, full-width of the rail, bottom-anchored — the single required CTA, never competing with secondary buttons for primacy.

No card shadows, no rounded "widget" boxes. Panels are separated by 1px hairlines and label-first section headers (small-caps, letter-spaced), the way an oscilloscope or SCADA panel groups readouts — not the way a dashboard groups KPI cards.

## 2. Visual tokens

Palette — exactly four hues plus neutrals, per brief (near-black/navy, warm off-white, one green, one amber). No red, no blue accent, no gradients anywhere, including on hover/focus states.

| Token | Value | Use |
|---|---|---|
| `--bg-base` | `#101418` | app background |
| `--bg-panel` | `#181F27` | console rail, header/footer strips (one step lighter, still flat) |
| `--bg-diagram` | `#0C1014` | terrain diagram canvas (slightly darker — "screen within the console") |
| `--line-hairline` | `rgba(237,231,218,0.12)` | panel borders, dividers, diagram spine lines (idle state) |
| `--ink` | `#EDE7DA` | primary text (warm off-white) |
| `--ink-dim` | `rgba(237,231,218,0.62)` | secondary text, subtitles, footer note |
| `--ink-faint` | `rgba(237,231,218,0.34)` | disabled/idle labels |
| `--green` | `#4C9A6A` | nominal state, within-limit, renewable/coordinated flow |
| `--green-dim` | `rgba(76,154,106,0.16)` | fills, active-tab background wash |
| `--amber` | `#D99A2B` | warning state, above-limit, throttled/curtailed flow |
| `--amber-dim` | `rgba(217,154,43,0.16)` | fills, warning background wash |

Contrast check to carry into implementation: `--ink` on `--bg-base` and `--bg-panel` both clear WCAG AA for body text; `--amber` on `--bg-base` clears AA for large/bold text (≥18px or bold ≥14px) but should not be used for small-text warnings — reserve it for the status bar, the limit-breach fill, and node/line color, never for a full sentence of body copy at small size.

Typography — **system stacks only**, because the brief requires a self-contained `index.html` with no external dependencies (no Google Fonts / webfont embedding, even though a technical grotesk like IBM Plex Sans would reinforce the console feel further).

- UI stack: `-apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif`
- Numeric/console stack: `ui-monospace, "SFMono-Regular", "Consolas", "Liberation Mono", monospace` — used for every number (kW values, kWh, timestamps, the simulated clock) so readouts feel instrumented, not typeset.

Type scale (px): micro `11` (small-caps section labels, `letter-spacing: 0.06em`), small `13` (secondary body, action log), base `15` (paragraph body), md `18` (panel titles, tab labels), lg `28` (grid-import readout, monospace), xl not used — a dense console doesn't need a hero number, and a giant number would read as a marketing stat tile, which is exactly the slop to avoid.

Shape and spacing: spacing scale `4/8/12/16/24/32/48`. Border radius `2px` on interactive controls only (buttons, tabs) — sharp enough to feel instrumented, not a rounded SaaS pill. Diagram nodes are squares/rectangles with `1–2px` radius, never circles-with-gradient-fill. Border width `1px` hairline throughout; no drop shadows anywhere in the UI.

Iconography: no icon font, no emoji in the shipped UI (the 🔒 in the wireframe above is a placeholder for "always-on/protected" — implement as a small static padlock glyph drawn in SVG at 12–14px, or a text badge `essentieel`, whichever is cheaper to keep crisp with no external icon set).

## 3. Information hierarchy

Design target from the brief: understand the value in under a minute, no technical background assumed.

1. **0–5s, glance from a distance.** Wordmark + `SIMULATIE` badge + the terrain diagram's silhouette + the import bar. A visitor walking past should register "this is a live-looking control system for a business park" without reading a word.
2. **5–15s, orient.** Scenario tabs with their one-line plain-language subtitles. This is where "Netcongestie" gets defined for a non-technical reader without a glossary.
3. **15–40s, explore.** Visitor taps between the three scenarios. Diagram, import bar, `UITLEG`, and `ACTIES NU` all update together. This is the core proof: different situations, visibly different coordination.
4. **40–60s, act.** Visitor presses `Optimaliseer terrein`. The baseline (uncoordinated, often above limit, amber) resolves to the coordinated state (green, action log populated, import at/under limit). This single interaction is the whole pitch — "GCSC makes bedrijventerreinen flexible" — and it must be the most visually rewarding moment in the demo.
5. **60s+, depth for the interested.** Footer legend and the illustrative-figures disclaimer. Nothing below the fold requires reading for the core message to land — this tier is for a visitor who wants to double-check what they're looking at, or for a GCSC staffer fielding a follow-up question at the stand.

Default state on load: **Zonpiek pre-selected**, baseline (not yet optimized). A blank/empty state on a kiosk reads as broken; a pre-loaded scenario reads as "live system, come interact with it."

## 4. Responsive behavior

Primary target is a landscape kiosk/monitor ≥1280px; the demo will also get pulled up on a staff laptop for a 1:1 conversation, so it needs to degrade gracefully, not just survive.

- **≥1280px (kiosk/monitor, primary):** two-column layout as drawn in §1, terrain 7–8 cols / console 4–5 cols.
- **1024–1279px (laptop):** same two-column layout, console rail narrows to its 420px floor; drop the scenario tab subtitles to a single truncation-safe line; action log stays 3 lines with scroll for a 4th/5th.
- **768–1023px (tablet, held demo):** stack vertically — terrain diagram on top at a fixed 16:9 box, console rail below at full width. Scenario tabs become a horizontally scrollable chip row instead of three fixed-width tabs.
- **<768px (phone, edge case — a staffer sharing a link, not the stand itself):** fully stacked; diagram simplified to static (no dash-flow animation, color-state only, since a phone view isn't the "watch it move" moment); `Optimaliseer terrein` becomes a sticky bottom bar so it's always reachable without scrolling back up.

**Reduced motion** (brief-required, not optional): both a `prefers-reduced-motion: reduce` media query and a manual header toggle (`Beperkte beweging`) must independently disable animation — a visitor on the stand's own hardware won't have their OS setting configured, so the manual toggle is the one that actually gets used in the field. When active:
- Dash-flow animation on diagram lines is replaced by static directional chevrons at fixed intervals — direction and magnitude (thin/medium/thick line) are still legible without motion.
- No pulsing/blinking on the amber warning state; the amber fill and status text alone carry the "above limit" signal.
- State transitions (baseline → optimized) become an instant swap or a ≤150ms opacity fade instead of an animated line/bar sweep.
- Toggle state persists across scenario switches within the session (no need to persist across reloads for a kiosk).

Touch targets: scenario tabs and the optimize button need ≥44×44px hit areas given this is likely operated by touch at a stand.

## 5. Dutch microcopy

Exact strings, plain language, no invented figures/claims per the brief's constraints (no production-deployment claim, no invented savings %, everything framed as illustrative simulation).

**Header**
- Wordmark: `GCSC`
- Subline: `Terrein-simulatie`
- Status badge: `SIMULATIE · ILLUSTRATIEVE CIJFERS`
- Motion toggle: `Beperkte beweging` (on/off switch, states `aan` / `uit`)

**Helper line above tabs**
> `Kies een scenario om te zien hoe GCSC het terrein aanstuurt.`

**Scenario tabs** (title + one-line subtitle, both always visible)
1. `Zonpiek` — `Veel zon, weinig verbruik`
2. `Avondpiek` — `Laden na werktijd, verbruik loopt op`
3. `Netcongestie` — `Netbeheerder vraagt om minder import`

**Netaansluiting panel**
- Title: `Netaansluiting`
- Value labels: `Huidige import`, `Importlimiet`
- Bar marker label: `limiet`
- Status text: `Binnen limiet` (green) / `Boven limiet` (amber)

**Diagram node labels**
- `Net` (grid connection entry point)
- `Zonnepanelen`
- `Batterij`
- `Laadpaal 1` / `Laadpaal 2` / `Laadpaal 3`
- `Warmtepomp` — subtitle `flexibele warmtevraag`
- `Gebouwlast` — subtitle `essentieel, altijd gegarandeerd`
- Per-charger status chip: `actief` / `gepauzeerd` / `later`

**Uitleg — plain-language explanation, baseline vs. after `Optimaliseer terrein`**

*Zonpiek*
- Baseline: `Er is veel zonne-energie beschikbaar, maar het verbruik op het terrein is laag. Zonder sturing wordt een groot deel van de opwek teruggeleverd aan het net.`
- Geoptimaliseerd: `De besturingslaag stuurt het overschot naar de batterij en de laadpalen, en warmt de warmtepomp vast voor. Meer zonne-energie blijft op het terrein zelf.`

*Avondpiek*
- Baseline: `Medewerkers laden hun auto op terwijl verwarming en gebouwlast ook oplopen. De import nadert de aansluitlimiet.`
- Geoptimaliseerd: `De batterij vult de piek aan en de laadpalen worden na elkaar belast in plaats van gelijktijdig. De import blijft onder de limiet.`

*Netcongestie*
- Baseline: `De netbeheerder vraagt dit terrein om de import tijdelijk te verlagen. Zonder sturing blijft het verbruik te hoog.`
- Geoptimaliseerd: `De besturingslaag verlaagt gecoördineerd de laadsnelheid en schuift een deel van de warmtevraag door, binnen vooraf ingestelde grenzen. De essentiële gebouwlast blijft gegarandeerd.`

**Acties nu** (action log — asset + action + reason, terse SCADA-style lines, examples across scenarios)
- `Batterij levert 18 kW om de piek af te vlakken`
- `Laadpaal 2 en 3 tijdelijk teruggeschakeld`
- `Warmtepomp vooraf opgewarmd op zonne-overschot`
- `Laadpalen na elkaar geladen in plaats van gelijktijdig`
- `Warmtevraag doorgeschoven binnen ingestelde grenzen`
- `Gebouwlast: geen aanpassing (essentieel)`

**Optimize button**
- Default: `Optimaliseer terrein`
- Busy (brief transition state, ~600–900ms): `Bezig met optimaliseren…`
- After: button becomes a disabled/secondary state labeled `Geoptimaliseerd`, with a small text-link next to it, `Toon uitgangssituatie opnieuw`, to reset and demo the before/after again — this reset is important for a stand demo where the same interaction gets repeated for the next visitor.

**Footer**
- Legend: `● nominaal` `● sturing / waarschuwing`
- Disclaimer (small, always visible, satisfies the brief's "illustrative, not real measurements" constraint at the point of use): `Cijfers zijn een illustratief simulatiescenario, geen meetdata.`

**Words to actively avoid** in any copy pass: `slim` (overused/empty), `naadloos`, `revolutionair`, `baanbrekend`, `real-time` (say `live` only when paired with `simulatie`, never standalone as if it were production telemetry), `ontketen`, `krachtig`, any exclamation marks.

## 6. Slop self-audit

Checked against the brief's explicit "avoid generic SaaS feature-card layouts, gradients, fake statistics and stock imagery" and against general AI-generated-UI tells.

| Risk | Verdict | Why |
|---|---|---|
| Generic SaaS feature cards | **Avoided** | No card grid anywhere; layout is a console with hairline-divided panels, and the diagram is a single-line electrical schematic, not a boxes-and-arrows "architecture" graphic. |
| Gradients | **Avoided** | Token table (§2) is flat fills only; explicitly no gradient on hover/focus/active either. |
| Drop shadows / glassmorphism | **Avoided** | 1px hairline borders only, called out explicitly in §2. |
| Rounded pill buttons, bubbly UI | **Avoided** | 2px radius ceiling, sharp/instrumented feel, not a rounded consumer-app look. |
| Icon-in-gradient-circle dashboard cliché | **Avoided** | No icon font/circle icons; diagram nodes are square/rect junctions per SLD convention, per §0. |
| Fake statistics / vanity metrics | **Avoided** | All numbers are explicitly framed as illustrative simulation via the header badge and footer disclaimer (§5); no invented savings %, customer counts, or claimed deployments, per brief constraints. |
| Stock imagery / hero photography | **Avoided** | No photography anywhere; the terrain visual is a drawn schematic. |
| Emoji / decorative icon overload | **Avoided** | No emoji in shipped UI; the one padlock glyph is functional (protected-load state), not decorative, and specified as a drawn SVG glyph, not an emoji character. |
| Marketing buzzwords / hype tone | **Avoided** | Explicit avoid-list in §5; all drafted copy is declarative/plain, matches brief's "plain language" requirement. |
| Custom webfonts (contradicts "no external dependencies") | **Caught and corrected** | Originally reached for a technical grotesk (IBM Plex Sans); flagged in §2 and reverted to system font stacks since the brief requires a fully self-contained `index.html`. |
| Giant hero stat number | **Avoided** | Type scale intentionally stops at `lg` (28px) for the import readout; no `xl` hero-number treatment, which would read as a marketing stat tile rather than a console readout. |
| Reduced-motion as an afterthought | **Addressed directly** | §4 specifies both the media-query and manual-toggle paths, and what "reduced" means concretely for the dash-flow animation and warning state — not just "add the CSS query and hope." |
| Color creep beyond the 2-accent restraint | **Guarded** | Token table is closed (green/amber only, no red/blue); implementation should treat any third accent color request as a spec deviation to flag, not silently add. |
| Jargon left unexplained (`Netcongestie`) | **Addressed** | Every scenario tab carries a plain-language subtitle inline, not hidden in a tooltip, so the "understand in under a minute, no technical background" audience requirement is met without a glossary. |
| Essential-load promise stated but not shown | **Addressed** | Building load is visually distinct (protected/never-curtailed state) and gets an explicit action-log line (`Gebouwlast: geen aanpassing`) in the Netcongestie scenario, so the "we protect your essential load" claim is demonstrated, not just asserted in copy. |

Open item for implementation, not resolved by this doc: verify `--amber` against `--bg-panel` (not just `--bg-base`) once real component contrast is in place, since the console rail background is one step lighter than the base and amber-on-panel is used for the "Boven limiet" status word.
