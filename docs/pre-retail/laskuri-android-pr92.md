# Laskuri Androidissa · PR #92

## Harmaan ruudun toisto

GitHub Actionsin Chromium avasi julkaistun version `26a1849` puhtaalla Pixel 7 -selainprofiililla. Ensimmäinen avaus näytti A/B/C-kortit. Seuraava avaus samassa profiilissa epäonnistui sekä verkkoyhteydellä että offline-tilassa. Lapsidokumentin osoitteeksi tuli `chrome-error://chromewebdata/` ja navigointivirheeksi `net::ERR_FAILED`. Tämä toistaa käyttäjän kuvaaman oireen. Fyysisen puhelimen lokia ei ole saatavilla. [Julkisen version mittaus](https://github.com/naatti21/Palkan-laskenta/actions/runs/45664129759/job/139381540549)

| Pyyntö julkiseen palveluun | Havainto |
|---|---|
| `/experiments/year-planner/index.html` | HTTP 308 osoitteeseen `/experiments/year-planner/` |
| `/experiments/year-planner/` | HTTP 200, HTML |
| Sovelluksen juuri, Service Worker, päämoduuli, Laskurin CSS ja kolme laskurimoduulia | HTTP 200, odotetut sisältötyypit |
| Vanhan Service Workerin välimuistimerkintä tiedosto-osoitteelle | Vastauksen lopullinen URL oli hakemisto-osoite ja `redirected` oli tosi |

Vanha asennus seurasi uudelleenohjausta resurssien esilatauksessa. Myöhemmin Service Worker palautti tämän tallennetun vastauksen suoraan iframen navigointipyyntöön. Chromium hylkäsi sen. Tavallinen Python-tiedostopalvelin palautti tiedosto-osoitteeseen suoraan HTTP 200:n, joten aiempi paikallinen testi ei voinut paljastaa tätä virhettä.

## Korjaus ja rajaus

- Iframe, buildin resurssiluettelo ja Service Worker käyttävät nyt samaa lopullista hakemisto-osoitetta. Vanhan index-osoitteen navigointi saa hallitun ohjauksen myös offline-tilassa. Asennus hylkää yllättävän uudelleenohjauksen. Aiempi valmis välimuisti palvelee edelleen vanhaa sovellusikkunaa, kunnes uusi versio voi aktivoitua.
- Laskurin esitystapa käyttää edelleen yhtä saman alkuperän dokumenttia. Selain lataa sen tyylit ja moduulipuun dokumentin omasta HTML:stä. Vanhemman dynaaminen skriptien lisäys, näkymää tarkkaillut aikakatkaisu ja erillisen sivun linkki poistuivat. Pääsovelluksen ensimmäinen välilehtivalinta ja PDF-valinta ovat käytettävissä heti, kun niiden käsittelijät on kytketty.
- Historiayhteys odottaa sekä paikallisesta tietokannasta luettuja tietoja että valmista lapsidokumenttia. Uusi dokumentti irrottaa vanhan kokotarkkailijan. Välilehden vaihto säilyttää saman laskurin ja sen syötteet. PR:ssä ennestään ollut sisältökorkeuden mittaus säilyi. Palkka- ja verokaavat, C-veroviite sekä tallennusskeema säilyivät.
- PDF-jonon regressiotesti odottaa käyttäjän ratkaisua ristiriitaan, tarkistaa välitilan ja antaa jonon käsitellä seuraavan PDF:n. Ohituksessa kantaan jää kaksi oikean lähteen maksua, netoiltaan 2 678,39 € ja 2 450,00 €.

## Mittaukset

Paikallisen Chromium 154:n mobiiliajo käytti kosketusta, Pixel 7 -selainprofiilia ja nelinkertaista CPU-hidastusta. Alla on yksi mitattu ajo. Luvut kuvaavat testikonetta.

| Mittaus | Tulos |
|---|---|
| Kylmä käynnistys navigoinnin alusta avattuun Laskuriin | 1 592 ms |
| Child-dokumentin elementit ennen leveyden- ja välilehdenvaihtoja sekä niiden jälkeen | 1 011 → 1 011 |
| Iframen korkeus 360 px näytöllä ennen kierrosta ja sen jälkeen | 12 194 → 12 194 px, sisällön korkeus 12 182 px |
| Iframen korkeus 320 / 390 / 430 px leveydellä | 13 300 / 11 532 / 10 865 px |
| Vaakasuuntainen ylivuoto kaikissa neljässä koossa ja 844 × 390 px vaakasuunnassa | 0 px |
| CDP:n JavaScript-keko ennen kierrosta ja sen jälkeen | 7,43 → 8,65 Mt ilman pakotettua roskienkeruuta |
| Toisen avauksen ja syötteiden muokkauksen pitkät tehtävät lapsidokumentissa | 14 vähintään 50 ms:n tehtävää, pisin 192 ms |
| Kylmä sovellus 150 synteettisellä palkkatietueella, erillinen 390 px testi | 1 133 ms, siirtyminen historiaan 170 ms |

Samalla lähtöaineistolla ja leveydellä viisi välilehdelle paluuta ei lisännyt elementtejä tai kasvattanut iframea. Selain navigoi lapsidokumenttiin kerran kutakin sovelluslatausta kohti. Se pyysi neljä JS-moduulia kerran kukin. Laskurin pitkä sisältö vie tilaa ja muokkaus voi aiheuttaa havaittavan pääsäietauon hitaalla laitteella. Yksi kekomittaus ei osoita pitkäaikaisen muistinkäytön kehitystä.

Päivitystestissä vanha välimuisti toisti selaimen virhesivun. Vanhan sovellusikkunan sulkemisen jälkeen uusi Service Worker aktivoitui. Seuraava avaus toimi ilman verkkoyhteyttä, yhdeksän palkkatietuetta säilyi kenttineen ja laskuri sai niistä historiaehdotukset. Betan vertailusyötteillä A:n vuosinetto oli 32 400 €, B:n 35 340 € ja erillisen 3 000 €/kk C-tavoitteen tulos 17 työviikonloppua.

## Kuvallinen tarkistus

Kuvat ovat Playwrightista, ja niissä on synteettistä historiaa. Suunnitteluvuosi ja seuraava otsikko mahtuvat omille riveilleen. A/B-tulokset, C-tavoite ja alareunan navigaatio ovat näkyvissä. Veroprogression pienimmät akselitekstit ovat 360 px koossa edelleen pienet. Tarkat luvut näkyvät kuvaajan alapuolella.

[360 px · alku](screenshots/pr-92/retail-360-laskuri-alku.png) · [A/B/C](screenshots/pr-92/retail-360-laskuri-abc.png) · [alin veroprogressiokuva](screenshots/pr-92/retail-360-laskuri-alimmat.png) · [ladattu historia](screenshots/pr-92/retail-360-laskuri-historia.png) · [390 px · koko Laskuri](screenshots/pr-92/retail-390-04-laskuri.png)

## Fyysinen hyväksyntä Androidilla

Julkinen Pre-retail palvelee edelleen aiempaa versiota. Ehdokasta voi kokeilla USB-virheenkorjauksella omalla Android-testilaitteella ilman Cloudflare-julkaisua. Aja työhaaran juuressa seuraavat komennot Node 22:lla tai uudemmalla.

```sh
npm ci
PRE_RETAIL_ORIGIN=http://127.0.0.1:4190 npm run build:pre-retail
adb reverse tcp:4190 tcp:4190
python3 tests/pre-retail/pages-server.py
```

Avaa puhelimen Chromessa `http://127.0.0.1:4190/`, lisää synteettinen historia ja avaa Laskuri. Muuta A/B-valintoja ja C-tavoitetta, vieritä viimeiseen kuvaajaan ja käännä puhelin. Asenna PWA samasta osoitteesta, sulje kaikki sen ikkunat ja avaa se uudelleen. Pysäytä testipalvelin ja avaa PWA vielä kerran. Kirjaa puhelimen malli, Android- ja Chrome-versio, laskurin toiminta sekä historian säilyminen. Paikallisella testiosoitteella on oma selainvarastonsa.
