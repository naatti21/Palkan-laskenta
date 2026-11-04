# Vaihe 1: parikohtainen erottelusopimus

Pohja PR #42, 63959cf68d4092b665d757879f265387267245a6. RED: 235 PASS / 3 FAIL.

`resolution: confirmed-distinct` säilyy luettavana vanhana metatietona, mutta ei anna laskentalupaa. Vain `distinctFrom`-viittaus kyseiseen toiseen `payEventId`:hen todistaa parin erillisyyden. Päätös ei ole transitiivinen eikä valtuuta tulevia uusia maksuja. Vanhoja lippuja ei muuteta automaattisesti paripäätöksiksi, koska siitä puuttuu käyttäjän vahvistus.

Kolmen vanhan fixturen ansiosumma-/YTD-odotukset säilyvät. Niihin lisättiin oikea paripäätös; mitään testiä ei ohitettu. Uudet vastatestit todistavat vanhan lipun epävarmuuden, kolmannen tapahtuman rajauksen ja käyttäjän ratkaisun pysyvyyden vanhan backupin uusintapalautuksessa. PR #42:n sykli-, stale-dialogi-, numerovalidointi- ja offline-cache-testit säilyvät.

Portti vaiheeseen 2: koko Node-, E2E-, Beta- ja staging-sarjan on läpäistävä tällä haaralla. Fyysinen laite ja asennetun PWA:n kahden version päivitys eivät ole selainemulaation todistamia.
