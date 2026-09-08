# GCSC Flex Terrain Demo

Build a self-contained Dutch interactive browser demo for a stand at the Provincie Zuid-Holland event on 22 September 2026.

## Audience
Business-park owners, entrepreneurs, municipalities and partners. They should understand the value in under a minute without needing technical background.

## Core proposition
**GCSC makes bedrijventerreinen flexible without replacing everything.**

GCSC connects existing solar panels, EV charging, batteries, HVAC/heat pumps and thermal storage through one local control layer. It detects available flexibility, predicts demand and generation, and coordinates assets to lower peak demand, reduce costs, and prepare the site for congestion/flexibility services.

## Credible GCSC proof points (internal source material)
- SOMA: retrofit predictive heating control on existing radiators, using weather, occupancy, thermal behavior and dynamic prices.
- Flex Hub: supplier- and brand-independent control of home energy assets, local-first energy data and user-set operating boundaries.
- Suncom / THERMOS: state estimation, prediction and closed-loop optimization for thermal storage and industrial heat.
- Amperapark: opportunity for GCSC to supply embedded/control/protocol interoperability expertise around solar carports, EV charging and batteries.

## Constraints
- Do not claim existing production deployment on business parks.
- Do not invent savings percentages, revenue, customers, standards, or market access.
- State figures as an illustrative live scenario, not real measurements.
- This is a physical-stand demo simulation, not a production EMS.
- Dutch copy, plain language.

## Required demo interaction
A compact visual mini-business-park with:
- PV generation
- grid connection with a visible import limit
- battery
- three EV chargers
- a flexible heating/thermal load
- essential building load

The visitor can choose scenarios:
1. Zonpiek
2. Avondpiek
3. Netcongestie

On each scenario, visibly show the control layer's coordinated actions, grid import versus limit, and plain-language explanation. Include a one-click “optimaliseer terrein” simulation/control action. Add an accessible reduced-motion mode if there is animation.

## Style
This is a **Monitor / demo-console** surface: dense enough to explain a live system, not a marketing landing page. Original, technical and calm. Avoid generic SaaS feature-card layouts, gradients, fake statistics and stock imagery. Use a restrained industrial palette (near-black/navy, warm off-white, one green energy accent, one amber warning).

## Deliverable
A self-contained `index.html` with embedded CSS and JavaScript, plus a README explaining how to open it. No external dependencies. Add a lightweight browserless Node test file that validates core scenario/control logic, and use strict test-first development.
