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

function codeFirstAndLastMoney(text, code, labelPattern) {
  const line = matchOne(text, [
    new RegExp(`(${code}\\s+${labelPattern}[^\\n]*)`, "i")
  ]);
  if (!line) return { first: null, last: null };
  const nums = [...line.matchAll(new RegExp(MONEY_RE, "g"))].map(m => fiNumber(m[0])).filter(v => v != null);
  return { first: nums[0] ?? null, last: nums.at(-1) ?? null };
}

function field(value, confidence, source) {
  return { value, confidence: value == null ? 0 : confidence, source };
}

export function parsePayslip(inputText) {
  const text = cleanText(inputText);

  const period = matchOne(text, [
    /Palkkakausi(?:\s+\d{4}\/\d+)?\s+(\d{1,2}\.\d{1,2}\.\d{4})\s*-\s*(\d{1,2}\.\d{1,2}\.\d{4})/i
  ], (start, m) => ({ start: isoDate(start), end: isoDate(m[2]) }));

  const payDate = matchOne(text, [/Maksupäivä\s+(\d{1,2}\.\d{1,2}\.\d{4})/i], isoDate);
  const netPay = matchOne(text, [new RegExp(`Maksetaan\\s+(${MONEY_RE})`, "i")], fiNumber);

  const taxable = allNumbersAfterLabel(text, /Ennakonpid(?:ä|\.)?\s*\.??\s*al\.??\s*tul(?:o)?/i);
  const grossPay = taxable[0] ?? null;
  const ytdTaxable = taxable[1] ?? null;
  const previousYearTaxable = taxable[2] ?? null;

  const withholdingNegatives = [...text.matchAll(new RegExp(`Ennakonpidätys\\s+(-\\s*\\d[\\d\\s\\u00A0]*,\\d{2})`, "gi"))]
    .map(m => fiNumber(m[1]))
    .filter(v => v != null);
  const withholdingPeriod = withholdingNegatives[0] ?? null;
  const withholdingYtd = withholdingNegatives[1] ?? null;

  const cardRow = codeFirstAndLastMoney(text, "90000", "Ennakonpidätys");
  const taxCardAccumulatedIncome = cardRow.first;

  const taxRate = matchOne(text, [
    /Perusprosentti\s*\(\s*0\s*-\s*[\d\s]+,\d{2}\s*€?\s*\)\s*(\d+(?:,\d+)?)\s*%/i,
    /Prosentti1\s+(\d+(?:,\d+)?)\s*%/i
  ], fiNumber);

  const taxLimit = matchOne(text, [
    new RegExp(`Perusprosentti\\s*\\(\\s*0\\s*-\\s*(${MONEY_RE})\\s*€?\\s*\\)`, "i"),
    new RegExp(`Tuloraja\\s+(${MONEY_RE})`, "i")
  ], fiNumber);

  const additionalRate = matchOne(text, [
    /Lisäprosentti\s+(\d+(?:,\d+)?)\s*%/i,
    /Prosentti2\s+(\d+(?:,\d+)?)\s*%/i
  ], fiNumber);

  const kta = matchOne(text, [/(?:^|\n)\s*KTA\s+(\d+(?:,\d+)?)/im], fiNumber);
  const pp = matchOne(text, [/(?:^|\n|\s)PP\s+(\d+(?:,\d+)?)/im], fiNumber);

  const overtime100Daily = codeUnits(text, "20040", "Ylityö\\s+100\\s*%\\s*vrk");
  const overtime50Weekly = codeUnits(text, "20050", "Ylityö\\s+50\\s*%\\s*vko");
  const overtime100Weekly = codeUnits(text, "20060", "Ylityö\\s+100\\s*%\\s*vko");
  const sundayHours = codeUnits(text, "20110", "Sunnuntaityö");
  const weeklyRestHours = codeUnits(text, "20120", "Viikkovapaakorvaus");
  const bankUseHours = codeUnits(text, "20511", "Työaikapankista\\s+käyttö");
  const bankAddHours = codeUnits(text, "20512", "Työaikapankin\\s+lisäys");

  const overtimeComp = [
    codeLastMoney(text, "20040", "Ylityö\\s+100\\s*%\\s*vrk"),
    codeLastMoney(text, "20050", "Ylityö\\s+50\\s*%\\s*vko"),
    codeLastMoney(text, "20060", "Ylityö\\s+100\\s*%\\s*vko")
  ].filter(v => v != null).reduce((a, b) => a + b, 0);

  const totalOvertimeHours = [overtime100Daily, overtime50Weekly, overtime100Weekly]
    .filter(v => v != null)
    .reduce((a, b) => a + b, 0);

  const fields = {
    payPeriodStart: field(period?.start ?? null, 0.99, "Palkkakausi"),
    payPeriodEnd: field(period?.end ?? null, 0.99, "Palkkakausi"),
    payDate: field(payDate, 0.99, "Maksupäivä"),
    grossPay: field(grossPay, 0.97, "Ennakonpid. al. tul / palkkakausi"),
    netPay: field(netPay, 0.99, "Maksetaan"),
    ytdTaxableIncome: field(ytdTaxable, 0.96, "Ennakonpid. al. tul / vuoden alusta"),
    previousYearTaxableIncome: field(previousYearTaxable, 0.85, "Ennakonpid. al. tulo / edellinen vuosi"),
    taxCardAccumulatedIncome: field(taxCardAccumulatedIncome, 0.96, "90000 Ennakonpidätys"),
    withholdingPeriod: field(withholdingPeriod, 0.95, "Ennakonpidätys / palkkakausi"),
    withholdingYtd: field(withholdingYtd, 0.90, "Ennakonpidätys / vuoden alusta"),
    taxRate: field(taxRate, 0.98, "Perusprosentti / Prosentti1"),
    taxLimit: field(taxLimit, 0.98, "Tuloraja"),
    additionalRate: field(additionalRate, 0.98, "Lisäprosentti / Prosentti2"),
    kta: field(kta, 0.98, "KTA"),
    pp: field(pp, 0.95, "PP"),
    overtime100DailyHours: field(overtime100Daily, 0.99, "20040"),
    overtime50WeeklyHours: field(overtime50Weekly, 0.99, "20050"),
    overtime100WeeklyHours: field(overtime100Weekly, 0.99, "20060"),
    overtimeHours: field(totalOvertimeHours || null, 0.99, "OT-rivien summa"),
    overtimeCompensation: field(overtimeComp || null, 0.95, "OT-korvausrivien summa"),
    sundayHours: field(sundayHours, 0.99, "20110"),
    weeklyRestHours: field(weeklyRestHours, 0.99, "20120"),
    worktimeBankUseHours: field(bankUseHours, 0.99, "20511"),
    worktimeBankAddHours: field(bankAddHours, 0.99, "20512")
  };

  const required = ["payDate", "grossPay", "netPay", "ytdTaxableIncome"];
  const requiredFound = required.filter(k => fields[k].value != null).length;
  const overallConfidence = requiredFound / required.length;

  return {
    documentType: requiredFound >= 3 ? "payslip" : "unknown",
    parserVersion: "0.1.0",
    fields,
    overallConfidence,
    warnings: validate(fields)
  };
}

export function validate(fields) {
  const warnings = [];
  const v = k => fields[k]?.value;

  if (v("grossPay") != null && v("netPay") != null && v("netPay") > v("grossPay")) {
    warnings.push("Nettopalkka on bruttopalkkaa suurempi — tarkista tulkinta.");
  }
  if (v("taxLimit") != null && v("ytdTaxableIncome") != null && v("taxCardAccumulatedIncome") == null) {
    warnings.push("Tuloraja löytyi, mutta verokortin omaa kertymää ei löytynyt. Älä vertaa tulorajaa suoraan koko vuoden YTD-tuloon.");
  }
  if (v("overtimeHours") != null && v("overtimeHours") > 80) {
    warnings.push("Ylityötunteja löytyi yli 80 h yhdeltä jaksolta — tarkista kentät.");
  }
  if (v("taxCardAccumulatedIncome") != null && v("taxLimit") != null && v("taxCardAccumulatedIncome") > v("taxLimit") * 1.5) {
    warnings.push("Verokortin kertymä on selvästi tulorajaa suurempi — tarkista verokortin voimassaolo ja tulkinta.");
  }
  return warnings;
}

export function plainRecord(parsed) {
  const out = {
    documentType: parsed.documentType,
    parserVersion: parsed.parserVersion,
    overallConfidence: parsed.overallConfidence,
    warnings: parsed.warnings
  };
  for (const [key, meta] of Object.entries(parsed.fields)) out[key] = meta.value;
  return out;
}
