# Palkka Beta – veroviitteen vuosipäivitys

Omistaja: Palkka-sovelluksen ylläpito. Käyttäjälle ei siirretä yleisten veroviitteiden päivittämistä.

## Nykytila 2026
- Vertailuarvot moduulissa beta-net-reference-2026.mjs.
- Marginaaliviite ja A/B/C-käyrä moduulissa beta-ab-summary-v6.mjs.
- Lähde: https://www.veronmaksajat.fi/tutkimus-ja-tilastot/tuloverot/palkansaajan-veroprosentit/
- A/B on käyttäjän verokortin ennakonpidätysarvio; C on yleiseen vuosinettoviitteeseen perustuva vertailu, ei henkilökohtainen veropäätös.
- Jos 2027 arvoja ei ole vahvistettu, 2026 viite nimetään näkyvästi edellisen vuoden vertailuksi eikä 2027 ennusteeksi.

## Uuden vuoden julkaisuohje
1. Tarkista joulukuusta lähtien, onko Veronmaksajien uusi vuosi oikeasti julkaistu. Älä vaihda vuosilukua ennen todellisia lähdetietoja.
2. Tarkista käsitteiden vertailukelpoisuus: kunnallisvero, kirkollisvero, TyEL, työttömyysvakuutus, oletusvähennykset ja brutto/netto.
3. Varmista taulukkoaineiston uudelleenkäyttöoikeus ennen julkisen sovelluksen uutta datajulkaisua. Lähteen maininta ei yksin anna datan kopiointilupaa; tarvittaessa hanki lupa tai laske oma viite julkaistuista verosäännöistä.
4. Luo uusi vuosikohtainen datamoduuli; säilytä edellisen vuoden viite. Älä arvaa puuttuvia tuloluokkia.
5. Päivitä C:n vuositunniste, laskelmat, marginaalikäyrä, lähteet ja A/B/C-taulukot; pidä eri laskentamenetelmät erotettuina.
6. Testaa ainakin pieni/keskisuuri/suuri vuositulo, verotaite, interpolointi, tulorajan ulkopuoli, vuosivalinta ja mobiilileveydet 320/360/412 px.
7. Julkaise ensin erilliseen Betaan vihreällä CI:llä. Kirjaa lähteen vuosi, päiväys, oletukset ja käyttölupa. Älä muuta main-haaraa ilman erillistä julkaisupäätöstä.

## Muut palkkavähennykset Analyysissä
Viimeisimmän ristiriidattoman, neljä kyseistä palkkavähennyskoodia sisältävän palkkalaskelman koodien 90100, 90200, 90400 ja 90920 negatiivisten määrien summa suhteessa sen bruttopalkkaan. Ei koko vuoden keskiarvo, ei veroprosentti eikä yleinen C-viite.
