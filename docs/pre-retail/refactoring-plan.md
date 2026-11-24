# Seuraavat koodin rakenteelliset muutokset

Tämä suunnitelma on erillinen PR #89:n käyttöliittymäkorjauksista. Tee kukin kokonaisuus omana PR:nään. Mittaa muutosten vaikutus nykyisellä synteettisellä aineistolla.

## 1. Pilko app.js käyttöpolun mukaan

Aloita tuontijonosta. Siirrä tiedostojen valinta, keskeytettävä tilakone ja jonon näkymän renderöinti omaan moduuliin. Anna sille riippuvuuksina PDF:n luku, tietueen tallennus sekä ristiriita-, tila- ja uudelleenrenderöintipalautteet. Säilytä tiedosto-oliot muistissa ja nykyinen tallennustransaktio luotettavuusrajana. Tarkista ennen ja jälkeen samat monituonti-, duplikaatti-, tulolähde-, ristiriita- ja sulkemistapaukset.

Irrota seuraavaksi Asetusten vienti ja palautus sekä Historian renderöinti. Pidä alustus, näkymän valinta ja yhteinen sovellustila vielä `app.js`:ssä. Siirrä laskentaa vasta erillisessä muutoksessa, jossa jokainen kuluttaja saa saman kanonisen projektion samalla maksu- ja vuosirajauksella.

## 2. Yhdistä CSS-kerrokset käyttötarkoituksen mukaan

Kirjaa ensin, mistä säännöistä johtuvat Seurannan, tuonnin, Historian ja Laskurin lopulliset tyylit. Aloita pre-retailin omasta buildista. Yhdistä käytössä olevat yhteensopivuuskerrokset pohjaan, komponentteihin ja näkymäkohtaisiin poikkeuksiin. Vaihda mitat ja värit tokeneihin säilyttäen järjestys, ellei visuaalinen muutos ole tarkoituksellinen. Poista joka erässä vain todennetusti tarpeettomat valitsimet tai ylikirjoitukset. Tarkista kuvaparit, fokus ja geometria 320, 360, 390 ja 430 px leveydellä. Pidä lukitut Beta-teemat erillään tästä työstä.

## 3. Tee varmuuskopion palkat, lähteet ja opitut rakenteet atomisiksi

Lue ja validoi koko aineisto sekä normalisoi opitut rakenteet ennen kirjoitusta. Yhdistä palkat, lähteet ja opitut rakenteet yhdessä IndexedDB:n `readwrite`-transaktiossa. Tee erän päätökset tietokannan lukon sisällä, jotta toinen välilehti ei muuta niiden lähtötilaa. Onnistumisilmoitus seuraa transaktion `complete`-tapahtumaa. Käsittele uuden käyttöliittymän renderöintivirhe tallennuksen jälkeisenä erillisenä ongelmana.

Lisää vikasimulaatiot toisen tai kolmannen tietovaraston kirjoitukseen, tilan loppumiseen ja välilehtien rinnakkaisiin tuonteihin. Tarkista ennen ja jälkeen tietueet, lähteet ja rakenteet myös virheen jälkeen. Säilytä alkuperäinen JSON-tiedosto käyttäjällä ja testaa saman korjatun varmuuskopion uusintapalautus.
