const money = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR" });
const monthName = new Intl.DateTimeFormat("fi-FI", { month: "long", year: "numeric", timeZone: "UTC" });
const preference = "palkka-beta-history-view";
let mode = "list";
try { if (localStorage.getItem(preference) === "calendar") mode = "calendar"; } catch {}
let year, month, selected;
let pendingJump = null;

function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

export function renderCalendar({ active, unresolved, selectedYear, history }) {
  const host = document.getElementById("ledgerCalendar");
  const rows = [...history.querySelectorAll(".history-row.payslip-item")];
  const payments = active.filter(r => r.values.payDate.startsWith(selectedYear + "-"));
  if (year !== selectedYear) {
    year = selectedYear;
    const last = payments.map(r => r.values.payDate).sort().at(-1);
    month = last ? Number(last.slice(5, 7)) : new Date().getMonth() + 1;
    selected = null;
  }

  function applyJump() {
    if (!pendingJump || !pendingJump.startsWith(String(year)+"-")) return;
    month = Number(pendingJump.slice(5,7));
    selected = pendingJump;
    mode = "calendar";
    try { localStorage.setItem(preference,mode); } catch {}
    pendingJump = null;
  }
  applyJump();

  function draw() {
    host.replaceChildren();
    for (const button of document.querySelectorAll("[data-ledger-mode]")) {
      button.setAttribute("aria-pressed", String(mode === button.dataset.ledgerMode));
      button.onclick = () => {
        mode = button.dataset.ledgerMode;
        try { localStorage.setItem(preference, mode); } catch {}
        draw();
      };
    }
    host.hidden = mode !== "calendar";
    rows.forEach(row => { row.hidden = false; });
    if (host.hidden) return;
    const prefix = year + "-" + String(month).padStart(2, "0");
    const monthRows = payments.filter(r => r.values.payDate.startsWith(prefix));
    const dates = monthRows.map(r => r.values.payDate);
    if (!dates.includes(selected)) selected = dates.slice().sort().at(-1);
    const first = new Date(Date.UTC(year, month - 1, 1));
    const heading = element("div", "");
    heading.className = "ledger-month";
    for (const delta of [-1, 1]) {
      const button = element("button", delta < 0 ? "‹" : "›");
      button.setAttribute("aria-label", delta < 0 ? "Edellinen kuukausi" : "Seuraava kuukausi");
      button.disabled = month + delta < 1 || month + delta > 12;
      button.onclick = () => { month += delta; selected = null; draw(); host.querySelector("h3")?.focus(); };
      if (delta === 1) {
        const title = element("h3", monthName.format(first));
        title.tabIndex = -1;
        heading.append(title);
      }
      heading.append(button);
    }
    host.append(heading);
    const total = key => !monthRows.length || monthRows.some(r => !Number.isFinite(r.values[key]))
      ? null : monthRows.reduce((sum,r)=>sum+Math.round(r.values[key]*100),0)/100;
    const net = total("netPay"), gross = total("grossPay");
    const value = v => v===null ? (monthRows.length ? "Tieto puuttuu" : "Ei maksuja") : money.format(v);
    host.append(element("p","Kuukauden netto "+value(net)+" · brutto "+value(gross)));
    host.append(element("p","Toteutuneita palkkoja "+monthRows.length));
    if (month>1 && net!==null) {
      const previous = year+"-"+String(month-1).padStart(2,"0");
      const previousRows = payments.filter(r=>r.values.payDate.startsWith(previous));
      if (previousRows.length && previousRows.every(r=>Number.isFinite(r.values.netPay))) {
        const prevNet = previousRows.reduce((v,r)=>v+Math.round(r.values.netPay*100),0)/100;
        host.append(element("p","Neton muutos edelliseen maksukuukauteen "+
          (net>=prevNet?"+":"")+money.format(net-prevNet)));
      }
    }
    if (unresolved.length) host.append(element("p", "Historiassa on ratkaisemattomia tietoja. Tarkista ne listasta."));
    const grid = element("div", "");
    grid.className = "ledger-days";
    for (const name of ["ma","ti","ke","to","pe","la","su"]) grid.append(element("small", name));
    for (let i = 0; i < (first.getUTCDay() + 6) % 7; i++) grid.append(element("span", ""));
    const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let day = 1; day <= length; day++) {
      const iso = prefix + "-" + String(day).padStart(2, "0");
      const paid = dates.includes(iso);
      const cell = element(paid ? "button" : "span", String(day));
      if (paid) {
        cell.setAttribute("aria-pressed", String(selected === iso));
        cell.setAttribute("aria-label", day + "." + month + ". · Maksuja " + dates.filter(date => date === iso).length);
        cell.onclick = () => { selected = iso; draw(); host.querySelector(".ledger-days [aria-pressed=true]").focus(); };
      }
      grid.append(cell);
    }
    host.append(grid, element("h4", selected ? "Maksut " + Number(selected.slice(-2)) + "." + month + "." : "Ei toteutuneita maksuja"));
    rows.forEach(row => { row.hidden = !selected || row.dataset.ledgerDate !== selected; });
  }
  // Jump from the latest payment on the home screen without changing the
  // established navigation or the visual theme.
  if (host._ledgerJumpHandler) host.removeEventListener("ledger-jump",host._ledgerJumpHandler);
  host._ledgerJumpHandler = event => {
    const date = event.detail?.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return;
    pendingJump = date;
    if (pendingJump.startsWith(String(year)+"-")) {
      applyJump();
      draw();
    }
  };
  host.addEventListener("ledger-jump",host._ledgerJumpHandler);
  draw();
}
