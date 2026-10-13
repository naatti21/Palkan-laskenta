// Bounded, transient evidence for independently labeled taxable-income observations.
// Never store full source text or original PDFs in the payroll record.
const MONEY = "-?\\d[\\d\\s\\u00A0]*,\\d{2}";
const amount = raw => {
  const n = Number(String(raw).replace(/[\u00A0\s]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const moneyKey = value => Number(value).toFixed(2);
const explicitRules = [
  ["grossPay", new RegExp("(?:Veronalainen\\s+(?:palkka|ansio)\\s*(?:\\/\\s*kausi|palkkakaudelta)|Kauden\\s+veronalainen\\s+(?:palkka|ansio))\\s+(" + MONEY + ")", "gi")],
  ["ytdTaxableIncome", new RegExp("(?:Vuositulo\\s+tähän\\s+asti|Veronalainen\\s+(?:YTD|vuoden\\s+alusta)|Vuoden\\s+veronalainen\\s+(?:tulo|ansio))\\s+(" + MONEY + ")", "gi")],
  ["previousYearTaxableIncome", new RegExp("(?:Edellisen\\s+vuoden\\s+veronalainen\\s+(?:tulo|ansio)|Veronalainen\\s+edellinen\\s+vuosi)\\s+(" + MONEY + ")", "gi")]
];
const sectionHeader = /^\s*(?:Kauden\s+tiedot|Vuoden\s+tiedot|Kertymä\s+(?:palkkakaudelta|vuoden\s+alusta|edelliseltä\s+vuodelta))\b/i;
const sectionLabel = new RegExp("Ver\\.al\\.ans\\s+(" + MONEY + ")", "gi");
const cumulativeLabel = new RegExp("Ennakonpid(?:ä|\\.)?\\s*\\.??\\s*al\\.??\\s*tul(?:o)?\\s+(" + MONEY + ")", "gi");

export function collectTaxableEvidence(text, sourceLines = []) {
  const found = {grossPay: [], ytdTaxableIncome: [], previousYearTaxableIncome: []};
  const lines = String(text || "").split("\n");
  let active = null;
  const push = (role, raw, label, line) => {
    const value = amount(raw);
    if (value == null) return;
    const origin = sourceLines[line - 1] || {};
    const location = {value, label, line};
    for (const key of ["page", "x", "y", "width"]) {
      if (Number.isFinite(origin[key])) location[key] = origin[key];
    }
    found[role].push(location);
  };
  for (let index=0; index<lines.length; index++) {
    const line = lines[index];
    const header = line.match(sectionHeader)?.[0] || "";
    if (header) {
      if (/Kauden\s+tiedot|palkkakaudelta/i.test(header)) active = "grossPay";
      else if (/Vuoden\s+tiedot|vuoden\s+alusta/i.test(header)) active = "ytdTaxableIncome";
      else if (/edelliseltä\s+vuodelta/i.test(header)) active = "previousYearTaxableIncome";
    }
    // A parallel multi-column heading is not one unambiguous section.
    if ((line.match(/Kertymä\s+(?:palkkakaudelta|vuoden\s+alusta|edelliseltä\s+vuodelta)/gi) || []).length > 1)
      active = null;
    for (const [role,regex] of explicitRules) {
      regex.lastIndex = 0;
      for (const match of line.matchAll(regex)) push(role,match[1],"explicit",index+1);
    }
    if (active==="grossPay" || active==="ytdTaxableIncome") {
      sectionLabel.lastIndex = 0;
      for (const match of line.matchAll(sectionLabel)) push(active,match[1],"section",index+1);
    }
    if (active && !/Ver\.al\.ans/i.test(line)) {
      cumulativeLabel.lastIndex = 0;
      const matches = [...line.matchAll(cumulativeLabel)];
      if (matches.length===1) push(active,matches[0][1],"cumulative",index+1);
    }
  }
  return found;
}

// Shared resolver: differences across independently labeled observations always block.
export function resolveTaxableEvidence(role, found, supplement = []) {
  const observations = [...(found[role] || [])];
  for (const item of supplement) {
    if (typeof item === "number" && Number.isFinite(item))
      observations.push({value:item,label:"column-or-fallback"});
    else if (item && Number.isFinite(item.value)) observations.push(item);
  }
  const candidates = [...new Map(observations.map(o=>[moneyKey(o.value),o.value])).values()];
  return {
    conflict:candidates.length>1,
    candidates,
    checked:observations.length>0,
    // Retain bounded numeric/source evidence; never include text from a payslip.
    observations:observations.slice(0,48).map(({value,label,line,page,x,y,width})=>({
      value,label,...(line==null?{}:{line}),...(page==null?{}:{page}),
      ...(x==null?{}:{x}),...(y==null?{}:{y}),...(width==null?{}:{width})
    }))
  };
}
