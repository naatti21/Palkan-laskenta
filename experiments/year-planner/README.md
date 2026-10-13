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