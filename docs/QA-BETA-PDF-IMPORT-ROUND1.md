# Palkka Beta — PDF-tuonnin QA-kierros 1 (2026-11-02)

## Tavoite
Testata käyttäjän pyytämä *yksi Palkka Beta* -työnkulku: suora paikallinen PDF-tuonti, historian käyttö analyysissä ja laskurissa sekä helppo, pääosin kertaluonteinen rakenneoppiminen.

## Rajaus ja turvaraja
- QA-haara: `qa/beta-pdf-import-round1-20261102`, lähtöhaara `feature/beta-progressio-2026-20261025`.
- Vain erillisen `_beta`-koosteen PDF-valinta avataan. `main`, `develop`, tuotanto, vanha PWA ja palvelinympäristöt jätetään rauhaan.
- Käytetään nykyistä Palkan toimivaa `parser.js`, `learning.js`, `model.js`, `storage.js` -ketjua. Import Engine LAB ei saa automaattista tallennuslupaa eikä sen parseria vaihdeta tuotannon tilalle.
- Oikeita palkkalaskelmia, henkilötietoja, PDF:n raakatekstiä tai varmuuskopioita **ei** viedä julkiseen GitHubiin, CI-lokeihin eikä QA-artifakteihin.
- PDF käsitellään paikallisesti; peruspolku säilyy offline. Epävarma, ristiriitainen tai ei-palkkalaskelma vaatii käyttäjän toimia.

## Automaattitestien uudet portit
`tests/beta/pdf-import.spec.mjs`:
1. Oikea synteettinen tekstikerroksellinen PDF → ydinkentät täsmälleen oikein; Analyysi ja Laskuri saavat saman paikallisen historian ilman varmuuskopioita.
2. Sama PDF kahdesti → yksi palkkatapahtuma.
3. Sama palkka-aika, eri nettosumma → konfliktiruutu; ei hiljaista korvausta eikä tallennusta ennen päätöstä.
4. Ei-palkkalaskelma → ei tallennusta.
5. Puuttuva kausibrutto, YTD olemassa → tarkistus, ei YTD:n lainaamista brutoksi.
6. Ulkoiset PDF-kirjastopyynnöt estetty → tuonti toimii paikallisella PDF.js:llä.

`tests/import-one-time-learning.test.mjs`:
1. Yksi tietoinen korjaus → seuraavasta saman rakenteen laskelmasta uudet arvot.
2. Sama rakenne voidaan myöhemmin vahvistaa uudelleen ilman pakkoa.
3. Saman kontekstin ristiriitaiset arvot eivät saa tulla arvatuiksi.
4. Muuttuneen rakenteen eri otsikkoa ei saa tulkita vanhaksi opiksi.
5. Oppimisdataan ei tule raakaa henkilötietoa; valitsimet ovat tiivisteitä.

Lisäksi ennallaan säilyvät aiemmat A–H parserin hyväksymistestit, erilaiset PDF-rakenteet ja parserin negatiiviset regressiot.

## Hyväksymisrajat
- **Ei GO ennen GitHub Actionsin todellista LOGIC + BROWSER -testiraporttia kyseiselle SHA:lle.**
- Kun synteettiset testit ovat vihreitä, riippumaton Codex/Work-/ihmisarvio: tarkista lähdekoodi, vastatapaukset, käyttökokemus 360/412 px, ylikirjoitussuojat ja tietosuojan säilyminen.
- Suorita yksityisesti 3–5 erilaista oikeaa PDF-pohjaa käyttäjän laitteella (myös vanha muoto, tuore muoto, muuttunut työnantajan pohja, verokortin vaihto). Todellisia palkkalaskelmia ei jaeta avoimena testikorpuksena.
- Kirjaa *käyttäjän lisätoimet per uusi formaatti*: tavoite 0, ellei lähde oikeasti epäselvä; uudella tuntemattomalla pohjalla 1 tarkistus mielellään riittää, mutta tätä ei saa luvata ilman mittausta.
- Varmista, että paikallinen rakenneoppi ja historia säilyvät päivityksessä, ettei väärää arvoa opita automaattisesti ja että käsin korjattu tieto pysyy näkyvissä.
- Testaa myös varmuuskopion vienti/palautus ja päällekkäisyyksien ratkaisu ennen lopullista Android- ja Google Drive -integraatiota.

## Avoin työ jatkokierrokselle
- Vahvista fyysisellä Androidilla PDF-valitsimen ja tarkistuslomakkeen mobiilikokemus.
- Tee koko kerran-korjaa → uusi oikea PDF → automaattisesti tunnistettu -käyttöliittymätesti, ei vain puhdas oppimismoduulin testi.
- Arvioi Import Enginen `review-draft.mjs` / `palkka-review.mjs` vasta rinnakkaistestissä; ei vaihdeta vanhaa toimivaa tunnistusta kokeelliseen ratkaisuun.
- Poista betasta kokeiluvaiheen päällekkäiset muotoilukerrokset vasta, kun tuontipolku on lukittu.

**Tämä dokumentti on testaussuunnitelma, ei hyväksyntä tai väite läpäisseistä testeistä.**
