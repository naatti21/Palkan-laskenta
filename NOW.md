# Palkka PWA — NOW

**Päivitetty:** 2026-10-13
**Tila:** WAITING QA 6 — PDF-P0-05-korjauksen riippumaton hyväksyntä puuttuu
**Repo:** https://github.com/naatti21/Palkan-laskenta
**Operatiivinen tilannekortti, EI julkaisutodistus.** Tarkista GitHubin nykyinen HEAD, PR-kommentit ja Actions ennen jatkoa. Äppejä-projektin yhteinen `00_NOW.md` on yleiskuva; täsmällinen tekninen näyttö kuuluu repo-PR:iin.

## GitHubissa varmennettu tila 13.10.2026

- **Tuotanto / main:** `607a74a7334ce7130cb1261c009c08056c9e3b6d` — ei yhdistetty tämän ketjun PDF-/pankkikorjauksia.
- **Develop:** `f497226515f54ec165da4b776a596334c4268111` — erillinen PDF-tuonnin kehitystila, ei uudempien korjaus-PR:ien hyväksyntää.
- **PR #12** [PDF-P0-03](https://github.com/naatti21/Palkan-laskenta/pull/12) HEAD `6b2ecf03763a022d1581ea30c4d42da5136adfd0`: riippumaton QA 4 **NO-GO / PDF-P0-04**.
- **PR #13** [PDF-P0-04](https://github.com/naatti21/Palkan-laskenta/pull/13) HEAD `550c765413c0916259c67b44ba8dfdb9b3f06da6`: [riippumaton QA 5](https://github.com/naatti21/Palkan-laskenta/pull/13#issuecomment-6148408817) **NO-GO / uusi PDF-P0-05**. Täydellisten toistuvien taulukoiden alkuperäinen P0-04 läpäisi, mutta yhden YTD-otsikon alapuolella oleva kolmiosainen epäselvä jatkorivi katosi ja 42 000 tallentui automaattisesti.
- **Uusin kandidaat­ti: Draft PR #15** [PDF-P0-05-korjaus](https://github.com/naatti21/Palkan-laskenta/pull/15), tarkka HEAD `ea2dd6c83ca83f9c322716b18c0f892fa14be3af`, base **PR #13:n muuttumaton HEAD** `550c765413c0916259c67b44ba8dfdb9b3f06da6`. Erillinen P0-korjaushaara, ei mergeä.
- **PR #15 RED:** [Actions 38418745843](https://github.com/naatti21/Palkan-laskenta/actions/runs/38418745843), test-only `215eada336a486b9af2743edecb2326e5241fd26`: Node **108/109**, Chromium **42/43**; uusi P0-05 toistui.
- **PR #15 GREEN:** [Actions 38419153068](https://github.com/naatti21/Palkan-laskenta/actions/runs/38419153068), `completed/success` lukitulla HEADilla: Node **109/109 PASS**, Chromium/PDF.js **43/43 PASS**, paikallinen staging **4/4 PASS**. Tämä on **kehittäjän CI**, ei riippumaton GO.
- [Toteutushandoff ja QA 6 -toimeksianto](https://github.com/naatti21/Palkan-laskenta/pull/15#issuecomment-6148698550) on PR #15:ssa.

## Muut riippuvuudet

- [PR #11](https://github.com/naatti21/Palkan-laskenta/pull/11) pankkisaldon kilpailutilanteen korjaus sai aikaisemmin rajatun riippumattoman GO:n **vain P1-AR-01:n SHA:lle** `a5c4a8809222981e03fcf60476ce85bb7fccc89f`. Ei hyväksy koko pankki-/backup-/PDF-integraatiota.
- [PR #10](https://github.com/naatti21/Palkan-laskenta/pull/10) atominen restore; [PR #8](https://github.com/naatti21/Palkan-laskenta/pull/8) pankki/PDF-integraatio; [PR #4](https://github.com/naatti21/Palkan-laskenta/pull/4) Beta-analytiikka — kaikki erillisiä keskeneräisiä hyväksyntöjä.
- Julkiseen stagingiin, Betaan ja tuotantoon **ei tehty julkaisuja**. Paikallinen testistaging ei ole julkinen Cloudflare-staging.

## ONE NEXT ACTION — riippumaton QA 6

Käynnistä riippumaton QA 6 **Draft PR #15:n nykyiselle lukitulle SHA:lle** `ea2dd6c83ca83f9c322716b18c0f892fa14be3af`. Tehtävänanto löytyy [PR #15:n kommentista](https://github.com/naatti21/Palkan-laskenta/pull/15#issuecomment-6148698550).

Aloita QA 5:n täsmällisestä **PDF-P0-05**-fixtu­resta: täysi ensimmäinen kertymätaulukko YTD 42 000; seuraavalla sivulla yksi YTD-otsikko ja kolme nimettyä numerohavaintoa 43 000 / 3 500 / 55 000. **Odotus:** epäselvä lähde blokkaa automaattitallennuksen; raw IndexedDB ja JSON-vienti pysyvät tyhjinä ennen käyttäjän tietoista hyväksyntää. Testaa lisäksi yksisarakkeiset positiiviset kontrollit, rooliristiriidat, vanhat P0-regressiot, oikea PDF.js→UI→IDB→reload→backup/restore, käyttäjän valinta sekä synteettisen henkilötiedon suodattuminen. STOP_ON_P0/P1.

QA toimittaa tuloksen **PASS / FAIL / PARTIAL / NOT RUN** ja rajatun **GO TO USER ACCEPTANCE / NO-GO / INSUFFICIENT EVIDENCE** -päätöksen PR #15:n kommenttiin. Toteuttaja ei myönnä omaa riippumatonta GO:ta.

**SINULTA TARVITAAN:** käynnistä riippumaton QA 6, kun haluat jatkaa hyväksyntää. Koodien/tiedostojen manuaalista siirtelyä ei tarvita.

## Julkaisuraja ja keskustelunvaihto

**Ei mergeä, ei develop/main-päivitystä, ei Beta-/staging-/tuotantodeployta** ilman käyttäjän erillistä lupaa ja koko rajatun hyväksyntäketjun näyttöä. Uusi koodi ei korjaa takautuvasti jo aiemmin mahdollisesti virheellisesti tallennettuja tietoja; julkaisu-/migraatiopäätöksessä arvioidaan tämä erikseen.

Seuraavassa keskustelussa riittää: tarkista PR #15:n HEAD, QA 6 -kommentit ja CI; jatka yhdestä avoimesta työstä. Älä palauta PR #12:n tai #13:n NO-GO-taustaa hyväksytyksi. Tämä `NOW.md` on edelleen [Draft PR #14](https://github.com/naatti21/Palkan-laskenta/pull/14) -dokumentaatiohaarassa, ei mainissa.
