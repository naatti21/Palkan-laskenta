# Julkaisuarvio · Palkka Pre-retail v0.1

**NEEDS WORK julkaisua varten.** Vedos toimii määritellyssä paikallisessa osoitteessa, ja PR soveltuu katselmointiin.

## Varmennus

Paikallinen Node-suite läpäisi 284 testiä. Pre-retailin yhdeksän Playwright-testiä läpäisivät katselmointikorjausten jälkeen. Ne kattavat 320, 360, 390, 430, 768 ja 1280 px, viisi näkymää, näppäimistöohituksen, tuonnin Esc-paluun, kuusi valittua axe-sääntöä, vanhan varmuuskopion palautuksen, vioittuneen JSON:n, varmuuskopion lataamisen, puutteellisen PDF:n, duplikaatin, jonon sulkemisen ja offline-päivityksen. Historiasta verrataan myös ennen ja jälkeen otetun kuvan tiivistettä samassa selaimessa. Testi vaihtaa service workerin revisiota, odottaa uuden workerin valmiiksi ja sulkee vanhan asiakkaan ennen aktivointia. Se osoittaa saman alkuperän historian säilymisen, ei koko kauppajakelun päivitysketjua.

Synteettisessä aineistossa on tavallisia palkkoja, ylityötä, lomaraha, korvattu laskelma, kaksi tulolähdettä samana maksupäivänä, vuodenvaihde ja muuttuva verokortti. Senttitestissä vuoden 2026 tarkistussumma on 1 200,30 € brutto ja 959,95 € netto negatiivisen oikaisun jälkeen. Joulukuun 2025 netto 2 000,10 € säilyy omalla vuodellaan. Testi ei todista henkilökohtaista verotusta. Levytilavirhe simuloidaan IndexedDB-kirjoituksessa ja aiempi historia tarkistetaan sen jälkeen.

### Suorituskyky

Yksi paikallinen Chromium-ajo, 390 px, 4× CPU-hidastus, 150 synteettistä palkkalaskelmaa ja paikallinen HTTP-palvelin. Mittaus kattaa käyttöliittymän näkyvään valmiustilaan kuluvan ajan ja Playwrightin toiminto-odotukset. Yhteyttä ei hidastettu.

| Mittaus | Tulos |
|---|---:|
| Tyhjä käynnistys, tuontipainike näkyy | 1 794 ms |
| Käynnistys historialla, summa ja tuontipainike näkyvät | 1 641 ms |
| Historian avaus, ensimmäinen rivi näkyy | 245 ms |
| Paketin koko pakkaamattomana | 2 275 290 tavua |

Mittaus on suuntaa antava, eikä 150 tietuetta osoita tuhansien maksujen käsittelyä. Ennen optimointia 150 tietueen koe ylitti 5 sekunnin odotuksen tässä simulaatiossa. Projektiossa on edelleen parivertailu.

### Kuvallinen tarkistus

[PR #89:n katselmointikorjaukset ja täyspitkät kuvat](review-fixes.md) · [Erillinen refaktorointisuunnitelma](refactoring-plan.md)

[Beta ja vedos rinnakkain, 360 px](screenshots/beta-pre-retail-360.png). Uusi ensikäyttö näyttää ensimmäisen PDF-toiminnon heti. Täytetyssä Seurannassa viimeisin netto, vuoden koonti ja verokortin tila ovat selvästi nimettyjä. 360 ja 390 px kuvissa A/B/C-tasojen rahamäärät mahtuvat rinnakkain, Historia näyttää bruton ja neton, ja alavalikko pysyy ruudulla. Laskurin KTA-polku ja tuontilomake ovat edelleen pitkiä. Asetusten alempi osuus sisältää vielä teknisiä toimintoja, jotka vaativat vieritystä.

| Näkymä | 360 px | 390 px |
|---|---|---|
| Tyhjä Seuranta | [Kuva](screenshots/retail-360-01-seuranta-tyhja.png) | [Kuva](screenshots/retail-390-01-seuranta-tyhja.png) |
| Tuonti | [Kuva](screenshots/retail-360-02-tuonti.png) | [Kuva](screenshots/retail-390-02-tuonti.png) |
| Täytetty Seuranta | [Kuva](screenshots/retail-360-03-seuranta-historia.png) | [Kuva](screenshots/retail-390-03-seuranta-historia.png) |
| Laskuri | [Kuva](screenshots/retail-360-04-laskuri.png) | [Kuva](screenshots/retail-390-04-laskuri.png) |
| Analyysi ja A/B/C | [Kuva](screenshots/retail-360-05-analyysi.png) | [Kuva](screenshots/retail-390-05-analyysi.png) |
| Historia | [Kuva](screenshots/retail-360-06-historia.png) | [Kuva](screenshots/retail-390-06-historia.png) |
| Asetukset | [Kuva](screenshots/retail-360-07-asetukset.png) | [Kuva](screenshots/retail-390-07-asetukset.png) |

## Julkaisun portit

1. Hyväksy erillinen HTTPS-alkuperä, tietojen siirtomenettely ja palautus. Nykyinen build hyväksyy vain portin 4190 loopbackissa.
2. Testaa asennus ja päivitys oikeilla Android- ja iOS-laitteilla sekä molempien ruudunlukijoilla. Varmenna niukka levytila ja tuontiprosessin katkaisu natiivisti.
3. Koeponnista pitkät ja poikkeavat PDF:t, täydellinen varmuuskopion palautus keskeytystilassa ja arkaluonteisen datan säilyminen. Tarjoa päivityksen aktivoinnista ymmärrettävä palaute.
4. Varmenna verokoneisto ja palkkakäytännöt synteettisiksi muunnetuilla, domain-asiantuntijan tarkistamilla tapauksilla. C:n lähde on vuoden 2026 viite.

`npm audit` ilmoitti paikallisessa ajossa nolla tunnettua haavoittuvuutta. Se kuvaa rekisterin tiedossa olleita riippuvuusilmoituksia. PDF:n muistirajat, omien tietovirtojen koko XSS-auditointi ja CSP jäävät julkaisutarkastukseen. Palkkatiedot ja varmuuskopiot ovat paikallisia ja arkaluonteisia. Julkaisun kannalta vähemmän kiireisiä ovat irralliset Beta-CSS-ylikirjoitukset, sisäisten moduulien nimien yhtenäistys ja kuvakohteiden automaattiset kultaiset vertailut selainmatriisissa.

## Arvosanat

| Ulottuvuus | Arvio | Peruste |
|---|---:|---|
| Visuaalinen viimeistely | 7 | Selkeä ensiaskel, brändin yhtenäinen tumma pinta ja hyvä rahalukujen kontrasti kuvissa. Perittyjen osioiden taajuus vaihtelee. |
| Käytettävyys | 7 | Viisi kohdetta ja tuonti löytyvät, Historia avaa maksun tiedot. Pitkät tuonti- ja KTA-polut vaativat oikeaa käyttökoetta. |
| Ominaisuuksien hyödyllisyys | 8 | Täysi paikallinen polku PDF:stä historiaksi, varmuuskopioksi ja A/B/C-nettovertailuksi. OCR puuttuu. |
| Laskennan luotettavuus | 7 | Laskentamoduulit ja regressiot säilyvät. Sentti-, vuodenvaihde- ja lähdetapaukset on varmistettu, verovastaavuutta ei ole ulkopuolisesti tarkastettu. |
| Koodin ylläpidettävyys | 6 | Oma build, entrypoint ja navigaatiovastuu. Suuri `app.js`, osin dynaaminen DOM ja käyttämättömien kokeilujen siivous ovat kesken. |
| Tietosuoja | 8 | Selaimen oma tallennus, erillinen alkuperä, oma cache, synteettiset testit ja PDF:n paikallinen käsittely. Päätelaitteen ja varmuuskopion suoja riippuu käyttäjän ympäristöstä. |
| Saavutettavuus | 6 | Näppäimistöohitus, nykyisen näkymän tila, fokus ja kohdennettu axe. Ruudunlukijoita ja koko sovelluksen kontrastia ei ole kattavasti mitattu. |
| Suorituskyky | 6 | 150 maksun emulaatio toimii noin 1,6 sekunnissa. Tuhansien rivien, poikkeavan PDF:n ja hitaan yhteyden rajoja ei ole mitattu. |
| Julkaisukelpoisuus | 5 | Todennettava paikallinen vedos. Julkaisu-alkuperä, oikeat laitteet, palautuksen äärirajat ja riippumaton laskentatarkastus ovat auki. |
