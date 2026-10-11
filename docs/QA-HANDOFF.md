# Riippumattoman QA:n luovutus — Palkka PWA

**Toteutus, ei hyväksyntä. Work ei ole hyväksynyt omaa toteutustaan.**
Riippumaton QA tehdään eri työistunnossa, alkuperäistä toimeksiantoa vasten.

## Tavoite ja rajat

Rakentaa nykyisen tuotannon rinnalle develop-haara, CI ja erillisen originin testiversion tekninen perusta sekä jäljitettävä QA-luovutus. Ei parserin, laskennan, tallennusskeeman tai migraatioiden muutoksia. Ei main-kirjoituksia, mergeä, tuotantojulkaisua, hallinta-asetusten muutoksia tai oikeita palkkatietoja.

## Versiot ja muutokset

Lähtö ja developin haaroitus: `607a74a7334ce7130cb1261c009c08056c9e3b6d`.
Toteutuksen SHA ja CI-linkit täydennetään `docs/evidence/CI-RESULTS.md`-tiedostoon toteutuscommitin jälkeen. Viimeinen dokumentointicommit ei voi sisältää omaa SHA:taan; tarkista PR:n viimeinen head-SHA GitHubista. Arvioi sen koko diff.

[Diff main...develop](https://github.com/naatti21/Palkan-laskenta/compare/main...develop) on liikkuva näkymä; QA lukitsee tarkastettavan SHA:n.

Muutetut/lisätyt tiedostot:

- `.github/workflows/quality.yml`: develop-push, nykyisten testien lisäksi staging-testit ja JSON-artefakti; npm ci.
- `package.json`, `package-lock.json`: staging-komennot ja lukitut riippuvuudet; aiemmat suorat versiot ennallaan.
- `.gitignore`: vain generoidut build-, runtime- ja testituotokset.
- `scripts/build-staging.mjs`: erillinen staattinen kooste, banneri, origin-estot, testimanifesti ja staging-cache.
- `playwright.staging.config.mjs`: eristetyt paikalliset origin-palvelimet, erillinen testihakemisto.
- `tests/staging-build.test.mjs`: turvattomien build-asetusten vastatestit.
- `tests/staging/isolation.spec.mjs`, `tests/staging/pdf-helper.mjs`: synteettiset eristys-, offline-, mobiili- ja päivitystestit.
- `docs/DEV-QA-RELEASE.md`, `docs/QA-HANDOFF.md`, `docs/evidence/*`: ylläpito, havainnot, komennot ja raakanäyttö.

`pages.yml`, aiemmat testit ja sovelluksen juuren runtime-tiedostot jätetty muuttamatta. Staging käyttää niitä kopioimalla, ei sovelluksen näköismallia.

## Staging

Ulkoinen osoite: **ei julkaistu**. Cloudflare-kytkentä puuttuu ja edellyttää käyttäjän erillistä hyväksyntää uudelle projektille/GitHub-valtuutukselle. Täsmälliset asetukset ja testejä ohittamaton build-komento DEV-QA-RELEASE.md:ssä. Lopullisen palvelun origin-eristys, HTTPS ja puhelimen asennus ovat avoimia, eivät paikallisten testien perusteella varmennettuja.

## Suoritetut komennot ja tulokset

- `npm install --no-audit --no-fund`: riippuvuudet asennettu, package-lock luotu.
- `npx playwright install chromium`: epäonnistui paikallisen ympäristön latausvirheeseen (HTTP 400 GatewayExceptionResponse). Raakaloki `evidence/local-browser-install.txt`.
- `npm test`: paikallinen aiempi Node-korpus suoriutui, selaintestien käynnistys epäonnistui puuttuvan Chromiumin vuoksi; staging-vaiheeseen ei päästy. Raakaloki `evidence/local-browser-attempt.txt`. Ei tulkita sovelluksen 25 erilliseksi virheeksi eikä onnistuneeksi selaintestaukseksi.
- `npm run test:logic`: 70 testiä, 70 läpi, 0 hylätty. Mukana 6 uutta build-estojen testiä. Raakaloki `evidence/local-node.tap` (Node:n tekstituloste, ei pakotettu TAP-reporter).
- `STAGING_ORIGIN=http://127.0.0.1:4175 npm run build:staging`: exit 0. Raakaloki `evidence/local-build.txt`; build-info commit kuvaa checkoutin HEADia, paikalliset muutokset eivät olleet silloin commitissa.
- GitHub Actions: ajokohtaiset tiedot ja raakalokit `evidence/CI-RESULTS.md` ja sen linkit täydennetään erikseen. Paikallista epäonnistumista ei peitetä CI-tuloksella.

## Testiluokkien kartta

Alla olevat tiedostot ovat suoritettavaa testiperustaa, eivät väite kaikkien varianttien kattamisesta. Lopulliset ajotulokset ovat erillisessä evidenssissä.

| Vaatimus | Nykyinen näyttö / suoritustapa | QA:n täydennys |
|---|---|---|
| Teksti-PDF | e2e/palkka: oikea PDF-upload; offline | Vastatesti eri PDF-tuottajalla |
| 2 ja 3 rinnakkaista saraketta | qa-regressions: molemmat parseritasolla; e2e/parallel-columns: 3 oikean PDF.js:n läpi | 2 saraketta oikeana PDF:nä vielä erikseen |
| Kauden brutto vs YTD | parser, acceptance, qa-regressions | Sarakejärjestysten vaihtelu |
| Kausi-/vuosiennakonpidätys | parser/qa-regressions-fixturet ja rinnakkaissarakkeet | Tarkista assertionit, älä päättele pelkästä fixturestä |
| Puuttuva/ristiriitainen tieto | qa-regressions, model, e2e/palkka konfliktit | Uudet vastatapaukset |
| Tuntemattomat rivit, vanhat formaatit | parser: unknown-payline, legacy 2024, withholding 2025 | Muita formaatteja ei oleteta kattaviksi |
| Sama PDF / sama kausi eri sisältö | model, acceptance, e2e/palkka | Täysi identtisen PDF:n uusintatuonti + käyttäjäkorjaus yhdessä |
| Käyttäjäkorjauksen säilyminen | model, e2e R2-02 | Uusintatuonnin ja toisen korjauksen yhdistelmä |
| Backup vienti/palautus | model backup, e2e QA-01/R2-01/R3-03 | Käyttöliittymän vienti→palautus tiedostona |
| Puutteellinen/virheellinen backup | model R3-04, e2e R3-05 atominen virhe | Sekoitettu kelvollinen+virheellinen sisältö |
| Datan säilyminen päivityksessä | uusi staging worker -päivitystesti, olemassa oleva reload | Android-asennuksen todellinen vanha→uusi päivitys avoin |
| Manifest ja kuvakkeet | e2e/install; stagingin testinimi ja offline-kuvakkeet | Androidin asennusdialogin kaksi erillistä sovellusta |
| Offline-käynnistys ja historia | e2e/offline, uusi staging-testi | Asennetun sovelluksen kylmäkäynnistys puhelimessa |
| SW-päivitys ja cache-rajaus | e2e/offline vanhat/ulkopuoliset cachet; staging live worker update | Ulkoinen staging-palvelu vielä testaamatta |
| Paikallinen PDF.js | e2e upload/offline ja staging offline-PDF | Tarkista kaikki verkkopyynnöt ja tuotettu kooste |
| Mobiilikäytettävyys | e2e/palkka 360/412, staging navigointi 360/412 | Käyttäjän kosketustestaus ja asennus avoin |
| Origin-eristys | tests/staging: sama selainkonteksti, 4174/4175, oikeat PDF-tietueet ja kaikki kolme varastoa | Toista lopullisilla eri hosteilla synteettisellä datalla |

## Avoimet rajoitukset ja tarkistuskohteet

1. Cloudflare-julkaisua ei ole. Älä hyväksy mobiilissa avattavaa stagingia toteutuneeksi.
2. Branch protectionia ei voitu lukea (403); rulesets-lista tyhjä. Ohjeet eivät ole teknisiä hyväksyntäportteja. Muutokset asetuksiin tarvitsevat käyttäjän erillisen luvan.
3. Paikallinen Chromium puuttuu. QA toistaa testit omassa toimivassa ympäristössään ja tarkistaa CI:n todelliset lokit.
4. Nykyinen pages.yml kuuntelee Quality gate -ajoja; tarkista develop/PR-ajojen deploy-jobien ohittuminen. Nykyisen workflow_dispatchin mahdollisuus ei ole ihmishyväksyntäportti.
5. Origin-tarkistus suojaa vain oikein koostettua stagingia. Pelkän repojuuren julkaisu ohittaa koosteen; Cloudflaren output-asetus pitää tarkistaa.
6. Uusi staging-SW:n cache-hash ja offline-entry pitää vastatestata. Nykyistä sovelluksen fetch-handleria tai tallennusrakennetta ei korjattu/refaktoroitu.
7. Mukana toimitettu QA round2 koski vanhaa SHA:ta `5a67b8c`; sen löydöksiä ei ole tässä työssä itsenäisesti arvioitu korjatuiksi. Nykyinen repo sisältää regressioita, mikä ei yksin ratkaise niitä.
8. Tarkista ettei runtime-, pages.yml-, tuotantoasennus-, main- tai hallinta-asetuksiin tullut muutoksia. Tarkista myös pakettilukon riippuvuudet ja artefaktien henkilötiedottomuus.

## Luovutuksen raja

Tämä on toteuttajan havainto- ja testipaketti. Ei QA PASS -lausumaa, tuotantovalmiuden päätöstä tai lupaa yhdistää. Riippumaton QA voi vahvistaa tai kumota havainnot. Tuotantoon vienti edellyttää käyttäjän päätöstä. Parserin jatkokehitystä ei aloiteta tämän tehtävän perusteella.
