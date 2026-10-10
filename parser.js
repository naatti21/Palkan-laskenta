const MONEY_RE = String.raw`-?\d[\d\s\u00A0]*,\d{2}`;
const DECIMAL_RE = String.raw`-?\d+(?:[\s\u00A0]\d{3})*(?:,\d+)?`;

export function fiNumber(value) {
  if (value == null || value === "") return null;
  const cleaned = String(value)
    .replace(/\u00A0/g, " ")
    .replace(/[€%]/g, "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function isoDate(fiDate) {
  if (!fiDate) return null;
  const m = String(fiDate).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;

  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function cleanText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[\t]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function textLines(text) {
  return text.split("\n").map(line => line.trim()).filter(Boolean);
}

function matchOne(text, regexes, transform = x => x) {
  for (const regex of regexes) {
    const m = text.match(regex);
    if (m) return transform(m[1], m);
  }
  return null;
}

function allNumbersAfterLabel(text, labelRegex) {
  const values = [];
  const regex = new RegExp(`${labelRegex.source}\\s+(${MONEY_RE})`, "gi");
  for (const m of text.matchAll(regex)) values.push(fiNumber(m[1]));
  return values.filter(v => v != null);
}

function numbersInLine(line) {
  return [...String(line || "").matchAll(new RegExp(DECIMAL_RE, "g"))]
    .map(m => fiNumber(m[0]))
    .filter(v => v != null);
}

function lineAfter(lines, predicate) {
  const index = lines.findIndex(predicate);
  return index >= 0 ? (lines[index + 1] || "") : "";
}

function codeUnits(text, code, labelPattern) {
  return matchOne(text, [
    new RegExp(`${code}\\s+${labelPattern}\\s+(${DECIMAL_RE})`, "i")
  ], fiNumber);
}

function codeLastMoney(text, code, labelPattern) {
  const line = matchOne(text, [
    new RegExp(`(${code}\\s+${labelPattern}[^\\n]*)`, "i")
  ]);
  if (!line) return null;
  const nums = [...line.matchAll(new RegExp(MONEY_RE, "g"))].map(m => fiNumber(m[0])).filter(v => v != null);
  return nums.length ? nums.at(-1) : null;
}

function uniqueMoneyValues(values) {
  return [...new Map(
    values.filter(value => value != null).map(value => [Number(value).toFixed(2), value])
  ).values()];
}

function sectionMoneyCandidates(text, sectionPattern, labelPattern) {
  const sectionStart = text.search(sectionPattern);
  if (sectionStart < 0) return [];

  const tail = text.slice(sectionStart);
  const nextSection = tail.slice(1).search(/\n\s*Kertymä\s+(?:vuoden alusta|edelliseltä vuodelta|palkkakaudelta)\b/i);
  const section = nextSection >= 0 ? tail.slice(0, nextSection + 1) : tail;
  return uniqueMoneyValues(allNumbersAfterLabel(section, labelPattern));
}

function sectionMoney(text, sectionPattern, labelPattern) {
  return sectionMoneyCandidates(text, sectionPattern, labelPattern)[0] ?? null;
}

function inferUnlabeledTaxablePair(values) {
  const all = values.filter(value => value != null);
  const unique = uniqueMoneyValues(all);

  if (all.length >= 2 && unique.length === 1) {
    return { grossPay: unique[0], ytdTaxableIncome: unique[0] };
  }

  if (unique.length !== 2) return { grossPay: null, ytdTaxableIncome: null };
  const sorted = [...unique].sort((a, b) => a - b);
  if (sorted[0] * 2 > sorted[1]) return { grossPay: null, ytdTaxableIncome: null };
  return { grossPay: sorted[0], ytdTaxableIncome: sorted[1] };
}

function moneyInNearbySection(text, sectionPattern, labelPattern, maxChars = 900) {
  const sectionStart = text.search(sectionPattern);
  if (sectionStart < 0) return null;
  const section = text.slice(sectionStart, sectionStart + maxChars);
  return matchOne(section, [new RegExp(`${labelPattern.source}\\s+(${MONEY_RE})`, "i")], fiNumber);
}


function withholdingRows(text) {
  return text.split("\n")
    .map(line => line.trim())
    .filter(line => /^90000\s+Ennakonpidätys\b/i.test(line));
}

function taxCardAccumulationFromWithholdingRows(text, grossPay, ytdTaxableIncome) {
  const allCandidates = [];
  const plausibleCandidates = [];

  for (const line of withholdingRows(text)) {
    const values = [...line.matchAll(new RegExp(MONEY_RE, "g"))]
      .map(match => fiNumber(match[0]))
      .filter(value => value != null && value > 0);

    for (const value of values) {
      allCandidates.push(value);

      if (ytdTaxableIncome != null && value > ytdTaxableIncome * 1.10) continue;
      if (
        grossPay != null &&
        ytdTaxableIncome != null &&
        ytdTaxableIncome > grossPay * 2 &&
        value < grossPay * 0.5
      ) continue;
      plausibleCandidates.push(value);
    }
  }

  if (plausibleCandidates.length) return Math.max(...plausibleCandidates);
  return allCandidates.length ? Math.max(...allCandidates) : null;
}

function field(value, confidence, source, diagnostics = {}) {
  return { value, confidence: value == null ? 0 : confidence, source, ...diagnostics };
}

const CODE_CATEGORY = new Map([
  ["20040", "overtime_100_daily"], ["1220", "overtime_100_daily"],
  ["20050", "overtime_50_weekly"], ["1230", "overtime_50_weekly"],
  ["20060", "overtime_100_weekly"], ["1240", "overtime_100_weekly"],
  ["20110", "sunday"], ["1100", "sunday"],
  ["20120", "weekly_rest"], ["1600", "weekly_rest"],
  ["20511", "worktime_bank_use"],
  ["20512", "worktime_bank_add"],
  ["3040", "piecework"],
  ["4020", "evening"],
  ["4200", "worktime_flex"],
  ["4600", "incentive"],
  ["5351", "worktime_reduction"],
  ["90000", "withholding"], ["8000", "withholding"],
  ["8100", "pension"], ["8200", "unemployment_insurance"],
  ["8400", "union_fee"], ["8800", "sickness_fund"]
]);

function normalizePayLineCategory(label, code = "") {
  if (CODE_CATEGORY.has(String(code))) return CODE_CATEGORY.get(String(code));
  const s = String(label || "").toLocaleLowerCase("fi-FI");
  if (/(?:ylityö|\byt\b)/.test(s) && /100/.test(s) && /vrk/.test(s)) return "overtime_100_daily";
  if (/(?:ylityö|\byt\b)/.test(s) && /50/.test(s) && /vko/.test(s)) return "overtime_50_weekly";
  if (/(?:ylityö|\byt\b)/.test(s) && /100/.test(s) && /vko/.test(s)) return "overtime_100_weekly";
  if (/(?:ylityö|\byt\b)/.test(s) && /50/.test(s)) return "overtime_50";
  if (/(?:ylityö|\byt\b)/.test(s) && /100/.test(s)) return "overtime_100";
  if (/sunnuntai/.test(s)) return "sunday";
  if (/viikkovapaa|viikkolepo/.test(s)) return "weekly_rest";
  if (/työaikapank/.test(s) && /käytt/.test(s)) return "worktime_bank_use";
  if (/työaikapank/.test(s) && /lisä|siirto|pankkiin/.test(s)) return "worktime_bank_add";
  if (/työajan jousto/.test(s)) return "worktime_flex";
  if (/palkkiotyö|urakka/.test(s)) return "piecework";
  if (/palkkio|bonus|tulos/.test(s)) return "incentive";
  if (/iltalisä|iltavuoro|\bilta\b/.test(s)) return "evening";
  if (/yölisä|\byö\b/.test(s)) return "night";
  if (/lomaraha/.test(s)) return "holiday_bonus";
  if (/lomapalk/.test(s)) return "holiday_pay";
  if (/ennakonpidätys/.test(s)) return "withholding";
  if (/tyel|eläke/.test(s)) return "pension";
  if (/työttömyys/.test(s)) return "unemployment_insurance";
  if (/liitto|jäsenmaks/.test(s)) return "union_fee";
  if (/sairaus/.test(s)) return "sickness_fund";
  return "unknown";
}

function parsePayLines(text) {
  const lines = [];
  const numberToken = String.raw`-?\d+(?:[ \u00A0]\d{3})*(?:,\d+)?`;
  const rowRegex = new RegExp(`^(\\d{4,6})\\s+(.+?)\\s+(${numberToken})(?:\\s+(${numberToken}))?(?:\\s+(${numberToken}))?$`);

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const m = line.match(rowRegex);
    if (!m) continue;

    const code = m[1];
    const label = m[2].trim();
    const numbers = [m[3], m[4], m[5]].filter(Boolean).map(fiNumber).filter(v => v != null);
    if (!label || !numbers.length) continue;

    const category = normalizePayLineCategory(label, code);
    let quantity = null;
    let unitPrice = null;
    let amount = null;

    if (category === "withholding") {
      amount = numbers.at(-1) ?? null;
    } else if (numbers.length >= 3) {
      quantity = numbers[0];
      unitPrice = numbers[numbers.length - 2];
      amount = numbers.at(-1);
    } else if (numbers.length === 2) {
      quantity = numbers[0];
      amount = numbers[1];
    } else {
      amount = numbers[0];
    }

    lines.push({
      code,
      label,
      category,
      quantity,
      unitType: quantity == null ? null : "unit",
      unitPrice,
      amount
    });
  }
  return lines;
}

function firstLine(lines, category) {
  return lines.find(line => line.category === category) || null;
}

function sumLineValues(lines, categories, key) {
  return lines
    .filter(line => categories.includes(line.category) && line[key] != null)
    .reduce((sum, line) => sum + Number(line[key]), 0);
}

function detectSourceProfile(text) {
  const legacyHeader = /\bPALKKAERITTELY\b/i.test(text);
  const legacyPayHeader = /Palkkaustiedot/i.test(text) && /\bYlityöh\/v\b/i.test(text);
  const legacySummaryRow = /Kauden tiedot\s+Ver\.al\.ans\s+Rahapalkka\s+Enn\.pid/i.test(text);
  if (legacyHeader && legacyPayHeader && legacySummaryRow) {
    return "legacy-table-fi-v1";
  }
  return "generic-text-pdf";
}

export function structureSignals(inputText) {
  const text = cleanText(inputText);
  const rules = [
    ["title:palkkalaskelma", /palkkalaskelma|palkkatodistus|palkanmaksun\s+yhteenveto/i],
    ["title:palkkaerittely", /palkkaerittely/i],
    ["label:palkkakausi", /palkkakausi|(?:^|\n)\s*jakso\b/im],
    ["label:maksupaiva", /maksupäivä|maksupvm|palkanmaksupäivä/i],
    ["section:kauden-tiedot", /kauden tiedot|veronalainen\s+(?:ansio|palkka)\s*\/\s*kausi/i],
    ["section:vuoden-tiedot", /vuoden[\s\S]{0,40}(?:al\.tiedot|vuoden alusta)|vuositulo\s+tähän\s+asti/i],
    ["label:ver-al-ans", /ver\.al\.ans|ennakonpid[^\n]{0,20}al\.\s*tul|veronalainen\s+(?:ansio|palkka)/i],
    ["label:ennakonpidatys", /ennakonpid/i],
    ["label:tuloraja", /tuloraja|vuosituloraja/i],
    ["section:erittely", /\berittely\b|palkan\s+osat/i]
  ];
  return rules.filter(([, re]) => re.test(text)).map(([key]) => key);
}

function parseLegacyTable(text, lines, payLines) {
  const periodWindow = text.slice(Math.max(0, text.search(/Palkkakausi/i)), Math.max(0, text.search(/Palkkakausi/i)) + 320);
  const periodDates = [...periodWindow.matchAll(/\d{1,2}\.\d{1,2}\.\d{4}/g)].map(m => isoDate(m[0]));
  const payDateWindowIndex = text.search(/Maksupvm/i);
  const payDateWindow = payDateWindowIndex >= 0 ? text.slice(payDateWindowIndex, payDateWindowIndex + 180) : "";
  const payDate = matchOne(payDateWindow, [/(\d{1,2}\.\d{1,2}\.\d{4})/], isoDate);

  const periodSummary = numbersInLine(lineAfter(lines, line => /Kauden tiedot/i.test(line) && /Maksetaan/i.test(line)));
  const grossPay = periodSummary[0] ?? null;
  const cashPay = periodSummary[1] ?? null;
  const withholdingPeriod = periodSummary[2] ?? null;
  const netPay = periodSummary.at(-1) ?? null;

  const yearRow = lineAfter(lines, line => /^Vuoden\b/i.test(line) && /Ver\.al\.ans/i.test(line));
  const yearSummary = numbersInLine(yearRow);
  const ytdTaxable = yearSummary[0] ?? null;
  const withholdingYtd = yearSummary[3] ?? null;

  const previousRow = lineAfter(lines, line => /Ed\.v\.ansio/i.test(line));
  const previousValues = numbersInLine(previousRow);
  const previousYearTaxable = previousValues.length >= 3 ? previousValues[2] : null;

  const taxInfo = matchOne(text, [/(\d+(?:,\d+)?)\s*\/\s*(\d+(?:,\d+)?)\s+([\d\s]+,\d{2})\s+/i], (base, m) => ({
    base: fiNumber(base), additional: fiNumber(m[2]), limit: fiNumber(m[3])
  }));

  const payHeaderValues = numbersInLine(lineAfter(lines, line => /Palkkaustiedot/i.test(line) && /\bKTA\b/i.test(line)));
  const kta = payHeaderValues.length >= 4 ? payHeaderValues[3] : null;
  const ppValues = numbersInLine(lineAfter(lines, line => /\bPP\b/i.test(line) && /Ylityöh\/v/i.test(line)));
  const pp = ppValues.length >= 3 ? ppValues[2] : null;

  const otDaily = firstLine(payLines, "overtime_100_daily")?.quantity ?? null;
  const ot50Weekly = firstLine(payLines, "overtime_50_weekly")?.quantity ?? null;
  const ot100Weekly = firstLine(payLines, "overtime_100_weekly")?.quantity ?? null;
  const overtimeCategories = ["overtime_100_daily", "overtime_50_weekly", "overtime_100_weekly", "overtime_50", "overtime_100"];
  const overtimeLines = payLines.filter(line => overtimeCategories.includes(line.category));
  const hasParsedEarningsLines = payLines.some(line => !["withholding", "pension", "unemployment_insurance", "union_fee", "sickness_fund"].includes(line.category));
  const overtimeHours = overtimeLines.length
    ? sumLineValues(payLines, overtimeCategories, "quantity")
    : hasParsedEarningsLines ? 0 : null;
  const overtimeCompensation = overtimeLines.length
    ? sumLineValues(payLines, overtimeCategories, "amount")
    : hasParsedEarningsLines ? 0 : null;

  return {
    payPeriodStart: field(periodDates[0] ?? null, 0.98, "Palkkakausi / legacy-taulukko"),
    payPeriodEnd: field(periodDates[1] ?? null, 0.98, "Palkkakausi / legacy-taulukko"),
    payDate: field(payDate, 0.98, "Maksupvm / legacy-taulukko"),
    grossPay: field(grossPay, 0.98, "Kauden tiedot → Ver.al.ans"),
    netPay: field(netPay, 0.98, "Kauden tiedot → Maksetaan"),
    ytdTaxableIncome: field(ytdTaxable, 0.98, "Vuoden al.tiedot → Ver.al.ans"),
    previousYearTaxableIncome: field(previousYearTaxable, 0.90, "Ed.v.ansio"),
    taxCardAccumulatedIncome: field(null, 0, "Kumul. ansion merkitys varmistetaan useammasta laskelmasta"),
    withholdingPeriod: field(withholdingPeriod, 0.96, "Kauden tiedot → Enn.pid"),
    withholdingYtd: field(withholdingYtd, 0.94, "Vuoden al.tiedot → Enn.pid"),
    taxRate: field(taxInfo?.base ?? null, 0.98, "Perus/lisä%"),
    taxLimit: field(taxInfo?.limit ?? null, 0.98, "Tuloraja/vv"),
    additionalRate: field(taxInfo?.additional ?? null, 0.98, "Perus/lisä%"),
    kta: field(kta, 0.96, "Palkkaustiedot → KTA"),
    pp: field(pp, 0.95, "Palkkaustiedot → PP"),
    overtime100DailyHours: field(otDaily, 0.98, "Palkkarivi / OT 100 % vrk"),
    overtime50WeeklyHours: field(ot50Weekly, 0.98, "Palkkarivi / OT 50 % vko"),
    overtime100WeeklyHours: field(ot100Weekly, 0.98, "Palkkarivi / OT 100 % vko"),
    overtimeHours: field(overtimeHours, 0.98, "Normalisoitujen OT-rivien summa"),
    overtimeCompensation: field(overtimeCompensation, 0.96, "Normalisoitujen OT-rivien summa"),
    sundayHours: field(firstLine(payLines, "sunday")?.quantity ?? null, 0.98, "Palkkarivi / sunnuntai"),
    weeklyRestHours: field(firstLine(payLines, "weekly_rest")?.quantity ?? null, 0.98, "Palkkarivi / viikkovapaa"),
    worktimeBankUseHours: field(firstLine(payLines, "worktime_bank_use")?.quantity ?? null, 0.90, "Palkkarivi / työaikapankki"),
    worktimeBankAddHours: field(firstLine(payLines, "worktime_bank_add")?.quantity ?? null, 0.90, "Palkkarivi / työaikapankki"),
    cashPay: field(cashPay, 0.96, "Kauden tiedot → Rahapalkka"),
    taxableBenefits: field(null, 0, "Ei tallenneta YTD-luontoisetua kauden etuna"),
    taxExemptBenefits: field(null, 0, "Ei vielä parseroitua lähdettä"),
    preTaxSalaryAdjustment: field(null, 0, "Ei vielä parseroitua lähdettä")
  };
}

function parseGeneric(text, payLines) {
  const period = matchOne(text, [
    /Palkkakausi(?:\s+\d{4}\/\d+)?\s+(\d{1,2}\.\d{1,2}\.\d{4})\s*[-–—]\s*(\d{1,2}\.\d{1,2}\.\d{4})/i,
    /(?:^|\n)\s*Jakso\s+(\d{1,2}\.\d{1,2}\.\d{4})\s*[-–—]\s*(\d{1,2}\.\d{1,2}\.\d{4})/im
  ], (start, m) => ({ start: isoDate(start), end: isoDate(m[2]) }));

  const payDate = matchOne(text, [
    /(?:Maksupäivä|Palkanmaksupäivä|Maksupvm)\s+(\d{1,2}\.\d{1,2}\.\d{4})/i
  ], isoDate);
  const netPayCandidates = allNumbersAfterLabel(
    text,
    /(?:Maksetaan|Käteen\s+maksettava|Nettopalkka|Netto)/i
  );
  const uniqueNetPayCandidates = [...new Map(
    netPayCandidates.map(value => [Number(value).toFixed(2), value])
  ).values()];
  const netPay = uniqueNetPayCandidates[0] ?? null;
  const netPayConflict = uniqueNetPayCandidates.length > 1;

  const taxable = allNumbersAfterLabel(text, /Ennakonpid(?:ä|\.)?\s*\.??\s*al\.??\s*tul(?:o)?/i);
  const periodSectionTaxable = moneyInNearbySection(text, /Kauden\s+tiedot/i, /Ver\.al\.ans/i);
  const yearSectionTaxable = moneyInNearbySection(text, /Vuoden\s+tiedot/i, /Ver\.al\.ans/i);
  const periodCumulativeCandidates = sectionMoneyCandidates(
    text,
    /Kertymä\s+palkkakaudelta/i,
    /Ennakonpid(?:ä|\.)?\s*\.??\s*al\.??\s*tul(?:o)?/i
  );
  const periodCumulativeTaxable = periodCumulativeCandidates[0] ?? null;
  const periodCumulativeConflict = periodCumulativeCandidates.length > 1;

  const yearCumulativeCandidates = sectionMoneyCandidates(
    text,
    /Kertymä\s+vuoden alusta/i,
    /Ennakonpid(?:ä|\.)?\s*\.??\s*al\.??\s*tul(?:o)?/i
  );
  const yearCumulativeTaxable = yearCumulativeCandidates[0] ?? null;
  const yearCumulativeConflict = yearCumulativeCandidates.length > 1;

  const previousYearCumulativeTaxable = sectionMoney(
    text,
    /Kertymä\s+edelliseltä vuodelta/i,
    /Ennakonpid(?:ä|\.)?\s*\.??\s*al\.??\s*tul(?:o)?/i
  );
  const explicitGrossPay = matchOne(text, [
    new RegExp(`(?:Veronalainen\\s+(?:palkka|ansio)(?:\\s*\\/\\s*kausi|\\s+palkkakaudelta)?|Kauden\\s+veronalainen\\s+(?:palkka|ansio))\\s+(${MONEY_RE})`, "i"),
    new RegExp(`(?:^|\\n)\\s*Ver\\.al\\.ans\\s+(${MONEY_RE})`, "im")
  ], fiNumber);
  const explicitYtdTaxable = matchOne(text, [
    new RegExp(`(?:Vuositulo\\s+tähän\\s+asti|Veronalainen\\s+(?:YTD|vuoden\\s+alusta)|Vuoden\\s+veronalainen\\s+(?:tulo|ansio))\\s+(${MONEY_RE})`, "i")
  ], fiNumber);
  const explicitPreviousYearTaxable = matchOne(text, [
    new RegExp(`(?:Edellisen\\s+vuoden\\s+veronalainen\\s+(?:tulo|ansio)|Veronalainen\\s+edellinen\\s+vuosi)\\s+(${MONEY_RE})`, "i")
  ], fiNumber);

  const semanticallyAttributed = new Set(
    [periodSectionTaxable, periodCumulativeTaxable, yearSectionTaxable, yearCumulativeTaxable, previousYearCumulativeTaxable, explicitGrossPay, explicitYtdTaxable, explicitPreviousYearTaxable]
      .filter(value => value != null)
      .map(value => Number(value).toFixed(2))
  );
  const unattributedTaxable = taxable.filter(
    value => !semanticallyAttributed.has(Number(value).toFixed(2))
  );
  const inferredUnlabeled = inferUnlabeledTaxablePair(
    semanticallyAttributed.size ? unattributedTaxable : taxable
  );

  const grossPay = periodSectionTaxable
    ?? periodCumulativeTaxable
    ?? explicitGrossPay
    ?? inferredUnlabeled.grossPay
    ?? null;
  const ytdTaxable = yearSectionTaxable
    ?? yearCumulativeTaxable
    ?? explicitYtdTaxable
    ?? inferredUnlabeled.ytdTaxableIncome
    ?? null;
  const previousYearTaxable = explicitPreviousYearTaxable
    ?? previousYearCumulativeTaxable
    ?? null;

  const withholdingNegatives = [...text.matchAll(new RegExp(`Ennakonpidätys\\s+(-\\s*\\d[\\d\\s\\u00A0]*,\\d{2})`, "gi"))]
    .map(match => fiNumber(match[1]))
    .filter(value => value != null);
  const withholdingPeriod = sectionMoney(text, /Kertymä\s+palkkakaudelta/i, /Ennakonpidätys/i)
    ?? moneyInNearbySection(text, /Kauden\s+tiedot/i, /(?:Enn\.pid|Ennakonpidätys)/i)
    ?? withholdingNegatives[0]
    ?? null;
  const withholdingYtd = sectionMoney(text, /Kertymä\s+vuoden alusta/i, /Ennakonpidätys/i)
    ?? moneyInNearbySection(text, /Vuoden\s+tiedot/i, /(?:Enn\.pid|Ennakonpidätys)/i)
    ?? withholdingNegatives[1]
    ?? null;
  const explicitTaxCardAccumulation = matchOne(text, [
    new RegExp(`(?:Nykyisen\\s+)?Verokortin\\s+kertymä\\s+(${MONEY_RE})`, "i")
  ], fiNumber);
  const taxCardAccumulatedIncome = explicitTaxCardAccumulation
    ?? taxCardAccumulationFromWithholdingRows(text, grossPay, ytdTaxable);

  const combinedTaxRates = matchOne(text, [
    /Perus\/lisä\s*%?\s+(\d+(?:,\d+)?)\s*%?\s*\/\s*(\d+(?:,\d+)?)\s*%?/i
  ], (base, m) => ({ base: fiNumber(base), additional: fiNumber(m[2]) }));

  const taxRate = combinedTaxRates?.base ?? matchOne(text, [
    /Perusprosentti\s*\(\s*0\s*-\s*[\d\s]+,\d{2}\s*€?\s*\)\s*(\d+(?:,\d+)?)\s*%/i,
    /Prosentti1\s+(\d+(?:,\d+)?)\s*%/i,
    /Pidätysprosentti\s+(\d+(?:,\d+)?)\s*%/i
  ], fiNumber);
  const taxLimit = matchOne(text, [
    new RegExp(`Perusprosentti\\s*\\(\\s*0\\s*-\\s*(${MONEY_RE})\\s*€?\\s*\\)`, "i"),
    new RegExp(`Tuloraja(?:\\/vv)?\\s+(${MONEY_RE})`, "i"),
    new RegExp(`Vuosituloraja\\s+(${MONEY_RE})`, "i")
  ], fiNumber);
  const additionalRate = combinedTaxRates?.additional ?? matchOne(text, [
    /Lisäprosentti\s+(\d+(?:,\d+)?)\s*%/i,
    /Prosentti2\s+(\d+(?:,\d+)?)\s*%/i
  ], fiNumber);

  const kta = matchOne(text, [/(?:^|\n)\s*KTA\s+(\d+(?:,\d+)?)/im], fiNumber);
  const pp = matchOne(text, [/(?:^|\n|\s)PP\s+(\d+(?:,\d+)?)/im], fiNumber);

  const otDaily = firstLine(payLines, "overtime_100_daily")?.quantity ?? codeUnits(text, "20040", "Ylityö\\s+100\\s*%\\s*vrk");
  const ot50Weekly = firstLine(payLines, "overtime_50_weekly")?.quantity ?? codeUnits(text, "20050", "Ylityö\\s+50\\s*%\\s*vko");
  const ot100Weekly = firstLine(payLines, "overtime_100_weekly")?.quantity ?? codeUnits(text, "20060", "Ylityö\\s+100\\s*%\\s*vko");
  const overtimeCategories = ["overtime_100_daily", "overtime_50_weekly", "overtime_100_weekly", "overtime_50", "overtime_100"];
  const overtimeLines = payLines.filter(line => overtimeCategories.includes(line.category));
  const hasParsedEarningsLines = payLines.some(line => !["withholding", "pension", "unemployment_insurance", "union_fee", "sickness_fund"].includes(line.category));
  const overtimeHours = overtimeLines.length
    ? sumLineValues(payLines, overtimeCategories, "quantity")
    : hasParsedEarningsLines ? 0 : null;
  const overtimeCompensation = overtimeLines.length
    ? sumLineValues(payLines, overtimeCategories, "amount")
    : hasParsedEarningsLines ? 0 : null;

  const cashPay = matchOne(text, [new RegExp(`(?:Rahapalkka|Käteispalkka)\\s+(${MONEY_RE})`, "i")], fiNumber);

  return {
    payPeriodStart: field(period?.start ?? null, 0.99, "Palkkakausi"),
    payPeriodEnd: field(period?.end ?? null, 0.99, "Palkkakausi"),
    payDate: field(payDate, 0.99, "Maksupäivä / palkanmaksupäivä"),
    grossPay: field(
      grossPay,
      periodCumulativeConflict ? 0.50 : 0.97,
      periodCumulativeConflict ? "Ristiriitaiset veronalaiset ansiot / palkkakausi" : "Veronalainen ansio / palkkakausi",
      periodCumulativeConflict ? { conflict: true, candidates: periodCumulativeCandidates } : {}
    ),
    netPay: field(
      netPay,
      netPayConflict ? 0.50 : 0.99,
      netPayConflict ? "Ristiriitaiset Maksetaan / netto -arvot" : "Maksetaan / netto",
      netPayConflict ? { conflict: true, candidates: uniqueNetPayCandidates } : {}
    ),
    ytdTaxableIncome: field(
      ytdTaxable,
      yearCumulativeConflict ? 0.50 : 0.96,
      yearCumulativeConflict ? "Ristiriitaiset veronalaiset ansiot / vuoden alusta" : "Veronalainen ansio / vuoden alusta",
      yearCumulativeConflict ? { conflict: true, candidates: yearCumulativeCandidates } : {}
    ),
    previousYearTaxableIncome: field(previousYearTaxable, 0.85, "Veronalainen ansio / edellinen vuosi"),
    taxCardAccumulatedIncome: field(taxCardAccumulatedIncome, 0.97, "Verokortin kertymä / 90000 Ennakonpidätys"),
    withholdingPeriod: field(withholdingPeriod, 0.95, "Ennakonpidätys / palkkakausi"),
    withholdingYtd: field(withholdingYtd, 0.90, "Ennakonpidätys / vuoden alusta"),
    taxRate: field(taxRate, 0.98, "Perusprosentti / Prosentti1"),
    taxLimit: field(taxLimit, 0.98, "Tuloraja"),
    additionalRate: field(additionalRate, 0.98, "Lisäprosentti / Prosentti2"),
    kta: field(kta, 0.98, "KTA"),
    pp: field(pp, 0.95, "PP"),
    overtime100DailyHours: field(otDaily, 0.99, "OT 100 % vrk"),
    overtime50WeeklyHours: field(ot50Weekly, 0.99, "OT 50 % vko"),
    overtime100WeeklyHours: field(ot100Weekly, 0.99, "OT 100 % vko"),
    overtimeHours: field(overtimeHours, 0.99, "Normalisoitujen OT-rivien summa"),
    overtimeCompensation: field(overtimeCompensation, 0.95, "Normalisoitujen OT-rivien summa"),
    sundayHours: field(firstLine(payLines, "sunday")?.quantity ?? codeUnits(text, "20110", "Sunnuntaityö"), 0.99, "Sunnuntaityö"),
    weeklyRestHours: field(firstLine(payLines, "weekly_rest")?.quantity ?? codeUnits(text, "20120", "Viikkovapaakorvaus"), 0.99, "Viikkovapaa"),
    worktimeBankUseHours: field(firstLine(payLines, "worktime_bank_use")?.quantity ?? codeUnits(text, "20511", "Työaikapankista\\s+käyttö"), 0.99, "Työaikapankki / käyttö"),
    worktimeBankAddHours: field(firstLine(payLines, "worktime_bank_add")?.quantity ?? codeUnits(text, "20512", "Työaikapankin\\s+lisäys"), 0.99, "Työaikapankki / lisäys"),
    cashPay: field(cashPay, 0.85, "Rahapalkka"),
    taxableBenefits: field(null, 0, "Ei vielä parseroitua lähdettä"),
    taxExemptBenefits: field(null, 0, "Ei vielä parseroitua lähdettä"),
    preTaxSalaryAdjustment: field(null, 0, "Ei vielä parseroitua lähdettä")
  };
}

function documentSignals(text) {
  const signals = [
    /palkkalaskelma|palkkatodistus|palkkaerittely|palkanmaksun\s+yhteenveto/i,
    /palkkakausi|(?:^|\n)\s*jakso\b/im,
    /maksupäivä|maksupvm|palkanmaksupäivä/i,
    /maksetaan|käteen\s+maksettava|nettopalkka|kauden tiedot/i,
    /ennakonpid|veronalainen\s+(?:ansio|palkka)|vuositulo\s+tähän\s+asti/i,
    /tuloraja|vuosituloraja|perusprosentti|pidätysprosentti|prosentti1|perus\/lisä%/i
  ];
  return signals.filter(re => re.test(text)).length;
}

export function parsePayslip(inputText) {
  const text = cleanText(inputText);
  const lines = textLines(text);
  const payLines = parsePayLines(text);
  const sourceProfile = detectSourceProfile(text);
  const fields = sourceProfile === "legacy-table-fi-v1"
    ? parseLegacyTable(text, lines, payLines)
    : parseGeneric(text, payLines);

  const required = ["payDate", "grossPay", "netPay", "ytdTaxableIncome"];
  const requiredFound = required.filter(k => fields[k]?.value != null).length;
  const overallConfidence = requiredFound / required.length;
  const signals = documentSignals(text);
  const documentType = requiredFound >= 3 || (signals >= 3 && requiredFound >= 2) ? "payslip" : "unknown";
  const notices = validate(fields);

  return {
    documentType,
    parserVersion: "0.4.4",
    sourceProfile,
    fields,
    payLines,
    overallConfidence,
    signals,
    structureSignals: structureSignals(text),
    notices,
    warnings: notices.map(n => n.message)
  };
}

export function validate(fields) {
  const notices = [];
  const v = k => fields[k]?.value;

  if (fields.grossPay?.conflict) {
    notices.push({
      level: "blocking", code: "gross-pay-conflict",
      message: "Palkkalaskelmasta löytyi useita eri kauden bruttoarvoja. Valitse oikea arvo ennen tallennusta.",
      fields: ["grossPay"]
    });
  }

  if (fields.ytdTaxableIncome?.conflict) {
    notices.push({
      level: "blocking", code: "ytd-taxable-conflict",
      message: "Palkkalaskelmasta löytyi useita eri vuoden kertymän arvoja. Valitse oikea arvo ennen tallennusta.",
      fields: ["ytdTaxableIncome"]
    });
  }

  if (fields.netPay?.conflict) {
    notices.push({
      level: "blocking", code: "net-pay-conflict",
      message: "Palkkalaskelmasta löytyi useita eri nettoarvoja. Valitse oikea arvo ennen tallennusta.",
      fields: ["netPay"]
    });
  }

  if (v("payPeriodStart") != null && v("payPeriodEnd") != null && v("payPeriodStart") > v("payPeriodEnd")) {
    notices.push({
      level: "blocking", code: "pay-period-reversed",
      message: "Palkkakauden loppupäivä on ennen alkupäivää — tarkista kausi.",
      fields: ["payPeriodStart", "payPeriodEnd"]
    });
  }

  if (v("grossPay") != null && v("netPay") != null && v("netPay") > v("grossPay")) {
    notices.push({
      level: "blocking", code: "net-greater-than-gross",
      message: "Nettopalkka on bruttopalkkaa suurempi — tarkista tulkinta.",
      fields: ["grossPay", "netPay"]
    });
  }

  if (v("taxLimit") != null && v("ytdTaxableIncome") != null && v("taxCardAccumulatedIncome") == null) {
    notices.push({
      level: "notice", code: "tax-card-accumulation-missing",
      message: "Tuloraja löytyi, mutta verokortin omaa kertymää ei löytynyt. Tulorajaa ei verrata koko vuoden YTD-tuloon.",
      fields: ["taxCardAccumulatedIncome", "taxLimit", "ytdTaxableIncome"]
    });
  }

  if (
    v("taxCardAccumulatedIncome") != null &&
    v("grossPay") != null &&
    v("ytdTaxableIncome") != null &&
    v("ytdTaxableIncome") > v("grossPay") * 2 &&
    v("taxCardAccumulatedIncome") < v("grossPay") * 0.5
  ) {
    notices.push({
      level: "blocking", code: "tax-card-accumulation-suspiciously-low",
      message: "Verokortin kertymäksi löytyi poikkeuksellisen pieni arvo suhteessa tämän jakson palkkaan. Tarkista kertymä ennen kuin sitä käytetään tulorajan seurantaan.",
      fields: ["taxCardAccumulatedIncome"]
    });
  }

  if (v("overtimeHours") != null && v("overtimeHours") > 100) {
    notices.push({
      level: "blocking", code: "overtime-unusually-high",
      message: "Ylityötunteja löytyi yli 100 h yhdeltä jaksolta — tarkista tulkinta.",
      fields: ["overtime100DailyHours", "overtime50WeeklyHours", "overtime100WeeklyHours", "overtimeHours"]
    });
  } else if (v("overtimeHours") != null && v("overtimeHours") > 80) {
    notices.push({
      level: "notice", code: "overtime-high",
      message: "Ylityötunteja löytyi yli 80 h yhdeltä jaksolta. Arvo tallennettiin, mutta se kannattaa huomioida poikkeavana jaksona.",
      fields: ["overtimeHours"]
    });
  }

  if (v("taxCardAccumulatedIncome") != null && v("taxLimit") != null && v("taxCardAccumulatedIncome") > v("taxLimit") * 1.5) {
    notices.push({
      level: "notice", code: "tax-card-accumulation-high",
      message: "Verokortin kertymä on selvästi tulorajaa suurempi. Tämä voi liittyä verokortin vaihtumiseen tai palkkalaskelman esitystapaan.",
      fields: ["taxCardAccumulatedIncome", "taxLimit"]
    });
  }

  return notices;
}

export function plainRecord(parsed) {
  const out = {
    documentType: parsed.documentType,
    parserVersion: parsed.parserVersion,
    sourceProfile: parsed.sourceProfile,
    overallConfidence: parsed.overallConfidence,
    warnings: parsed.notices?.map(n => n.message) ?? parsed.warnings ?? [],
    payLines: parsed.payLines ?? []
  };
  for (const [key, meta] of Object.entries(parsed.fields)) out[key] = meta.value;
  return out;
}
