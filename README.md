# GCSC — Bouw je eigen industrieterrein

Een zelfstandige, Nederlandstalige beursdemo voor de GCSC-propositie rond lokale energie- en warmtesturing op bedrijventerreinen.

## Openen

Open `index.html` rechtstreeks in een recente browser. Er is geen server, buildstap of externe dependency nodig.

## Bezoekersflow

1. Kies in het assetmenu een lokale asset.
2. Sleep hem naar het bijpassende vak op het terrein, of klik/tik eerst de asset en daarna het lege vak. Met toetsenbord: selecteer met `Enter` en plaats met `Enter` op een vak.
3. Bouw met zonnepanelen, batterij, maximaal drie laadpunten, warmtepomp en warmtebuffer.
4. Kies `Zonpiek`, `Avondpiek` of `Netcongestie`.
5. Klik **Optimaliseer mijn terrein** en vergelijk de lokale regelactie met de uitgangssituatie.

De geplaatste assets veranderen de gesimuleerde netimport en regelacties. De warmtebuffer en warmtepomp maken thermische flexibiliteit achter de meter zichtbaar. Alle waarden zijn illustratieve demo-scenario’s, geen voorspelling voor een specifiek terrein.

## Verificatie

```sh
node --test
node /tmp/check_flex_demo.js
```

- `logic.test.js` bevat 31 browserloze tests voor de scenario- en assetlogica.
- `check_flex_demo.js` controleert de syntaxis van de ingebedde JavaScript en de essentiële demo-elementen.
