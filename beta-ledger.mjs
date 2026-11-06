import { paymentState } from "./model.js";

const money = new Intl.NumberFormat("fi-FI", { style:"currency", currency:"EUR" });
const monthName = new Intl.DateTimeFormat("fi-FI", { month:"long", year:"numeric", timeZone:"UTC" });
const preference = "palkka-beta-history-view";
let mode = "calendar";
try { if (localStorage.getItem(preference) === "list") mode = "list"; } catch {}
let year, month, selected, focusDate;
const el = (tag, text="", className="") => {
  const item = document.createElement(tag);
  item.textContent = text;
  if (className) item.className = className;
  return item;
};
const sum = (rows,key) => !rows.length || rows.some(r => !Number.isFinite(r.values?.[key]))
  ? null : rows.reduce((v,r) => v + Math.round(r.values[key] * 100),0)/100;
const shown = amount => amount === null ? "Tieto puuttuu" : money.format(amount);
const validPayDate = record => /^\d{4}-\d{2}-\d{2}$/.test(record.values?.payDate || "");

export function renderCalendar({ active, unresolved, selectedYear, history }) {
  const host = document.getElementById("ledgerCalendar");
  if (!host) return;
  const rows = [...history.querySelectorAll(".history-row.payslip-item")];
  const payments = active.filter(r => validPayDate(r) && r.values.payDate.startsWith(selectedYear+"-") &&
    ["realized","confirmed_future"].includes(paymentState(r)));
  if (year !== selectedYear) {
    year = selectedYear;
    const mostRecent = payments.map(r => r.values.payDate).sort().at(-1);
    month = mostRecent ? Number(mostRecent.slice(5,7)) : (year === new Date().getFullYear() ? new Date().getMonth()+1 : 12);
    selected = null;
  }
  if (focusDate?.startsWith(selectedYear+"-")) {
    month = Number(focusDate.slice(5,7));
    selected = focusDate;
    mode = "calendar";
    try { localStorage.setItem(preference,mode); } catch {}
    focusDate = null;
  }

  function draw() {
    host.replaceChildren();
    for (const button of document.querySelectorAll("[data-ledger-mode]")) {
      button.setAttribute("aria-pressed", String(mode === button.dataset.ledgerMode));
      button.onclick = () => {
        mode = button.dataset.ledgerMode;
        try { localStorage.setItem(preference,mode); } catch {}
        draw();
      };
    }
    host.hidden = mode !== "calendar";
    rows.forEach(row => { row.hidden = false; });
    if (host.hidden) return;

    const prefix = year+"-"+String(month).padStart(2,"0");
    const monthRows = payments.filter(r => r.values.payDate.startsWith(prefix));
    const realized = monthRows.filter(r => paymentState(r) === "realized");
    const forthcoming = monthRows.filter(r => paymentState(r) === "confirmed_future");
    const dates = [...new Set(monthRows.map(r => r.values.payDate))];
    if (!dates.includes(selected)) selected = dates.slice().sort().at(-1) || null;

    const first = new Date(Date.UTC(year,month-1,1));
    const head = el("div","","ledger-month");
    const previous = el("button","‹");
    previous.type = "button";
    previous.setAttribute("aria-label","Edellinen kuukausi");
    previous.disabled = month === 1;
    previous.onclick = () => { month--; selected=null; draw(); host.querySelector("h3")?.focus(); };
    const title = el("h3",monthName.format(first));
    title.tabIndex = -1;
    const next = el("button","›");
    next.type="button";
    next.setAttribute("aria-label","Seuraava kuukausi");
    next.disabled = month === 12;
    next.onclick = () => { month++; selected=null; draw(); host.querySelector("h3")?.focus(); };
    head.append(previous,title,next);

    const stats = el("div","","ledger-month-stats");
    for (const [name,value] of [
      ["Kuukauden netto",sum(realized,"netPay")],
      ["Kuukauden brutto",sum(realized,"grossPay")]
    ]) {
      const box = el("div","","ledger-stat");
      box.append(el("span",name),el("strong",realized.length ? shown(value) : "Ei toteutuneita"));
      stats.append(box);
    }
    const noteParts = [realized.length+" toteutunutta maksua"];
    if (forthcoming.length) noteParts.push(forthcoming.length+" vahvistettua tulevaa maksua (ei koonnissa)");
    const previousPrefix = year+"-"+String(month-1).padStart(2,"0");
    if (month>1) {
      const previousRows = payments.filter(r => r.values.payDate.startsWith(previousPrefix) && paymentState(r) === "realized");
      const nowNet = sum(realized,"netPay"), beforeNet = sum(previousRows,"netPay");
      if (nowNet !== null && beforeNet !== null) {
        const change = Math.round((nowNet-beforeNet)*100)/100;
        noteParts.push("Neton muutos edellisestä kuukaudesta "+(change>=0?"+":"")+money.format(change));
      }
    }
    host.append(head,stats,el("p",noteParts.join(" · "),"ledger-month-note"));
    if (unresolved.length) host.append(el("p","Ratkaisemattomat tapahtumat eivät sisälly koontiin. Tarkista ne Lista-näkymästä.","ledger-month-note"));
    const grid = el("div","","ledger-days");
    for (const name of ["ma","ti","ke","to","pe","la","su"]) grid.append(el("small",name));
    for (let i=0;i<(first.getUTCDay()+6)%7;i++) grid.append(el("span","","ledger-padding"));
    const length = new Date(Date.UTC(year,month,0)).getUTCDate();
    for (let day=1;day<=length;day++) {
      const iso=prefix+"-"+String(day).padStart(2,"0");
      const events=monthRows.filter(r => r.values.payDate===iso);
      const cell = el(events.length?"button":"span",String(day),events.length?"ledger-day":"ledger-day ledger-quiet");
      if (events.length) {
        const futureOnly=events.every(r => paymentState(r)==="confirmed_future");
        cell.type="button";
        cell.classList.add(futureOnly?"is-future":"is-paid");
        cell.setAttribute("aria-pressed",String(selected===iso));
        cell.setAttribute("aria-label",day+"."+month+"."+year+" · "+events.length+
          (futureOnly?" vahvistettua tulevaa maksua":" maksua"));
        cell.onclick=()=>{ selected=iso;draw();host.querySelector(".ledger-days [aria-pressed=true]")?.focus(); };
      }
      grid.append(cell);
    }
    const selectedRows=selected ? monthRows.filter(r=>r.values.payDate===selected) : [];
    const dayLabel=selected
      ? "Maksut "+Number(selected.slice(-2))+"."+month+"."+year+" · "+selectedRows.length+" kpl"
      : "Valitse palkkapäivä";
    host.append(grid,el("h4",dayLabel,"ledger-day-heading"));
    rows.forEach(row => {row.hidden = !selected || row.dataset.ledgerDate !== selected;});
  }

  host.onLedgerFocus = date => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    focusDate=date;
    if (date.startsWith(year+"-")) {
      month=Number(date.slice(5,7));
      selected=date;
      mode="calendar";
      try { localStorage.setItem(preference,mode); } catch {}
      focusDate=null;
      draw();
    }
  };
  if (!host.dataset.ledgerFocusReady) {
    host.addEventListener("ledger-select-date",event => host.onLedgerFocus?.(event.detail?.date));
    host.dataset.ledgerFocusReady="true";
  }
  draw();
}
