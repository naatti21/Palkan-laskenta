# PR #89 · katselmointikorjaukset

- **Laskuri:** Pre-retail siirsi vuosikentän iframen historiakorttiin irralliseksi ensimmäiseksi lapseksi. Kentän ja seuraavan otsikon laatikko kohtasivat 360 px kuvassa samalla rajalla. Otsikko, vuosikenttä ja ohje ovat nyt yksi otsikko–kenttä-ryhmä normaalissa asettelussa. Ryhmä käyttää samaa väliä myös otsikon rivittyessä.
- **Geometria:** Playwright vertaa koko iframe-sisällön näkyvien otsikoiden, kenttien, painikkeiden ja avaajien laatikoita 320, 360, 390 ja 430 px leveydellä. Tarkistus kattaa suljetun ja avatun vertailutaulukon sekä iframen alareunan. Sisäkkäiset kentät ja niitä ympäröivät etiketit ovat sallittuja.
- **Historia:** Korvattu versio tunnistetaan kanonisesta revisioprojektiosta. Se on merkitty arkistotilaan ja summan ulkoasu eroaa aktiivisesta netosta. Rivi avautuu edelleen ja näyttää alkuperäiset tiedot. Laskentaan sisältyvät versiot valitaan entiseen tapaan.
- **Laskurin tekstit:** Vanha brändiviittaus historiavirheestä ja irrallisen Laskurin C-viestistä poistui. Iframe käyttää Pre-retailissa Palkka-nimeä ja siinä näkyviä toimintoja vastaavaa loppuhuomautusta. Testi lähettää virheellisen historiaviestin ja varmistaa käyttäjälle näytetyn ilmoituksen.
- **Tuonti:** PDF-valitsin näkyy ensin ja saa fokuksen dialogia avattaessa. Tulolähteen valinta on näkyvissä ja uuden tulolähteen kenttä on avattavassa osassa. Betan tuontinäkymän oletusrakenne säilyy.

## Kuvallinen tarkistus

Täyspitkissä 360 ja 390 px kuvissa kiinnitetty alanavigaatio on kuvatallennusta varten sivun lopussa, jotta rivit eivät jää sen alle. Kuvaajaotteissa navigaatio näkyy normaalissa käyttötilassa.

| Näkymä | 360 px | 390 px |
|---|---|---|
| Laskuri kokonaan | [360](screenshots/retail-360-04-laskuri.png) | [390](screenshots/retail-390-04-laskuri.png) |
| Laskurin kuvaajat vieritettynä | [360](screenshots/retail-360-04-laskuri-kuvaajat.png) | [390](screenshots/retail-390-04-laskuri-kuvaajat.png) |
| Historia kokonaan | [360](screenshots/retail-360-06-historia.png) | [390](screenshots/retail-390-06-historia.png) |
| Tuonti kokonaan | [360](screenshots/retail-360-02-tuonti.png) | [390](screenshots/retail-390-02-tuonti.png) |
| Analyysi kokonaan | [360](screenshots/retail-360-05-analyysi-koko.png) | [390](screenshots/retail-390-05-analyysi-koko.png) |

Rakenteelliset jatkotyöt ovat erillisessä [refaktorointisuunnitelmassa](refactoring-plan.md). Tätä korjausta ei ole julkaistu.
