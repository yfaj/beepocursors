const toggle = document.querySelector(".download-toggle");
const menu = toggle?.closest(".download-menu");
let navigating = false;

toggle?.addEventListener("click", () => {
  if (toggle instanceof HTMLAnchorElement) return;
  const open = toggle.getAttribute("aria-expanded") !== "true";
  toggle.setAttribute("aria-expanded", String(open));
  menu.classList.toggle("hover-suppressed", !open);
});

menu?.addEventListener("pointerleave", () => {
  menu.classList.remove("hover-suppressed");
});

function setActiveTab(target) {
  const view = target.searchParams.get("view") === "browse"
    ? "browse"
    : target.searchParams.get("view") === "download"
      ? "download"
      : "home";
  document.querySelectorAll(".top-tab[href]").forEach((link) => {
    const requestedView = new URL(link.href, window.location.href).searchParams.get("view");
    const linkView = requestedView === "browse" || requestedView === "download" ? requestedView : "home";
    const active = linkView === view;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  toggle?.classList.toggle("active", view === "download");
  if (view === "download") toggle?.setAttribute("aria-current", "page");
  else toggle?.removeAttribute("aria-current");
}

function loadCatalog(documentFragment) {
  const source = [...documentFragment.querySelectorAll("script[src]")]
    .find((script) => new URL(script.getAttribute("src") || "", window.location.href).pathname === "/catalog.js");
  const path = source?.getAttribute("src");
  if (!path) return;
  const script = document.createElement("script");
  script.src = path;
  document.body.append(script);
}

async function navigate(url, push) {
  const target = new URL(url, window.location.href);
  if (navigating || (push && target.href === window.location.href)) return;
  navigating = true;

  try {
    const response = await fetch(target.href, { headers: { "X-Beepo-Navigation": "1" } });
    if (!response.ok) throw new Error("Navigation unavailable");
    const nextDocument = new DOMParser().parseFromString(await response.text(), "text/html");
    const nextPage = nextDocument.querySelector(".site-shell > .page");
    const currentPage = document.querySelector(".site-shell > .page");
    if (!nextPage || !currentPage) throw new Error("Navigation markup unavailable");

    currentPage.classList.add("is-leaving");
    await new Promise((resolve) => window.setTimeout(resolve, 300));

    const currentDialog = document.querySelector(".site-shell > .catalog-dialog");
    if (currentDialog?.open) currentDialog.close();
    currentPage.replaceWith(nextPage);
    currentDialog?.remove();
    const nextDialog = nextDocument.querySelector(".site-shell > .catalog-dialog");
    if (nextDialog) nextPage.after(nextDialog);

    setActiveTab(target);
    if (!(toggle instanceof HTMLAnchorElement)) toggle?.setAttribute("aria-expanded", "false");
    menu?.classList.remove("hover-suppressed");
    if (push) history.pushState({}, "", `${target.pathname}${target.search}${target.hash}`);
    window.scrollTo(0, 0);
    nextPage.classList.add("is-entering");
    loadCatalog(nextDocument);
  } catch {
    window.location.assign(target.href);
  } finally {
    navigating = false;
  }
}

document.addEventListener("click", (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest("a[data-site-route]");
  if (!(link instanceof HTMLAnchorElement)) return;
  const target = new URL(link.href, window.location.href);
  if (target.origin !== window.location.origin) return;
  event.preventDefault();
  void navigate(target.href, true);
});

window.addEventListener("popstate", () => void navigate(window.location.href, false));
