# Palkka: Vuosisuunnittelija LAB v0.1

**Tila:** erillinen käyttäjätestattava offline-HTML. Ei integroitu Palkka PWA:n reitteihin, tallennukseen, parseriin, Service Workeriin tai julkaisuihin.

## Kokeile
Avaa `experiments/year-planner/index.html` selaimessa. Se on **yksi itsenäinen HTML-tiedosto**: CSS, laskentamalli ja toimiva käyttöliittymä ovat mukana, eikä se tarvitse palvelinta, kirjastoja, PDF:iä tai verkkoyhteyttä. Puhelimeen ladatun tiedoston voi avata paikallisesti. GitHubin *Code*-näkymä ei suorita HTML:ää eikä ole sama asia kuin julkaistu Beta-osoite.

## Tutkittavat päätökset
- 0–52 työviikonloppua; lauantain ja sunnuntain tunnit erikseen (kaikille viikonlopuille sama jakauma tässä versiossa)
- vuotuinen peruspalkka, lomaraha, erillinen bonus, muu veronalainen erä; palkankorotuksen prosentti ja aloituskuukausi
- kaksi vapaasti muutettavaa tulorajaa, kummallekin oma vahvistettavaksi tarkoitettu perus-/lisäprosentti, sekä muut palkkavähennykset
- bruttovuoden 0–52-viikonloppukäyrä, arvioitu tulorajan ylittävä ensimmäinen viikonloppu, **seuraavan viikonlopun lisänetto** molemmilla verokorteilla, vapaat viikonloput
- samat työviikonloput ja brutto molemmille verokorteille; näytä vain ennakonpidätyksen mukaista nettorahaa, **ei** väitettä eri lopullisesta vuosiverosta

## Tietojen luottamusrajat
Kaikki HTML:n lähtöarvot ovat **synteettisiä demo-oletuksia**. Sivu ei lue Palkka PWA:n IndexedDB:tä tai varmuuskopioita, lataa palkka-PDF:iä, kirjoita paikallistallennukseen eikä lähetä syötettyjä tietoja verkkoon. Ei käyttäjäkohtaista palkkadataa GitHubissa.

Mallin **rajan ylitys** on koko vuoden bruttoarvioon perustuva työviikonloppujen määrä, **ei ennustettu kalenterin maksupäivä**. Viikonloppubruttopalkka skaalataan lineaarisesti 16 tunnin vertailuarvosta. Korotus jaetaan tasaisesti kuukausille alkaen valitusta kuukaudesta ja se koskee mallissa vain peruspalkkaa. Ei päiväkohtaista TES-laskentaa, korotuksen kohdistusta maksupäiviin, työaikapankkia, mahdollista lopullisen veron laskentaa eikä tietoa OmaVeron laskemasta prosentista. Kokeile suhteita ja tarkista lopulliset luvut eri lähteistä.

## Testinäyttö
- `node --test tests/year-planner.test.mjs`: 10 synteettistä logiikan vastatestiä uudelle tiedostolle (julkaistun SHA:n CI tarkistettava erikseen).
- Kehittäjän paikallinen Chromium-mobiilikoe (390 px): ensirenderöinti, 0/52/13 vaihtaminen, tuntilaskenta, bonuksen vaikutus, kuvaajien olemassaolo, vaakasuuntainen ylivuoto ja virheprosentin pysäytys **PASS**.
- **Ei riippumaton QA**; ei PDF-tuontiin liittyvä turvallisuushyväksyntä.

Liittyy tuotesuuntatehtävään #16. Palkka PR #15:n riippumaton PDF-P0-06 NO-GO jatkuu. Ei muutosta `main`/`develop`/`release/beta-preview-v1`-haaroihin, stagingiin, käyttäjän asennettuun Betaan tai tuotantoon tämän Draftin perusteella. Julkaisu tai integraatio vaatii erillisen käyttäjäpäätöksen.

## LAB v0.2 — palkkahistorian ehdotukset

- Käyttäjä valitsee itse `Palkka PWA` -varmuuskopion (JSON, skeema 2 / tietueversio 1). Tiedosto luetaan selaimessa muistiin; ei verkkopyyntöjä, paikallistallennusta, PDF-tiedostoja tai automaattista tuontia muihin sovelluksiin.
- `payDate` valitsee edellisen palkkavuoden 2026, jos tietoja on. `ytdTaxableIncome` käsitellään viimeisen laskelman tilannekuvana eikä lasketa yhteen.
- Koodit 55201/55301 (lomaraha), 40000 (APP) ja 40070 (muu erä) tuottavat **havaittujen palkkarivien** summat. Ristiriitainen saman maksutapahtuman tuplatuonti pysäytetään; ilman palkkarivejä ei väitetä 0 €:n kertymää.
- 2027 perusansio **ei ole todistettu ylityötön ansio**. Ehdotus saadaan viimeisimpien palkkiotyön ja tuotantolisän tuntihintojen mediaanista oletuksella 80 tavallista tuntia / 2 viikon jakso, 26 jaksoa vuodessa, sekä tyypillisistä iltalisistä. Ei loman, pankin, arkipyhien, muiden vuorolisien tai satunnaisten poissaolojen täydellistä mallinnusta.
- 16 tunnin viikonlopun bruttoehdotus käyttää tunnistettuja tuntihintoja ja **oletettuja** 50/100 %, sunnuntai- sekä viikkovapaakorvauksia; TES- ja paikalliset ehdot voivat poiketa. Käyttäjä voi korjata molemmat luvut.
- Historian APP **ei siirry automaattisesti** ensi vuoteen. Käyttäjä valitsee erikseen sisällytetäänkö se arvioon.
- Menneen vuoden ennakonpidätysprosentit näytetään vain lähdetietona, **ei 2027 OmaVero-prosentteina**. Molempien uusien verokorttien prosentit ja vuositulorajat täytetään käyttäjän saamien arvojen mukaan.
- UI: harvemmin tarvittavat ansioiden erät/korotuksen ajankohta piilotetaan avattaviin lisäasetuksiin. Kaikki luvut jäävät edelleen muokattaviksi.
- **Testattu** synteettisellä varmuuskopiolla Node 8/8 ja Chromium 390px: paikallistuonti, ehdotusten hyväksyntä, bonusvalinta, 52 viikonlopun päivitys, konsolivirheet 0, vaakaylivuoto 0. GitHub CI:n tulos tarkistetaan erikseen. Tämä ei ole riippumaton QA.

**EI käytetä palkkalaskelmien henkilötietoja, todellisia summaarvoja tai autenttisia varmuuskopioita julkisissa testifixtureissä.**