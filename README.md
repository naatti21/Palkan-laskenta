# Palkka PWA — v0.3.1 testiversio

Tämän version tavoite on tehdä prototyypin pohjasta sellainen, että sitä voidaan testata eri vuosien ja eri PDF-toimittajien oikeilla palkkalaskelmilla ilman että käyttöliittymä muuttuu raskaaksi.

## Mitä v0.3.1 sisältää

- tallennus siirtyy `localStorage`-tallennuksesta IndexedDB:hen
- vanha prototyypin localStorage-historia migroidaan automaattisesti ensimmäisellä käynnistyksellä
- tietueilla on versionumero, jotta tulevat datamigraatiot voidaan tehdä hallitusti
- varma palkkalaskelma tallentuu automaattisesti myös silloin, kun siinä on pelkkä huomautus
- vain oikeasti estävä ristiriita tai puuttuva ydinkenttä pyytää käyttäjän tarkistusta
- muu dokumentti näytetään selvästi "ei palkkalaskelma" -tapauksena eikä neljän tyhjän kentän lomakkeena
- tuleva maksupäivä hyväksytään normaalina vahvistettuna tulevana palkkana
- vanhat palkkalaskelmat järjestetään maksupäivän perusteella oikealle vuodelle
- Historia on omalla välilehdellään ja vuosittain suodatettavissa
- Data-välilehdellä ovat varmuuskopio, palautus, paikallisen datan poisto ja lyhyt tietosuojakuvaus
- JSON-varmuuskopio on versioitu ja sisältää vain rakenteisen datan, ei PDF:ää tai poimittua raakatekstiä
- samaksi palkaksi tunnistettu tuonti yhdistetään eikä siitä tehdä tuplaa
- parseri säilyttää palkkarivejä rakenteisesti: koodi, nimike, määrä, yksikköhinta, summa ja normalisoitu kategoria
- myös tuntematon palkkarivi säilytetään eikä sitä pudoteta pois
- käyttäjän tekemä korjaus säilyttää parserin alkuperäisen arvon rinnalla
- vanha taulukkomainen palkkaerittelyformaatti tunnistetaan omana `legacy-table-fi-v1`-profiilinaan
- vanhat ja nykyiset palkkalajikoodit normalisoidaan samoihin kategorioihin (esim. OT, sunnuntai, viikkovapaa)
- uusi rakenne voidaan vahvistaa käyttäjän korjauksella; sovellus tallentaa vain neutraalit rakennetunnisteet paikallisesti
- aiemmin vahvistettu rakenne voidaan tunnistaa myöhemmin palkkalaskelmaksi, vaikka parseri ei vielä saisi kaikkia arvoja irti
- opitut rakenteet voi nollata erikseen ilman palkkahistorian poistamista
- opitut, tunnisteettomat rakenneprofiilit kulkevat mukana JSON-varmuuskopiossa

## Tietosuojaperiaate

Palkkalaskelma luetaan selaimen muistissa. Pysyvään tietomalliin ei tallenneta palkansaajan nimeä, henkilötunnusta, osoitetta, pankkitiliä tai työnantajan nimeä. Myöskään alkuperäistä PDF:ää, tiedostonimeä tai koko poimittua raakatekstiä ei tallenneta palkkahistoriaan tai varmuuskopioon. Paikallinen oppiminen tallentaa vain ennalta rajattuja neutraaleja rakenneotsikoita, kuten `palkkakausi`, `maksupvm` tai `kauden tiedot`; henkilö-, työnantaja- tai tilitietoja ei käytetä oppimisprofiilin tunnisteena.

Repositorioon ei pidä commitoida oikeita palkkalaskelmia. Oikeista dokumenteista tehdään vain tunnisteettomat testifixturet, jotka sisältävät parserin kannalta tarpeelliset rivit.

## Datarakenne

IndexedDB sisältää kanonisia palkkatietueita. Yksi tietue sisältää:

- maksupäivän ja palkkakauden
- bruton/neton ja kertymät
- verokortin palkkalaskelmalla näkyvät tiedot
- KTA/PP:n ja työaikatiedot, jos ne löytyvät
- rakenteiset palkkarivit
- parseriversion ja kenttien tunnistusmetadatan
- käyttäjän tekemät korjaukset
- normalisoidusta, tunnisteettomasta palkkadatasta lasketun SHA-256-sormenjäljen duplikaattien tunnistukseen

Sormenjälki lasketaan parserin normalisoiduista palkka-arvoista ja palkkariveistä, ei PDF-tiedostosta, tiedostonimestä tai raakatekstistä.

## Varmuuskopio

Data-välilehden **Vie varmuuskopio** luo JSON-tiedoston. **Palauta varmuuskopio** yhdistää tiedot nykyiseen historiaan, välttää samojen palkkojen tuplaamisen ja palauttaa myös tunnisteettomat opitut rakenneprofiilit.

Tässä versiossa varmuuskopio on vielä käyttäjän itse vietävä tiedosto. Arkkitehtuuri on tarkoituksella sellainen, että myöhemmin voidaan lisätä vapaaehtoinen käyttäjän omaan pilveen (esim. Google Driven appData-alueelle) tehtävä varmuuskopio ilman keskitettyä palkkatietokantaa.

## Testaus oikeilla PDF:illä

Seuraava testikierros tehdään pienellä mutta edustavalla korpuksella. Hyvä ensimmäinen aineisto on noin 3–5 PDF:ää jokaista selvästi erilaista toimittajaa tai ulkoasua kohden. Mukaan kannattaa ottaa mahdollisuuksien mukaan normaali palkka, ylityöpainotteinen palkka, loma-/bonusjakso, verokortin vaihdoksen ympäristö ja vuodenvaihde.

Kun uusi PDF-rakenne löytyy, sitä ei kovakoodata uudeksi koko tietomalliksi. Lisätään vain tunnistus-/adapterisääntö, joka tuottaa saman kanonisen palkkadatan.

## Paikallinen ajo

Älä avaa `index.html`:ää suoraan `file://`-osoitteella. Käynnistä esimerkiksi:

```bash
python -m http.server 8080
```

ja avaa:

```text
http://localhost:8080
```

Testit:

```bash
node --test tests/*.test.mjs
```

## GitHub Pages

Repossa oleva `.github/workflows/pages.yml` ajaa parseri- ja tietomallitestit Node 22:lla ennen GitHub Pages -julkaisua.

## Tunnetut rajat

- PDF:ssä pitää vielä olla tekstikerros; OCR:ää ei ole
- PDF.js ladataan edelleen cdnjs-palvelusta, joten täysin ensimmäinen käyttö ei ole täysin offline
- palkkarivien automaattinen kategorisointi on tarkoituksella varovainen; tunnistamaton rivi säilytetään kategoriassa `unknown`
- paikallinen oppiminen tunnistaa rakenteen, mutta ei vielä rakenna täysin uusia kenttäpoimintasääntöjä itsenäisesti; epävarmat arvot kysytään edelleen käyttäjältä
- palkkapäiväennusteita tai pyhäpäiväsiirtojen ennustemoottoria ei vielä generoida; oikean palkkalaskelman ilmoittama maksupäivä on lähdetotuus
- Google Drive -autobackup ei ole vielä tässä paketissa

## Arkkitehtuuriperiaate

**Yksi kanoninen datamalli, monta sisääntulomuotoa.**

PDF-pohjia ei rakenneta sovelluksen pysyväksi tietomalliksi. Parserin tehtävä on muuntaa eri lähteiden palkkalaskelmat samaan rakenteeseen. Käyttöliittymän tehtävä on näyttää vähän; datakerroksen tehtävä on säilyttää tarpeeksi tulevaa historia- ja palkkakehitysanalyysiä varten.
