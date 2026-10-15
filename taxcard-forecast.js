// Beta: tax-card progress and cautious estimate from observed payroll snapshots.
// No full-year YTD substitution: accumulation and limit must belong to one card.
const dayMs = 86400000;
const money = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const val = (record, field) => record?.values?.[field] ?? null;
function payday(iso) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!parts) return null;
  const t = Date.UTC(+parts[1], +parts[2] - 1, +parts[3]);
  const d = new Date(t);
  return d.getUTCFullYear() === +parts[1] && d.getUTCMonth() === +parts[2] - 1 &&
    d.getUTCDate() === +parts[3] ? t : null;
}
const formatDay = epoch => new Intl.DateTimeFormat('fi-FI', {
  timeZone: 'UTC', day: 'numeric', month: 'numeric', year: 'numeric'
}).format(new Date(epoch));
const formatMonth = epoch => new Intl.DateTimeFormat('fi-FI', {
  timeZone: 'UTC', month: 'long', year: 'numeric'
}).format(new Date(epoch));
const median = numbers => {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
function unchangedCard(a, b) {
  if (Math.abs(val(a, 'taxLimit') - val(b, 'taxLimit')) > .01) return false;
  for (const key of ['taxRate', 'additionalRate']) {
    const oldRate = money(val(a, key)), newRate = money(val(b, key));
    if (oldRate !== null && newRate !== null && Math.abs(oldRate - newRate) > .01) return false;
  }
  return true;
}
export function forecastTaxCardLimit(records, year, now = new Date()) {
  const slips = (records || []).filter(row => row && row.taxYear === year && row.kind !== 'forecast')
    .sort((a, b) => String(val(a, 'payDate') || '').localeCompare(String(val(b, 'payDate') || '')));
  const latest = slips.at(-1);
  const limit = money(val(latest, 'taxLimit'));
  const used = money(val(latest, 'taxCardAccumulatedIncome'));
  if (!latest || limit === null || limit <= 0 || used === null || used < 0) {
    return { valid: false, estimate: 'Tulorajan tai kortin kertymän tieto puuttuu.' };
  }
  const remaining = Math.max(0, limit - used);
  const result = { valid: true, limit, used, remaining, percent: Math.round(100 * used / limit),
    estimate: 'Ennusteeseen tarvitaan lisää saman verokortin palkkalaskelmia.',
    caveat: 'Kertymä ja tuloraja ovat viimeisimmästä palkkalaskelmasta, eivät koko vuoden yhdistettyjä verokortteja.' };
  if (used >= limit) {
    result.estimate = 'Tuloraja on jo saavutettu tai ylitetty.';
    return result;
  }
  if (year !== now.getFullYear()) {
    result.estimate = 'Valitulle vuodelle ei tehdä tulevaisuusennustetta.';
    return result;
  }
  const lastDate = payday(val(latest, 'payDate'));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  if (lastDate === null || today - lastDate > 45 * dayMs || lastDate - today > 40 * dayMs) {
    result.estimate = 'Ennuste vaatii tuoreen palkkalaskelman.';
    return result;
  }
  if (slips.filter(row => val(row, 'payDate') === val(latest, 'payDate')).length > 1) {
    result.estimate = 'Useita laskelmia samalla maksupäivällä — ennustetta ei arvata.';
    return result;
  }
  const gains = [], dayGaps = [];
  let newer = latest;
  for (let i = slips.length - 2; i >= 0 && gains.length < 4; i--) {
    const older = slips[i];
    const olderDate = payday(val(older, 'payDate'));
    const newerDate = payday(val(newer, 'payDate'));
    const olderUsed = money(val(older, 'taxCardAccumulatedIncome'));
    const gap = olderDate === null || newerDate === null ? NaN : (newerDate - olderDate) / dayMs;
    const increase = used === null || olderUsed === null ? NaN :
      money(val(newer, 'taxCardAccumulatedIncome')) - olderUsed;
    // Any reset, card difference, duplicate, large missing gap or invalid snapshot
    // ends the continuous segment. Never join the old card to the new one.
    if (!unchangedCard(older, newer) || olderUsed === null || olderUsed < 0 ||
        !Number.isFinite(gap) || gap < 5 || gap > 36 ||
        !Number.isFinite(increase) || increase <= 0) break;
    gains.push(increase);
    dayGaps.push(gap);
    newer = older;
  }
  if (gains.length < 2) return result;
  const gain = median(gains), interval = median(dayGaps);
  if (gain <= 0 || interval <= 0) return result;
  const fastDate = lastDate + Math.ceil(remaining / Math.max(...gains)) * Math.min(...dayGaps) * dayMs;
  const slowDate = lastDate + Math.ceil(remaining / Math.min(...gains)) * Math.max(...dayGaps) * dayMs;
  const expected = lastDate + Math.ceil(remaining / gain) * interval * dayMs;
  const endOfYear = Date.UTC(year, 0, 1) - dayMs;
  result.caveat = 'Arvio perustuu ' + gains.length + ' toteutuneeseen verokortin kertymämuutokseen. Ylityöt, lomarahat ja uusi verokortti voivat muuttaa ajankohtaa.';
  if (fastDate > endOfYear) {
    result.estimate = 'Nykyisen kehityksen perusteella tuloraja ei näytä ylittyvän tänä vuonna.';
  } else if (expected <= today) {
    result.estimate = 'Laskelmahistoria on vanhentunut suhteessa ennusteeseen. Lisää uusin palkka.';
  } else if (expected > endOfYear) {
    result.estimate = 'Ylitys on mahdollinen loppuvuonna, mutta ei varma.';
  } else if (Math.max(...gains) / Math.min(...gains) <= 1.2 &&
             Math.max(...dayGaps) - Math.min(...dayGaps) <= 3 &&
             slowDate - fastDate <= 16 * dayMs) {
    result.estimate = 'Arvioitu ylitysmaksu noin ' + formatDay(expected) + '.';
  } else {
    result.estimate = 'Arvioitu ylitysaika: ' + formatMonth(fastDate) +
      (formatMonth(fastDate) === formatMonth(slowDate) ? '.' : ' – ' + formatMonth(slowDate) + '.');
  }
  return result;
}
