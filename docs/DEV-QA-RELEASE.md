# Palkka PWA: kehitys, QA ja julkaisu

Toteutustehtävä 11.10.2026. Tämä ohje ei ole QA-hyväksyntä.

## Varmennettu lähtötilanne

- Repo `naatti21/Palkan-laskenta`, oletushaara `main`.
- Lähtöcommit `607a74a7334ce7130cb1261c009c08056c9e3b6d`.
- [Quality gate 38123837700](https://github.com/naatti21/Palkan-laskenta/actions/runs/38123837700): success.
- [Palkka Pages 38123892381](https://github.com/naatti21/Palkan-laskenta/actions/runs/38123892381): success, myös deploy-job success.
- Julkaistun index.html:n, styles.css:n, app.js:n, parser.js:n, model.js:n, storage.js:n, learning.js:n, pdf-reader.js:n, manifest.webmanifestin, sw.js:n ja molempien PNG-kuvakkeiden tavut vastasivat lähtöcommittia.
- Quality gate: push main (nyt kehityshaaraan ehdotettu myös develop), kaikki pull_request-tapahtumat ja workflow_dispatch. Node 22, Node-testit `tests/*.test.mjs`, Playwright `tests/e2e`.
- pages.yml: workflow_run Quality gate completed sekä workflow_dispatch. Automaattinen resolve/deploy edellyttää success + head_branch main. Manuaalinen ajo valitsee viimeisen onnistuneen main-Quality gaten SHA:n. Tätä työnkulkua ei muutettu eikä käynnistetty käsin.
- IndexedDB `palkka-pwa`, versio 1, stores `payslips` ja `settings`; legacy-localStorage `palkka-pwa-proto:v1`. Ei muutoksia tunnisteisiin, skeemaan tai migraatioihin.
- Tuotannon cache-prefix `palkka-pwa-v`, nykyinen cache `palkka-pwa-v16`. Aktivointi poistaa vain saman prefixin vanhoja cacheja. Fetch-handler käsittelee kaikki sen hallitsemien sivujen GET-pyynnöt; se ei erikseen rajoita URL-polkuja. Stagingin eri origin on tästäkin syystä pakollinen.
- Tuotannon manifest id/start_url/scope `./`, standalone, 192/512 PNG. app.js rekisteröi `./sw.js` ja käsittelee beforeinstallprompt-tapahtuman. Näitä lähdetiedostoja ei muutettu.
- Rulesets GET palautti `[]`. Branch protection GET palautti 403 Resource not accessible by integration. Suojausta ei voida todeta puuttuvaksi tämän virheen perusteella. Hallinta-asetuksia ei muutettu.

## Haaramalli ja vastuut

`develop → draft PR mainiin → erillisen istunnon riippumaton QA → käyttäjän päätös → main`.
Tehtävähaarat erotetaan developista. Toteuttaja saa testata ja korjata omaa toteutustaan, mutta ei hyväksyä sitä. QA kirjaa tarkastetun täyden SHA:n, alkuperäiset vaatimukset, vastatestit ja löydökset. Käyttäjä päättää tuotantoon viennistä. Uusi koodimuutos mitätöi vanhaan SHA:han annetun QA-arvion soveltuvuuden uuteen muutokseen.

Develop-push ei täytä nykyisen tuotantojulkaisun main-ehtoa. GitHub voi silti näyttää Palkka Pages -workflow_run-ajon, jonka jobit ovat skipped: tämä ei ole deploy. Nykyinen workflow_run kuuntelee myös PR-ajoja; käytä tehtävähaaroille nimiä, jotka eivät ole main, eikä PR:ää haarasta main. Tuotannon julkaisutavan tiukentaminen tai hallinta-asetukset eivät kuulu tähän muutokseen.

## Staging: valmisteltu, ulkoinen julkaisu avoin

Cloudflare-yhteyttä tai Cloudflare-hallintatyökalua ei ollut käytettävissä tässä työajossa. Uutta tiliä, yhteyttä, projektia tai GitHub App -valtuutusta ei luotu. Puhelimella avattavaa julkista staging-osoitetta ei siis vielä ole.

Konkreettinen kytkentäehdotus käyttäjän erikseen hyväksyttäväksi:

1. Uusi maksuton Cloudflare Pages -projekti, ehdotettu nimi `palkka-staging` (saatavuus tarkistamatta).
2. GitHub-integraatiolle vain `naatti21/Palkan-laskenta`; ei muita repoja tai DNS-muutoksia.
3. Projektin **Production branch = develop**. Tämä tarkoittaa Cloudflaren staging-projektin vakaata haaraa, ei Palkka-tuotantoa. Preview-branch-julkaisut pois.
4. Framework none, root repojuuri, Node 22, build `npm ci && npx playwright install --with-deps chromium && npm test && npm run build:staging`, output `_staging`.
5. `STAGING_ORIGIN` = palvelun todellinen `https://<projektinimi>.pages.dev` ilman loppukauttaviivaa. Build hylkää puuttuvan originin, tuotanto-originin ja Cloudflaressa muun kuin develop-haaran.
6. Varmista ensimmäisen julkaisun build-info.json:n commit ja origin, näkyvä TESTIVERSIO sekä CI- ja Cloudflare-testilokit. Cloudflaren Chromium-asennuksen toimivuus on tarkistamatta; jos se ei toimi, julkaisu epäonnistuu eikä testejä saa ohittaa. Vaihtoehto jatkosuunnitteluun: onnistuneen CI:n artefaktin erillinen julkaisu rajatulla tokenilla, vain erillisellä hyväksynnällä.

Testien build luo paikallisen `_staging`-koosteen ensin. Viimeinen `npm run build:staging` korvaa sen oikeaan STAGING_ORIGIN-osoitteeseen sidotulla koosteella. Raakaa repojuurta ei julkaista stagingina.

Kooste kopioi nykyisen sovelluskoodin ja paikallisen PDF.js:n, lisää bannerin, nimeää manifestin testiversioksi sekä lisää käynnistyksen origin-ehdon. Cache-prefix on vain koosteessa `palkka-staging-v`, versio määräytyy sisällön hashista. Tuotannon tiedostot pysyvät ennallaan. Staging ei saa samaa originia tuotannon eikä minkään toisen käyttäjän sovelluksen kanssa. Origin-ehto on vahinkojen lisäesto, ei palvelimen käyttöoikeusjärjestelmä.

## Testit ja eristys

```
npm ci
npx playwright install --with-deps chromium
npm test
```

`npm test` ajaa Node-korpuksen, aiemman Playwright-korpuksen ja uuden staging-korpuksen. `npm run test:staging` käyttää puhtaan testiselaimen kolmea paikallista porttia: 4174 tuotantokoodin simulaattori, 4175 sallittu staging, 4176 väärän originin vastatesti. Testit eivät avaa oikeaa tuotantoa. Sama selainkonteksti, eri originit; tarkistetaan oikeat tuodut tietueet sekä saman nimiset IDB-asetukset, localStorage-avaimet ja cachet. Päivitystesti muuttaa vain generoituvaa sw.js:ää ja palauttaa sen finally-lohkossa.

Selaimen same-origin-eristys erottaa varastot myös samoilla DB-nimillä. Skeeman nimeäminen uudelleen ei ole tarpeen eikä tässä sallittua. Selainharnessin tulos ei vielä todista lopullisen Cloudflare-osoitteen asetuksia. QA varmentaa ne erikseen.

CI säilyttää stagingin JSON-raakatuloksen `staging-results`-artefaktina sekä epäonnistumisen kuvakaappaukset/tracet. GitHub-jobien täydet lokit saa Actions-näkymästä. Testit käyttävät synteettisiä tietoja; oikeita palkkalaskelmia tai backuppeja ei saa lisätä repoihin, lokeihin tai artefakteihin.

## Tuotannon portit: ehdotus, ei asetettu suojaus

Käyttäjän erillisen hyväksynnän jälkeen main-haaralle voidaan ehdottaa pakollista PR:ää, pakollisia `logic-tests`- ja `browser-tests`-tarkistuksia, tuoreiden muutosten uudelleenarviointia ja force push / delete -estoa. QA:n erillinen istunto ei automaattisesti vastaa GitHubin erillistä reviewer-identiteettiä. Jos sama tili luo PR:n ja kirjaa QA:n, vaadittua itsenäistä reviewer-hyväksyntää ei voi esittää toteutuneeksi. PR-ohje tai checklist ei pakota mitään.

Tuotantoympäristön `github-pages` required reviewer -asetuksella voidaan ehdottaa käyttäjän hyväksyntää deploylle. Julkisen repon ympäristöhyväksynnät ovat GitHubin dokumentaation mukaan käytettävissä. Tarkista tilin todellinen tuki, ohitusmahdollisuudet ja se, että käyttäjä voi hyväksyä agentin käynnistämän ajon; prevent self-review voi samalla tilillä estää tämän. Ei muutoksia asetuksiin tässä ajossa.

Nykyinen CI→Pages-portti ei yksin pakota riippumatonta QA:ta tai käyttäjän hyväksyntää. Mainiin ei saa yhdistää tätä PR:ää ennen erillistä päätöstä.

## Palautuminen ja mobiilitestaus

Jos staging ei toimi, lopeta sen käyttö; tuotanto pysyy lähtöosoitteessaan. Älä poista selaimen tietoja tai tuotantoasennusta. Cloudflare-kytkennän jälkeen pysäytä vain staging-projektin automaattijulkaisu tai palauta sen edellinen QA:ssa yksilöity toimiva deploy käyttäjän päätöksellä. Palautus ei tarvitse IDB-/localStorage-/cache-tyhjennystä. Kehityskoodin peruminen tehdään revert-commitilla developiin, ei mainin resetillä. Tuotannon palautus on erillinen käyttäjän hyväksymä toimi, ei tämän tehtävän automaattinen jatko.

Puhelintestaus vasta oikean staging-originin ja testitulosten varmennuksen jälkeen: avaa testiosoite, tarkista TESTIVERSIO ja asennusnimen TESTI, käytä synteettistä PDF:ää, avaa Historia, käynnistä uudelleen offline-tilassa ja tarkista historia, tuo toinen synteettinen PDF offline, palauta verkko ja testaa seuraava staging-päivitys. Tarkista erikseen tuotannon aiemman historian säilyminen lukemalla, älä tuo testitietoja tuotantoon. Androidin todellinen asennus/päivitys tässä työssä testaamatta.

## Lähteet asetusehdotuksille

- https://developers.cloudflare.com/pages/configuration/git-integration/
- https://developers.cloudflare.com/pages/configuration/build-configuration/
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
