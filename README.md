# GCSC Flex Terrain Demo

Interactive Dutch-language demo console for a business-park flexibility
control layer, built for the Provincie Zuid-Holland stand (22 September
2026). Simulation only — see `BRIEF.md` for scope and constraints.

## Openen

Open `index.html` rechtstreeks in een browser (dubbelklikken, of
`file://` in de adresbalk). Geen server, geen build stap, geen externe
dependencies — alle CSS en JavaScript staan ingebed in het bestand.

Getest in recente Chromium/Firefox/Safari. Aanbevolen vensterbreedte
≥1280px (kiosk/monitor); de layout degradeert naar tablet- en
telefoonformaat.

## Bediening

- Kies een scenario (`Zonpiek`, `Avondpiek`, `Netcongestie`) — het
  terreindiagram, de importbalk, de uitleg en de actielijst updaten
  gezamenlijk.
- Klik `Optimaliseer terrein` om de gecoördineerde besturingsactie te
  simuleren; `Toon uitgangssituatie opnieuw` zet het scenario terug naar
  de uitgangssituatie zodat de demo herhaald kan worden voor de
  volgende bezoeker.
- `Beperkte beweging` in de header schakelt alle animatie uit
  (dash-flow op de diagramlijnen, transities op de importbalk). Dit
  volgt ook automatisch `prefers-reduced-motion: reduce` van het
  besturingssysteem.

## Bestanden

- `index.html` — de volledige demo: opgemaakte HTML, ingebedde CSS en
  browser-JavaScript. Dit is het enige bestand dat nodig is om de demo
  te draaien.
- `logic.js` — dezelfde besturingslogica (scenariodata, `netImport`/
  `status`-berekening, UI-state reducer) als losstaande CommonJS-module,
  puur om browserless getest te kunnen worden met Node's ingebouwde
  testrunner. De code in `index.html` is een letterlijke kopie hiervan
  (geverifieerd gelijk), niet een `<script src>`-verwijzing, zodat
  `index.html` zelfstandig blijft werken zonder een tweede bestand te
  hoeven laden.
- `logic.test.js` — de bijbehorende testsuite.
- `BRIEF.md`, `DESIGN_REVIEW.md`, `LOGIC_PLAN.md` — het spec-traject
  waaruit deze implementatie is gebouwd (opdracht, ontwerpbesluiten,
  besturingslogica-contract).

## Tests

```
node --test
```

Draait `logic.test.js` tegen `logic.js` met Node's ingebouwde
`node:test` + `node:assert/strict` — geen browser, geen extra
dependencies. Dit bestand is geschreven vóór `logic.js` bestond
(test-first): de eerste run faalde met `MODULE_NOT_FOUND`, waarna
`logic.js` is geïmplementeerd tot alle 14 tests slaagden.

De tests dekken: de netto-importberekening per scenario, de
importlimiet-invarianten (de geoptimaliseerde staat overschrijdt nooit
de limiet; alleen de Netcongestie-baseline doet dat wél), dat de
essentiële gebouwlast nooit een stuurvariabele is, de
`gepauzeerd`-versus-`later`-onderscheiding bij 0 kW, determinisme
(geen tijd/randomness-afhankelijkheid), de `getScenario`-foutcontractie,
en de UI-state reducer (`SELECT_SCENARIO` / `OPTIMIZE` / `RESET`).

Reduced-motion-gedrag, animatietiming, CSS/layout en
touch-targetgrootte zijn bewust buiten deze testsuite gehouden — dat
zijn visuele/DOM-aangelegenheden die geen browserless Node-test
zinvol kan dekken.
