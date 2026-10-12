# Toteuttajan testihavainnot — ei QA-hyväksyntä

Toteutuscommit: [`f7786cac443f915a01dc6bb0923352ca65a9358e`](https://github.com/naatti21/Palkan-laskenta/commit/f7786cac443f915a01dc6bb0923352ca65a9358e).
Kiinteä toteutusdiff: https://github.com/naatti21/Palkan-laskenta/compare/607a74a7334ce7130cb1261c009c08056c9e3b6d...f7786cac443f915a01dc6bb0923352ca65a9358e
Draft PR: https://github.com/naatti21/Palkan-laskenta/pull/1 — ei yhdistetty.

## GitHub Actions

[Develop-push Quality gate 38131797498](https://github.com/naatti21/Palkan-laskenta/actions/runs/38131797498): completed/success samalle toteutus-SHA:lle.

| Suoritus | Raakalokin tulos |
|---|---|
| Node, `node --test tests/*.test.mjs` | tests 70, pass 70, fail 0 |
| Aiemmat Playwright-testit, `npm run test:e2e` | 25 passed |
| Staging, `npm run test:staging` | 4 passed |

Raakalokit: [logic](ci-38131797498-logic.txt), [browser ja staging](ci-38131797498-browser.txt). Lokit sisältävät myös asennuksen ja runnerin vaiheet. Node 22 / Chromium Playwright 1.57.0:n asennuksesta. Staging käytti paikallisia origineja 127.0.0.1:4174–4176, ei oikeaa tuotantoa tai Cloudflarea.

Stagingin JSON-artefakti: [staging-results](https://github.com/naatti21/Palkan-laskenta/actions/runs/38131797498/artifacts/11699591334), 1642 tavua. Actions-artefakti vanhenee 14 päivässä; täydet jobilokit on siksi säilytetty myös tässä repossa. Riippumaton QA voi tuottaa oman JSON-tuloksen samalla komennolla.

[PR Quality gate 38131824207](https://github.com/naatti21/Palkan-laskenta/actions/runs/38131824207) oli completed/success samalle toteutus-SHA:lle. Push- ja PR-ajot ovat erillisiä.

[Pages 38131857463](https://github.com/naatti21/Palkan-laskenta/actions/runs/38131857463): completed/skipped. Sekä resolve-green-ref että deploy olivat skipped. Developin onnistunut CI ei tässä havainnossa julkaissut tuotantoa. Workflow-runin metadata näyttää mainin lähtö-SHA:n, koska Pages-workflow luetaan oletushaarasta; tämä ei ole todiste deployn suorittamisesta.

## Paikallinen ympäristö

Node v24.19.0, npm 11.9.0. Node 70/70 ja build exit 0; Chromiumin lataus HTTP 400, joten paikalliset Playwright-testit eivät käynnistyneet. Paikalliset raakalokit ovat samassa evidence-hakemistossa. CI-tulos ei muuta paikallisen ajon epäonnistunutta tilaa.

## Lopullisen dokumentointicommitin tarkistus

Tämä tiedosto ja CI-lokit lisätään toteutuscommitin jälkeisessä dokumentointicommitissa. Ne eivät muuta runtimea, staging-toteutusta tai testejä. Viimeinen head-SHA, sen CI-ajot ja mainin lopputarkistus kirjataan PR-kuvaukseen; näin ei luoda loputonta vain oman SHA:n dokumentointiin tarkoitettua commit-sarjaa. QA lukitsee myös tämän viimeisen headin, eikä rajoita tarkastusta ensimmäiseen committiin.

## Ratkaisematta

Ulkoinen staging-osoite/Cloudflare-valtuutus, Cloudflaren build-komennon todellinen suoritus, Androidin asennus ja päivitys sekä mainin pakotetut QA- ja käyttäjähyväksynnät ovat avoimia. Mainin branch protection GET 403; asetuksia ei muutettu. Work ei ole antanut toteutukselle QA-hyväksyntää.
