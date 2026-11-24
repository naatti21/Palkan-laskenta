# Palkan nykytilan auditointi

Pohja on `ada3e8f`, PR #88:n yhdistämiskommit. Selainhavainnot ovat erillisestä paikallisesta Beta-buildista Chromiumilla 360 px leveydellä. Tietovirta, tallennus ja julkaisu on luettu lähdekoodista. Ruudunlukijaa, natiiviasennusta ja maakohtaista verotarkastusta ei päätellä kuvista.

## Käyttöpolut

| Askel | Näyttö ja havainto | Tila |
|---|---|---|
| 1. Seuranta | [Tyhjä Seuranta](screenshots/01-seuranta.png). Viimeisin palkka, vuosikoonti ja verokortin tila ovat erillisiä. Tyhjät summat ja pitkät veroselitteet työntävät ensimmäisen PDF:n alas. | P1 |
| 2. PDF-tuonti | [Tuonti](screenshots/02-tuonti.png). Tiedosto, tulolähde ja vahvistus ovat oikeassa järjestyksessä. Uuden lähteen kenttä ja useat selitteet lisäävät vieritystä. Modaalin näppäimistöfokus vaatii rajauksen. Epäselvää palkkaa käsitellään revisiona, erillisenä maksuna tai peruttuna tuontina. | P1 |
| 3. Analyysi | [Analyysi](screenshots/03-analyysi.png). Neljä aihetta säilyttävät selkeän jaon. Tyhjä näkymä näyttää puuttuvan datan useassa kortissa. PR #88:n nettovertailu erottaa toteumat ja suunnitelmat, käyttää samaa euroasteikkoa ja kertoo C-viitteen. | P2 |
| 4. Historia | [Historia](screenshots/04-historia.png). Maksuvuosi, lista ja kalenteri ovat suoraan näkyvissä. Tarkistettavat tietueet ja lähdekorjaukset voivat painaa uusimmat maksut alemmas. | P2 |
| 5. Laskuri | [Laskuri](screenshots/05-laskuri.png). Suunnitteluvuosi ja palkkahistorian ehdotukset näkyvät. Erillisen kokeilun versionumero ja JSON-valitsin toistavat pääsovelluksen työn. Runsas syötemäärä pidentää polkua tuloksiin. | P1 |
| 6. Asetukset ja palautus | [Asetukset](screenshots/06-asetukset.png). Vienti ja palautus ovat esillä, poisto vahvistetaan. Tekniset selitteet ja suunniteltu pilvitoiminto sekoittuvat nykyisiin toimintoihin. | P2 |
| 7. Offline ja asennus | Manifestissa on standalone-tila ja kuvakkeet. Asennuspainike riippuu selaimen `beforeinstallprompt`-tapahtumasta, iOS-ohje näkyy asetuksissa. Todellisen asennuksen ja tilan niukkuuden testaus tarvitaan laitteilla. | P1 |
| 8. Build ja julkaisu | Beta-build suojaa alkuperän, muodostaa cacheversion ja julkaisu varmistaa täsmällisen commitin. HTML-ankkurit, CSS:n kerrostus ja service workerin listan tekstikorvaukset sitovat toisistaan riippumattomat muutokset yhteen. | P1 |

## Vakavuusjärjestys

| Luokka | Löydös ja vaikutus | Käsittely |
|---|---|---|
| P0 | `storage.js:migrateLegacyLocalStorage` saattoi kuitata virheellisen JSON:n käsitellyksi tai suodattaa yksittäisen virheellisen tietueen ennen vanhan avaimen poistoa. Tuntematon muoto voi johtaa aineiston osittaiseen katoamiseen tai palautuksen ohittamiseen. Auditissa havaittu riskipolku, ei todettu vahinkoa käyttäjäaineistossa. | Validointi koko erälle ennen kirjoitusta. Virhe säilyttää alkuperäisen aineiston ja näyttää ohjeen käynnistyksessä. |
| P1 | `sw.js` käy yleisesti verkossa ja ottaa päivityksen heti käyttöön. Verkkovastausten ja cache-tiedostojen yhdistelmä voi vaihtua kesken istunnon. | Pre-retailille oma allowlist, cache ja odottava päivitys. |
| P1 | `app.js` kattaa tilan, tuonnin, näkymät, historiapolut, analyysin, tapahtumat ja asetukset. Pelkkä moduulin lataus sitoo näkymän tunnisteet ja kuuntelijat. | Eristä vedoksen käynnistys ja navigaatio. Säilytä tuonnin ja historian nykyinen tapahtumajärjestys. |
| P1 | `app.js` palauttaa palkkatiedot ja opitut rakenteet erillisillä transaktioilla. Toisen vaiheen virhe voi näyttää palautuksen epäonnistumisena vaikka palkat on jo yhdistetty. | Vedoksen virheteksti ilmoittaa osatuloksen. Yhteinen transaktio tai yksityiskohtainen palautusraportti on avoin. |
| P1 | `model.js:projectPayroll` käy näkyviä tietuepareja läpi ja usea kuluttaja laskee projektion uudelleen. Paljon historiaa kuormittaa etenkin koko näkymän päivityksessä. | Normalisoi kerran projektiossa. Jaettu vuosikohtainen projektio on ensisijainen jatkotyö. |
| P1 | Epäluotettava ja erityisesti kuvapohjainen PDF voi pysähtyä manuaaliseen tarkistukseen. Pitkien ja poikkeuksellisten PDF:ien suoritus- ja muistirajoja sekä aitoa puhelimen levytilan loppumista ei ole varmennettu. | Säilytä nykyiset tarkistukset. Uusi quota-vikasimulaatio varmistaa transaktion atomisuuden. |
| P2 | `analytics.js` ja `insights.js` ryhmittelevät samaa historiaa omiin raportteihinsa. `beta-compact.mjs` laskee toteutuneiden maksujen koonnin omalle näkymälle, eikä se vastaa aina semanttisesti veronalaista YTD-lukua. | Yhdistä vain samat käsitteet ja rajaukset. Testaa maksuvuosi, negatiivinen oikaisu ja lähteet ennen laskentapolun muutosta. |
| P2 | `beta-ab-summary-v6.mjs` lukee peruslaskurin näytöltä kokonaisiksi euroiksi pyöristettyjä seurantaarvoja, kutsuu laskentaa täydentäville tuloksille ja reagoi sekä syötteisiin että tulossolmujen muutoksiin. Samasta syötteestä voi tulla usea renderöinti. | Säilytetty vertailujen yhteensopivuuden vuoksi. Seuraava rajapinta voi palauttaa yhden numeerisen snapshotin. |
| P2 | `parser.js` yhdistää tekstin normalisoinnin, formaattien heuristiikat ja validoinnin. `model.js` erottaa tietueiden normalisoinnin parsinnasta, mutta hoitaa myös skeeman, identiteetin, revisiot ja projektion. | Lisää kohdennettuja regressioita ennen hierarkian pilkkomista. |
| P2 | CSS:ssä on päällekkäisiä Beta-vaiheita, tarkkoja tunnisteita ja `!important`-ylikirjoituksia. `beta-compact.mjs` rakentaa osan DOM:sta vasta käynnistyksessä. Aiempi vuositavoite, yhteensopivuuden vuoksi pidetyt piilotetut syötteet ja vanha mini-kuvaaja edellyttävät poistoanalyysin. | Ei summittaista poistamista. Uusi kerros erottaa omat tokenit. |
| P3 | Pienet versiotagit, toisteiset otsikot ja visuaalisesti eri tiheyden kortit kertovat eri kehitysvaiheista. | Yhtenäinen nimi, lukutypografia ja harvempi ensikäytön sisältö. |

## Tietorajat

Tuonnin alkuperäinen PDF ja raakateksti käsitellään selaimessa. Varmuuskopio sisältää arkaluonteisia rakenteisia palkka-arvoja ja käyttäjän nimeämiä tulolähteitä. Pääasiallinen renderöinti käyttää tekstiä, ja tulosyhteenvedon yksi tarpeeton HTML-interpolaatio poistettiin. Muut `innerHTML`-kohdat käsittelevät pääosin kiinteää markupia tai sovelluksen omia tekstejä, mutta systemaattinen lähde–kohde-auditointi ja sisältöturvapolitiikka ovat erillinen julkaisuportti.
