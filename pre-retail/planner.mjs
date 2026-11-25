// Module dependencies and the parsed planner DOM are ready before the frame load event.
import "./ab-summary-v6.mjs";

if (window.parent !== window) {
  document.documentElement.dataset.parentProduct = "Palkka";
  const history = document.getElementById("history-title").closest("section");
  const year = document.getElementById("planYear").closest(".field");
  const heading = document.getElementById("history-title").closest(".subtitle");
  const explanation = history.querySelector("p.muted");
  const intro = document.createElement("div");
  intro.className = "retail-planner-intro";
  heading.before(intro);
  intro.append(heading, year, explanation);
  explanation.textContent = "Palkkahistoria antaa ehdotuksia. Tarkista luvut ennen käyttämistä.";
  history.querySelector("label[for='historyInput']").hidden = true;
  heading.querySelector(".tag").hidden = true;
  document.querySelector(".shell > footer").textContent =
    "Laskurin arviot lasketaan laitteellasi. Tarkista vero- ja palkkatiedot alkuperäisistä lähteistä.";
  document.documentElement.dataset.retailPlanner = "ready";
}
