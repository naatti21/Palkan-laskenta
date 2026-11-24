# Arkkitehtuuri

## Säilytetyt rajat

`pdf-reader.js` poimii tekstin paikallisella PDF.js:llä. `parser.js` tunnistaa muodon ja validoi kenttiä. `model.js` on kanoninen tietue- ja revisiomalli. `storage.js` tekee kirjoitukset IndexedDB:n transaktioissa. `analytics.js`, `insights.js` ja laskurin puhtaat laskentamoduulit palvelevat näkymiä. Tuonti säilyttää lähteen, maksupäivän ja ratkaisun myös silloin, kun tiedosto on tuotu aiemmin.

## Muutokset

| Muutos | Vaikutus | Riski ja kompromissi |
|---|---|---|
| Oma HTML, entrypoint ja build | Vakaa esitysrakenne, erillinen versio, alkuperä ja kopioitavien resurssien lista. Build ei kutsu Beta-scriptiä eikä etsi käyttöliittymän tekstejä. | Staattinen layout pitää päivittää, jos yhteisen sovelluksen DOM-sopimus muuttuu. Käytössä yhteensopivuuskerros, joka pohjautuu auditoituun Beta-rakenteeseen. |
| Pre-retailin navigaatio ja käynnistys | Suora vastuu nykyisestä näkymästä, näppäimistöohituksesta, laskurin liitännästä ja virheen näyttämisestä. | `app.js` sitoo yhä perusnäkymät. Iframe tarvitsee saman alkuperän sekä dokumentoidut DOM-tunnisteet. |
| Paikallinen service worker | Sisältöosoitettu cache, asennus lataa koko listan ja epäonnistunut asennus hylätään. Avoin vanha versio palvelee yhtenäisenä, uusi aktivoituu asiakkaiden poistuttua. | Koko offline-paketti ladataan kerralla. Päivitys vaatii vanhan ikkunan sulkemisen, ja käyttäjän täytyy saada siitä erillinen käyttöliittymäohje ennen Retailia. |
| Migraatiovalidointi | Alkuperäinen localStorage-avaimen aineisto säilyy, jos yksikin tietue on virheellinen. Kelvolliset maksut yhdistetään olemassa olevalla transaktiolla. | Tiukempi validointi voi keskeyttää aiemmin hiljaa hyväksytyn virheellisen migraation. Käyttäjälle näytetään syy, yhteensopiva historia pysyy luettavissa. |
| Palkkaprojektion normalisointi | Yksi normalisointi per tietue projektiossa. Ristiriidan luokitus toimii samalla yhteisellä päätöksellä. Kenttäerot lasketaan vain niitä tarvitsevalle kutsujalle. | Parivertailun asymptoottinen kustannus ja toistuvat projektiot säilyvät. Maksutapahtuman identiteetti ja lähderajat vaativat regressiot jokaisessa jatkomuutoksessa. |
| Palautuksen lopputila | Virheilmoitus kertoo, jos maksut ehdittiin palauttaa ennen toisen vaiheen virhettä. | Palkat ja opitut rakenteet ovat yhä eri transaktioissa. |
| Tulosyhteenvedon DOM-renderöinti | Summat ja otsikot kirjoitetaan tekstisolmuina. | Samanrakenteinen DOM, ei uutta sanitointikirjastoa. |

## Käynnistä vedos

```sh
npm ci
PRE_RETAIL_ORIGIN=http://127.0.0.1:4190 npm run build:pre-retail
python3 -m http.server 4190 --bind 127.0.0.1 --directory _pre-retail
```

Avaa `http://127.0.0.1:4190/`. `_pre-retail/build-info.json` näyttää commitin ja version. Vedos ei jaa alkuperää Betan kanssa. Siirrä synteettinen data JSON-varmuuskopiolla. Verkossa julkaistava alkuperä edellyttää erillistä päätöstä ja buildin allowlist-muutosta. CI tuottaa paikallisen paketin, jonka voi purkaa ja tarjoilla samalla portilla.

## Seuraava rajapinta

Irrota tuonnin tilakone ja palautuksen käyttöliittymä `app.js`:stä ensin. Tee kanonisesta projektiosta yksi vuosittain välimuistitettava syöte analyysi- ja historianäkymille. Siirrä iframe-sovitus dokumentoiduksi viestisopimukseksi vasta kun A/B/C- ja KTA-regressiot on laajennettu. Olemassa oleva C-veroviite ja palkkalaskennan kaavat ovat tässä haarassa ennallaan.
