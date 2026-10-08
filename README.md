# Palkka PWA — prototyyppi 0.1

Tämän prototyypin tavoite on todistaa yksi asia luotettavasti:

**eri näköiset PDF-palkkalaskelmat -> sama normalisoitu tietomalli -> käyttäjän tarkistus -> paikallinen seuranta.**

## Mitä 0.1 tekee

- lukee selaimessa tekstikerroksen sisältävän PDF:n Mozilla PDF.js:llä
- tunnistaa palkkakauden ja maksupäivän
- poimii bruton, neton, YTD-tulon ja verokortin oman kertymän
- poimii perus-/lisäprosentin ja tulorajan
- poimii KTA:n, PP:n, OT-rivit, sunnuntaityön, viikkovapaan ja työaikapankkirivit
- näyttää kaikki poimitut arvot muokattavina ennen tallennusta
- tallentaa hyväksytyt laskelmat vain selaimen localStorageen
- näyttää yksinkertaisen liikennevalon
- vie tallennetut tiedot JSON-varmuuskopioksi
- sisältää automaattitestit kahdelle eri PDF-rakenteelle

## Tärkeä suoja vääristymiä vastaan

Palkkalaskelman `Kertymä vuoden alusta` ei ole automaattisesti sama asia kuin nykyisen verokortin tulorajaan kuuluva kertymä.

Prototyyppi poimii erikseen:

- `ytdTaxableIncome` = koko vuoden veronalainen kertymä
- `taxCardAccumulatedIncome` = palkkalaskelman verokortin/pidätyksen kertymä, jos se on löydettävissä
- `taxLimit` = verokortin tuloraja

Liikennevalo vertaa tulorajaa **vain `taxCardAccumulatedIncome`-kenttään**. Jos sitä ei löydy, appi ei tee vaarallista oletusta.

## Testidata

Repositorioon ei tarvitse tallentaa oikeita palkkalaskelma-PDF:iä tai henkilötietoja. `tests/fixtures/` sisältää vain parserille tarpeelliset, tunnisteettomat tekstirivit kahdesta testirakenteesta.

Odotettu yhteinen tulos sisältää muun muassa:

- maksupäivä 9.10.2026
- brutto 3 212,79 €
- netto 1 831,61 €
- YTD 73 881,95 €
- verokortin kertymä 18 077,71 €
- tuloraja 40 000 €
- perusprosentti 32,5 %
- lisäprosentti 47 %
- OT yhteensä 21,03 h
- KTA 25,07 €

## Paikallinen ajo

Älä avaa `index.html`:ää suoraan `file://`-osoitteella, koska service worker ja moduulit tarvitsevat HTTP-palvelimen.

Pythonilla:

```bash
python -m http.server 8080
```

Sitten avaa:

```text
http://localhost:8080
```

Parseritestit:

```bash
node --test tests/parser.test.mjs
```

## GitHub Pages

1. Luo uusi repository.
2. Kopioi tämän paketin tiedostot repositoryn juureen.
3. Puske `main`-haaraan.
4. GitHubissa: **Settings -> Pages -> Source: GitHub Actions**.
5. `.github/workflows/pages.yml` ajaa parseritestit ja julkaisee sivun vain, jos testit menevät läpi.

## PWA-asennus

Android/Chromium näyttää yleensä asennuskehotteen, kun sivu täyttää PWA-ehdot.

iOS/iPadOS: Safarissa käytä **Jaa -> Lisää Koti-valikkoon**.

Huom: prototyypissä ei vielä ole omia sovellusikoneita. Se ei estä parserin tai käyttöliittymän testaamista, mutta ikonit kannattaa lisätä ennen oikeaa julkaisua.

## Tietosuoja

- palkka-PDF luetaan selaimen muistissa
- prototyyppi ei lähetä PDF:ää omalle palvelimelle
- palkkahistoria on localStoragessa samalla laitteella
- käyttäjä voi tyhjentää datan yhdellä painikkeella
- oikeita PDF:iä ei pidä commitoida julkiseen GitHub-repoon

PDF.js ladataan tässä ensimmäisessä versiossa cdnjs-palvelusta. Varsinaiseen julkaisuversioon kirjasto kannattaa bundlata mukaan, jotta PWA ei tarvitse ulkopuolista CDN:ää ja riippuvuus voidaan lukita.

## Seuraavat vaiheet — ei vielä 0.1:ssä

1. Aja molemmat oikeat PDF:t selaimessa ja vertaa tuloksia testifixtureen.
2. Korjaa PDF:n tekstikerroksen mahdolliset järjestyserot.
3. Lisää verokortin PDF-parseri omaksi adapteriksi.
4. Lisää verotuspäätös/veroehdotus omaksi adapteriksi.
5. Lisää geneerinen kenttäalias-rekisteri eri työnantajien termeille.
6. Lisää OCR vasta kun kuvapohjainen PDF oikeasti vaatii sitä.
7. Siirrä localStoragesta IndexedDB:hen ennen suurempaa käyttöä.
8. Lisää salattu varmuuskopiointi vasta myöhemmin.

## Arkkitehtuuriperiaate

PDF-pohjia ei kovakoodata sovelluksen tietomalliksi. Eri dokumenttipohjat ovat vain sisääntulo-adaptereita, jotka tuottavat saman kanonisen palkkarivin.
