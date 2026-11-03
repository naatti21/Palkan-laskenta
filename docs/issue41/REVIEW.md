# Issue #41 — riippumaton vastatestaus ja rajatut korjaukset

Lähtö: PR #40 HEAD `c3cd97bf7fbee2f5faa99793faf2a494591bfd49`, varmennettu `refs/pull/40/head`-viitteestä. Oma haara `qa/issue41-adversarial-review`; kohde `fix/beta-pay-event-safety-20261102`. Alkuperäisiä haaroja, testejä tai julkaisuasetuksia ei muutettu. Kaikki testidata on synteettistä.

## Todistetut löydökset

| Tunnus | Vakavuus ja juurisyy | Vastatesti ja korjaus |
| --- | --- | --- |
| R41-01 | P1: palautus tarkisti vain saapuvan graafin. Saapuva arkistorivi voi sulkea syklin paikallisten arkistorivien kautta. Viallinen historia tallentui ja sen myöhempi palautus voi estyä. | A←B←C paikallisena, saapuva A→B. Lopullisen yhdistelmägraafin syklitarkistus keskeyttää saman IDB-transaktion; kaikki rivit ja aktiivinen C säilyvät. |
| R41-02 | P1: kaksi `confirmed-distinct`-lippua ohitti maksujen päällekkäisyystarkistuksen ilman parikohtaista päätöstä. Kaksi samaa palkkaa sisältyi laskentaan varmasti. | `projectPayroll` ja vuosianalyysi: kaksi epäselvää havaintoa, netto `null`. Automaattinen lippupoikkeus poistettu; todellinen `distinctFrom`-päätös toimii edelleen. |
| R41-03 | P1: dialogin vertailu käytti taloudellista sisältöä ja `distinctFrom`-listaa, ei tapahtumaidentiteettiä tai muuttunutta versiosuhdetta. | Sama sisältö mutta uusi `supersedes`: vanha dialogi hylätään ilman kirjoitusta. Vertailuun lisätty `payEventId`, `resolution`, `supersedes`. |
| R41-04 | P2: `mergeManyRecords` normalisoi mutta ei validoinut numeroita. Suora rajapinta hyväksyi NaN-neton; UI:n `parseBackup` jo torjui sen. | Palautusraja käyttää samaa arvo-/päivä-/rivivalidointia ennen transaktion avaamista. Koko erä hylätään, vanhat rivit ennallaan. |
| R41-08 | P1: service worker korvasi toimivan shell-välimuistin HTTP 503 -vastauksella. Offline palautti virhesivun. | Oikeaa worker-koodia ajava VM-vastatesti, 503→offline. Vain `response.ok`-vastaukset tallennetaan; välimuistikirjoituksen virhe ei muuta onnistunutta verkkovastausta. |

Ensimmäinen R41-01-koe sisälsi vahingossa koko syklin saapuvassa erässä ja läpäisi vanhan koodin. Se poistettiin valepositiivisena ja korvattiin paikallisen historian kautta kulkevalla tapauksella. Lopullinen tiedosto ajettiin uudelleen PR #40:n muuttamattomilla lähdetiedostoilla erillisessä väliaikaiskansiossa: **4 FAIL / 3 PASS**. Worker-kokeen lähtötulos **1 FAIL**. Punaiset lokit säilyvät tässä hakemistossa. Korjattujen 8 uuden Node-tapauksen tulos on **8 PASS / 0 FAIL**.

## Rivitasoinen tarkastuskartta

- `model.js:68–117`: backup-arvovalidointi; `273–297`: SHA, maksupäällekkäisyys ja erottelupäätös; `423–504`: sisältövertailu ja korjausten säilyminen; `506–606`: legacy-normalisointi, JSON v2/v3; `624–650`: näkyvien versioiden projektio. Sisältövertailu ei tarkoituksellisesti yksin todista historiapäätöksen muuttumattomuutta.
- `storage.js:36–59`: IDB v1→v2 ja versionchange; `81–96`: saman transaktion lukittu lue/päätä/kirjoita; `104–145`: stale snapshot ja immuuttinen korvaus; `146–191`: SHA-uusintatuonti sekä erillisen maksun paripäätös; `193–260`: palautus-ID-kolarit ja historiagraafi. Laskenta tapahtuu vain vahvistetusta projektiosta.
- `analytics.js:44–105`: aktiiviset/epäselvät havainnot, kuukausien kattavuus, viimeisin YTD, saman päivän tilannekuvan epävarmuus. YTD:tä ei summata. `taxcard-forecast.js:46–109`: sama kortti, katkeava havaintojakso, vanheneminen ja saman päivän epävarmuus.
- `scenario-model.js:69–89`: verokortin rajaa ei johdeta koko vuoden YTD:stä; epäselvät havainnot estävät oletukset. `experiments/year-planner/index.html:195–215`: sama projektio ja viimeisimmän vuoden valinta. Alkuperäisen testisopimuksen erottelulippuongelma näkyy myös täällä.
- `app.js:1211–1232`: kaksoisnapautuksen lukitus; `1284–1319`: korvaus-/erottelutoimet käyttävät snapshotia; `1370–1389`: palkkarivien ja opittujen profiilien palautus on **kahdessa** operaatioketjussa. Niiden yhteistä all-or-nothing-takuuta ei ole toteutettu tässä korjauksessa.
- `sw.js:23–34`: virhevastauksen cache-myrkytys korjattu. Täysin atomista vanhan/uuden JavaScript-sukupolven vaihtoa tämä ei toteuta. Staging-/beta-buildit versioivat cachen sisältöhashilla; tuotannon cache-versio 18 ei muutu tässä julkaisemattomassa QA-haarassa. Mahdollisessa tulevassa julkaisussa versionvaihto on tarkistettava erikseen.
- `parser.js:226–227, 276–318, 600–634`, `pdf-reader.js`, `learning.js`: parserin lähdetekstit ovat pääosin kiinteitä kenttäkuvauksia; alkuperäinen PDF/tekstihavainto käsitellään selaimessa. Tallenteen allowlist poistaa ylimääräiset root-kentät. **Vapaamuotoiset palkkarivien label-, notices- ja metadata-merkkijonot eivät silti ole yleinen henkilötietojen tunnistin.** Mielivaltaisen tuonti-JSONin anonymiteettiä ei väitetä todistetuksi.

## Kattavuus ja rajat

- Alkuperäisen SHA:n uusintatuonti manuaalisen YTD:n ja kolmen korvausversion jälkeen sekä palautus eri järjestyksessä: uusi R41-06 PASS. Eri SHA + samat näkyvät luvut: R41-07 PASS, vaatii tarkistuksen.
- Samat summat, nollanetto, negatiivinen takaisinperintä, branching, legacy-ID-kolarit, vuoden vaihde, verokortin vaihto ja osittaiset kuukausitiedot: olemassa olevat testit säilytetty. Koko sarjan kolme erottelulippuun perustuvaa poikkeusta alla; muita Node-regressioita ei havaittu.
- Transaktion abort ja osittaisen erän hylkäys: uudet Node-testit. Kaksi **oikeaa Chromium-välilehteä** tuovat saman SHA:n rinnakkain: yksi maksu. Chromiumissa paikallisen historian kautta sulkeutuva sykli hylätään ja aiempi aktiivinen palkka säilyy reloadin yli: uusi selainkoe.
- Parseri/oppiminen: olemassa olevat Node- ja Playwright-fixturet ajettiin. Ei käyttäjän oikeita dokumentteja. Erillistä oikeasta PDF:stä uudelleen vietyä metadata-varianttia tai Androidin PDF-lukijaa ei testattu.
- Fyysinen Android, IDB-levyn quota/power-loss, todellinen kahden laiteversion offline-migraatio ja vanhan/uuden workerin JS-sekoitus: **NOT RUN / ei täydellistä takuuta**.

## Avoin testisopimus — ei vihreäksi naamiointia

Alkuperäinen Node-sarja lähtöcommitissa: **230 PASS / 0 FAIL**. Lopullinen sarja: **235 PASS / 3 FAIL / 0 SKIP**, yhteensä 238 testiä.

Muuttamattomat epäonnistuvat testit:

1. `pay-event-red-green-matrix.test.mjs`: `explicitly confirmed same-period payments on different dates are independent`.
2. Sama tiedosto: `RED E21: two explicitly confirmed separate payments with the same period must count twice`.
3. `year-planner-universal.test.mjs`: `confirmed separate same-day payments never select arbitrary YTD`.

Näiden fixturejen erottelu perustuu vain `resolution:confirmed-distinct`-lippuihin, ei tietueparin `distinctFrom`-päätökseen. Niiden salliminen tekisi R41-02-vastatestistä jälleen punaisen. Testejä ei muutettu, merkitty odotetuiksi virheiksi eikä ohitettu. Vanha pelkkään lippuun perustuva backup jää nyt konservatiivisesti käyttäjän ratkaistavaksi; dataa ei poisteta. Vanhan sopimuksen hallittu migraatio tai testifixturejen siirtymä oikeaan tallennettuun paripäätökseen vaatii riippumattoman katselmoinnin.

**NO-GO seuraavaan mobiilitestijulkaisuun.** Tämä on tarkistettava korjausehdotus, ei hyväksytty julkaisu. Erityisesti kolme vanhaa turvallisuustestiä sekä yllä olevat palautuksen atomisuus-/PWA-kattavuusrajat estävät vihreän kokonaisarvion. CI:n tulosta tai Draft PR:n olemassaoloa ei oleteta paikallisista testeistä.

## Selain- ja build-todennus

Lopullinen työpuu: **37/37 E2E** (35 aiempaa + 2 uutta), **51/51 Beta**, **4/4 staging**, ei skippejä eikä retry/flaky-tuloksia. PDF.js-valmistelu sekä paikallisiin erillisiin origineihin lukitut staging- ja beta-buildit PASS. Origin-turvaporttien Node-testit PASS osana 238 testin sarjaa. Buildien generoituja hakemistoja ei julkaistu tai lisätty Gitiin.

Node 24.19.0, Playwright 1.57.0, järjestelmän Chromium **154.0.8037.57**. Playwrightin Chromium 143:n lataus palveluista cdn.playwright.dev ja playwright.download.prss.microsoft.com estyi **HTTP 403 Domain forbidden**. Paikallinen ajo käytti `/tmp`-konfiguraatiota: repon alkuperäisen configin import, samat testit/assertiot/retries/serviceWorker-asetukset, `testDir` ja webServer.cwd absoluuttisina, `use.launchOptions.executablePath='/usr/bin/chromium'`, `args=['--no-sandbox']`, 2 workeriä. CI:n pinnaamalla selainversiolla ajo **NOT RUN**. Konfiguraatiotiedostoja tai riippuvuuslukkoa ei muutettu tämän ympäristöeron vuoksi.

Toistokomentoja repon juuresta (CI:n normaalilla Chromium-asennuksella):

```sh
npm ci --no-audit --no-fund
node --test tests/issue41-adversarial.test.mjs tests/issue41-service-worker.test.mjs
node --test tests/*.test.mjs # 3 tunnettua virhettä, todellinen exit 1
npm run test:e2e
npm run test:staging
npm run test:beta
```

`npm test` pysähtyy tarkoituksella Node-virheisiin; selainosiot ajettiin erikseen, ei piilotettu kokonaiskomennon virheitä. Nykyinen `quality.yml` sisältää erilliset logiikka-/selainjobit PR:ille. Sitä tai autodeploy-workflowita ei muutettu. GitHub CI -ajoa ei ole varmennettu.

Rollback: oma additive QA-haara voidaan hylätä tai sen korjauscommit perua; tuotantodataa ei käsitelty. Jos myöhemmin julkaistaisiin tällä haaralla luotuja paripäätöksiä, pelkkä paluu vanhaan laskentakoodiin voisi taas hyväksyä liian laajat erotteluliput. Siksi rollback ei ole peruste julkaista keskeneräistä sopimussiirtymää.
