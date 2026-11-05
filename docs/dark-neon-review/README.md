# Dark Neon Precision — visuaalinen katselmus

Vasemmalla on vaiheen 2 hyväksytty Beta (91dba46), oikealla UI-ehdokas. Jokainen pari näyttää saman synteettisen palkkahistorian, näkymän ja mobiilileveyden. Kuvat ovat selaimen näkymästä 840 pikselin korkeudelta.

| Näkymä | Kapea puhelin | Leveä puhelin |
|---|---|---|
| Seuranta | [360 px](tracking-360.webp) | [412 px](tracking-412.webp) |
| Historia | [360 px](history-360.webp) | [412 px](history-412.webp) |
| Analyysi | [360 px](analysis-360.webp) | [412 px](analysis-412.webp) |
| Laskuri | [360 px](calculator-360.webp) | [412 px](calculator-412.webp) |
| PDF-ristiriita | [360 px](conflict-360.webp) | [412 px](conflict-412.webp) |

Seurannassa netto erottuu mintulla ja verokortin käyttö ohuella syaanilla palkilla. Historia näyttää maksupäivän, tulolähteen ja nettosumman tiiviimmällä rivillä. Analyysissä matalat kortit antavat tilaa kuukausien vertailulle. Laskurin upotus käyttää samoja värejä ja kosketuskokoja kuin pääsovellus. PDF-ristiriidassa korvaaminen ja erillisenä säilyttäminen erottuvat sekä painiketekstistä että väristä.

## Tarkistus

- Tarkistetut leveydet olivat 320, 360 ja 412 px. Viidessä näkymässä vaakaylivuoto oli 0 px, myös Laskurin sisällä.
- Viisi välilehteä ovat 44 px korkeita kaikilla kolmella leveydellä. Tarkistettujen pääikkunan näkyvien säädinten pienin hyväksytty koko oli 24 × 24 px.
- Chromiumissa ajetut axe-core-tarkistukset (color-contrast ja target-size) eivät löytäneet rikkomuksia viidessä 360 px näkymässä tai upotetussa Laskurissa. Tarkistus koskee mitattuja tiloja.
- Kuvat otettiin reduced-motion-asetuksella. Synteettinen ristiriita syntyy oikean PDF-tuonnin kautta. Lähdekoodi toistoon on scripts/qa/precision-review.mjs.

| Teksti kohotetulla pinnalla (#111923) | Kontrastisuhde |
|---|---:|
| Pääteksti | 16.04:1 |
| Toissijainen teksti | 8.72:1 |
| Minttu | 14.08:1 |
| Syaani | 12.37:1 |
| Varoitus | 7.38:1 |
