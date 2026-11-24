/** Reflect the shared application's view changes in navigation and keyboard focus. */
export function installNavigation() {
  const tabs = [...document.querySelectorAll(".tabs [data-view-target]")];
  const sections = new Map([...document.querySelectorAll("[data-view]")].map(section => [section.dataset.view, section]));
  function refresh() {
    for (const tab of tabs) {
      const active = !sections.get(tab.dataset.viewTarget).classList.contains("hidden");
      if (active) {
        tab.setAttribute("aria-current", "page");
        sections.get(tab.dataset.viewTarget).id = "activeView";
      } else {
        tab.removeAttribute("aria-current");
        sections.get(tab.dataset.viewTarget).removeAttribute("id");
      }
    }
  }
  for (const section of sections.values()) section.tabIndex = -1;
  const observer = new MutationObserver(refresh);
  for (const section of sections.values()) observer.observe(section, {attributeFilter: ["class"]});
  refresh();
  document.querySelector(".retail-skip").addEventListener("click", event => {
    event.preventDefault();
    document.getElementById("activeView")?.focus();
  });
}
