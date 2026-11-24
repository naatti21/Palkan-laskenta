# Palkka Pre-retail v0.1 · design system

Käyttöliittymä on tumma ja kulmikas. Luettavuus syntyy pinnan, tekstipainon ja välin vaihtelusta. Palkkasumma on mittarin tärkein elementti. Toteuma, ennuste, virhe ja puuttuva tieto erotetaan sanalla ja muotoilulla.

| Tokenryhmä | Toteutus ja käyttö |
|---|---|
| Pinnat | `--retail-canvas` sivulle, `--retail-surface` korteille ja `--retail-raised` aktiiviselle pinnalle. Käytä yhtä kehystä, jos ryhmän erottaminen sitä vaatii. |
| Teksti | `--retail-text` päätekstille, `--retail-muted` lähteelle ja ajalle. Perus 16 px, kuvateksti 14 px, osio-otsikko 20 px. Tärkein summa skaalautuu 28,8–42,4 px. |
| Värit | Turkoosi toiminnolle, vihreä onnistumiselle, keltainen varoitukselle, punertava virheelle. Käytä neutraalia tunnusta, kun tietoa ei ole. |
| Välit | 4, 8, 12, 16 ja 24 px. Osion sisällä 8–12, osioiden välillä 12–24 px. Käytä 6 px kaarta ja 1 px rajaa. |
| Numerot | Fi-FI, euro ja desimaalipilkku, taulukkonumerot summille. Säilytä sentti, kun näytössä on maksettu tai tarkka arvio. Jos luku puuttuu, käytä ajatusviivaa ja selitettä. |
| Kuvaajat | Maksettu netto vihreä ja brutto sininen. Vertailut A sininen, B violetti ja C keltainen. Toteumat pylväinä, arviot viivoina, tekstiselite mukana. Nollataso näkyy. |
| Fokus ja kosketus | Fokusrenkaan turkoosi 2 px. Tavoite 44 px painikkeille ja valitsimille. Tiheässä 12 kuukauden kuvaajassa palkin koko pystysuuntainen sarake on valittavissa. |

## Komponenttien sopimukset

- **AppHeader / BottomNavigation** käyttävät kirjainmuotoista nimeä ja viittä vakiokohdetta. Näkymällä on ohjelmallinen nykytila ja näppäimistöohitus.
- **MetricCard / MoneyValue** sijoittavat maksupäivän summan yhteyteen ja pitävät toteuman erillään veronalaisesta kertymästä.
- **SectionHeader / ChartLegend** vastaavat yhteen kysymykseen osiossa. Värin lisäksi näytetään tunnus ja euromäärä.
- **StatusMessage / EmptyState** kertovat tilanteen ja seuraavan toimen. Ensikäytössä avataan ensimmäinen PDF, lisätiedot ovat yhden avauksen päässä.
- **FormField / ConfirmDialog** käyttävät näkyvää kenttänimeä. Tuonti palaa Escape-näppäimellä avaajaan. Datan poistossa selaimen natiivi vahvistus nimeää poistettavat tiedot.

Tokenit toteutetaan tiedostossa [pre-retail/styles.css](../../pre-retail/styles.css). Aiemmat toiminnalliset luokat ovat yhteensopivuuskerroksessa. Yhteensopivuusluokkien mitat eivät vielä kaikki noudata uutta rytmiä. Yhteisen ulkoasun jatkotyö kannattaa tehdä testattava osio kerrallaan.
