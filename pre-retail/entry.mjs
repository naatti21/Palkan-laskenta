import { origin, revision, version } from "./pre-retail-config.mjs";
import { installCompact } from "./beta-compact.mjs";
import { renderCalendar } from "./beta-ledger.mjs";
import { installNavigation } from "./pre-retail-navigation.mjs";

const error = document.getElementById("retailSystemError");
function showError(message) {
  error.textContent = message;
  error.hidden = false;
}

function preparePlanner() {
  const frame = document.getElementById("plannerFrame");
  function mount() {
    const doc = frame.contentDocument;
    if (!doc?.documentElement.classList.contains("beta-integrated") || doc.querySelector("[data-retail-planner]")) return;
    doc.documentElement.dataset.parentProduct = "Palkka";
    const history = doc.getElementById("history-title").closest("section");
    const year = doc.getElementById("planYear").closest(".field");
    const heading = doc.getElementById("history-title").closest(".subtitle");
    const explanation = history.querySelector("p.muted");
    const intro = doc.createElement("div");
    intro.className = "retail-planner-intro";
    heading.before(intro);
    intro.append(heading, year, explanation);
    explanation.textContent = "Palkkahistoria antaa ehdotuksia. Tarkista luvut ennen käyttämistä.";
    history.querySelector("label[for='historyInput']").hidden = true;
    heading.querySelector(".tag").hidden = true;
    doc.querySelector(".shell > footer").textContent =
      "Laskurin arviot lasketaan laitteellasi. Tarkista vero- ja palkkatiedot alkuperäisistä lähteistä.";
    const style = doc.createElement("link");
    style.rel = "stylesheet";
    style.href = "./pre-retail-planner.css";
    doc.head.append(style);
    for (const path of ["net-reference-2026.mjs", "ab-summary-v6.mjs"]) {
      const script = doc.createElement("script");
      script.type = "module";
      script.src = path;
      script.dataset.retailPlanner = "";
      script.addEventListener("error", () => showError("Laskurin lisäosia ei voitu ladata. Avaa sovellus uudelleen."));
      doc.body.append(script);
    }
  }
  frame.addEventListener("load", mount);
  if (frame.contentDocument?.readyState === "complete") mount();
}

async function start() {
  if (location.origin !== origin) {
    document.querySelector(".shell").replaceChildren(error);
    showError("Tämä testibuildi on sidottu paikalliseen osoitteeseen " + origin + ".");
    return;
  }
  document.getElementById("retailVersion").textContent = `${version} · ${revision}`;
  preparePlanner();
  document.getElementById("ledgerCalendar").addEventListener("ledger-render", event => renderCalendar(event.detail));
  installCompact();
  installNavigation();
  const empty = document.getElementById("retailWelcome");
  document.addEventListener("compact-payments", ({detail}) => {
    empty.hidden = detail.records.length > 0;
    document.querySelector('[data-view="tracking"]').classList.toggle("retail-first-use", !empty.hidden);
  });
  // The shared PDF sheet has labelled controls and returns focus on Escape.
  // Keep keyboard focus inside the modal while it is open in this shell.
  document.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const dialog = document.getElementById("betaImportWorkspace");
    if (!dialog || dialog.hidden) return;
    const controls = [...dialog.querySelectorAll("button,input,select,summary,a[href]")]
      .filter(control => !control.disabled && control.tabIndex >= 0 && control.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  await import("./app.js");
}

start().catch(() => showError("Sovelluksen käynnistys epäonnistui. Lataa sivu uudelleen."));
