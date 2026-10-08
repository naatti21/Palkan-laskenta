Palkka PWA v0.2 UI-patch

Korvaa repossa nämä neljä tiedostoa tällä paketilla:
- index.html
- app.js
- styles.css
- sw.js

Muut tiedostot pysyvät ennallaan.

Muutokset:
- varma palkkalaskelma tallentuu automaattisesti
- normaali onnistuminen näyttää vain tiiviin yhteenvedon
- kaikki editointikentät eivät jää auki
- epävarmassa tilanteessa näytetään vain ongelmalliset kentät
- "Näytä kaikki kentät" avaa täyden muokkauksen tarvittaessa
- tunnistetut palkanosat näytetään tageina (ylityö, sunnuntai, viikkovapaa, työaikapankki)
- mobiilin kenttiä ja dashboardia on tiivistetty
- service worker päivitetty v2-välimuistiin ja vanhat cache-versiot poistetaan automaattisesti

GitHubissa korvaa tiedostot main-haarassa ja odota Pages-workflow'n valmistumista. Ensimmäisellä avauksella versionvaihdon jälkeen yksi sivun uudelleenlataus voi olla tarpeen.
