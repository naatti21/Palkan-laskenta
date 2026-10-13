# Palkka PWA — NOW

**Päivitetty:** 2026-10-13  
**Tila:** WAITING QA — PDF-tuonnin P0-04-korjauksen riippumaton hyväksyntä puuttuu  
**Repo:** https://github.com/naatti21/Palkan-laskenta  
**Tämä on operatiivinen tilannekortti.** Tarkista SHA:t, PR-keskustelut ja CI aina GitHubista ennen seuraavaa muutosta. Äppejä-projektin yhteinen `00_NOW.md` on kokonaiskuvaa varten; tekninen historia ja testinäyttö kuuluvat PR:iin.

## Varmennettu pohja

- **Tuotanto / main:** `607a74a7334ce7130cb1261c009c08056c9e3b6d` — tämän työpaketin korjauksia ei ole yhdistetty tai julkaistu.
- **Develop:** `f497226515f54ec165da4b776a596334c4268111` — alkuperäinen PDF-tuonnin työhaara; [PR #1](https://github.com/naatti21/Palkan-laskenta/pull/1) yhä Draft.
- **Uusin PDF-korjaus:** [Draft PR #13](https://github.com/naatti21/Palkan-laskenta/pull/13), HEAD `550c765413c0916259c67b44ba8dfdb9b3f06da6`, base [Draft PR #12](https://github.com/naatti21/Palkan-laskenta/pull/12) `6b2ecf03763a022d1581ea30c4d42da5136adfd0`.
- **Riippumaton QA #4:** PR #12:lle [NO-GO / PDF-P0-04](https://github.com/naatti21/Palkan-laskenta/pull/12#issuecomment-6144724495) — kahden sivun rinnakkaisesta kertymätaulukosta toisen sivun ristiriitainen YTD katosi ja aiempi arvo tallentui automaattisesti.
- **PR #13:n kehittäjätestit:** [Actions 38392784936](https://github.com/naatti21/Palkan-laskenta/actions/runs/38392784936) — Node 105/105, Chromium 42/42, paikallinen staging 4/4 PASS. [RED→GREEN ja QA-handoff](https://github.com/naatti21/Palkan-laskenta/pull/13#issuecomment-6144911006). Tämä **ei** ole riippumaton QA-GO.

## Muut avoimet työt

- [Draft PR #11](https://github.com/naatti21/Palkan-laskenta/pull/11): pankkisaldon tallennuksen ja backup-palautuksen kilpailutilanteen korjaus. Riippumaton GO koskee **vain P1-AR-01-korjausta** sen lukitulla SHA:lla `a5c4a8809222981e03fcf60476ce85bb7fccc89f`; se ei hyväksy koko integraatiota.
- [Draft PR #10](https://github.com/naatti21/Palkan-laskenta/pull/10): atomisen palautuksen aiemmalla SHA:lla oli NO-GO; #11 on sen korjausjälkeläinen.
- [Draft PR #8](https://github.com/naatti21/Palkan-laskenta/pull/8): pankkitoimintojen ja importin erillinen integraatio.
- [Draft PR #4](https://github.com/naatti21/Palkan-laskenta/pull/4): analytiikan Beta-ehdokas. Uutta PDF-tuontia ei pidä kytkeä päälle ennen riippumatonta hyväksyntää.
- Tuotanto-, Beta- ja julkinen staging-julkaisu ovat tämän kortin perusteella **ei-valtuutettuja**.

## ONE NEXT ACTION

**Riippumaton QA 5 PR #13:n täsmälliselle SHA:lle** `550c765413c0916259c67b44ba8dfdb9b3f06da6`. Testaa aito PDF.js → UI → IndexedDB → JSON-vienti → reload; erityisesti 42 000 / 43 000 YTD kahdella sivulla, taulukoiden käänteinen järjestys, identtiset toistot, puutteelliset lohkot, aiemmat P0:t ja käsin valitun korjauksen pysyvyys. Julkaise PASS/FAIL/PARTIAL/NOT RUN ja GO / NO-GO / INSUFFICIENT EVIDENCE [PR #13:n keskusteluun](https://github.com/naatti21/Palkan-laskenta/pull/13).

**SINULTA TARVITAAN:** käynnistä riippumaton QA 5, kun haluat jatkaa PDF-tuontia.  
**Älä yhdistä tai julkaise** ilman erillistä käyttäjän lupaa ja vaadittua QA-hyväksyntää.

## Keskustelunvaihdon ohje

Lue tämä lyhyt kortti, vahvista muuttuneet `main`/`develop`/PR HEAD -tiedot ja uusimmat QA-kommentit GitHubista. Jatka vain seuraavasta avoimesta työstä. Älä palauta vanhaa NO-GO-versiota hyväksytyksi, äläkä käy koko sovelluksen suunnittelua uudelleen läpi.
