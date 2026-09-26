(() => {
  const root = document.querySelector("[data-catalog-url]");
  if (!root) return;

  const grid = root.querySelector("[data-catalog-grid]");
  const featuredSection = root.querySelector("[data-featured-section]");
  const featuredGrid = root.querySelector("[data-featured-grid]");
  const status = root.querySelector("[data-catalog-status]");
  const search = root.querySelector("#cursor-search");
  const dialog = document.querySelector("[data-catalog-dialog]");
  const close = document.querySelector("[data-catalog-close]");
  const title = document.querySelector("[data-catalog-title]");
  const author = document.querySelector("[data-catalog-author]");
  const variantWrap = document.querySelector("[data-catalog-variant-wrap]");
  const variantsSelect = document.querySelector("[data-catalog-variants]");
  const stateGrid = document.querySelector("[data-catalog-state-grid]");
  const apply = document.querySelector("[data-catalog-apply]");
  const handoff = document.querySelector("[data-catalog-handoff]");
  const handoffTitle = document.querySelector("[data-catalog-handoff-title]");
  const handoffCopy = document.querySelector("[data-catalog-handoff-copy]");
  const handoffRetry = document.querySelector("[data-catalog-handoff-retry]");
  const handoffDownload = document.querySelector("[data-catalog-handoff-download]");
  const mobileWindowsNote = root.querySelector("[data-mobile-windows-note]");
  if (!grid || !featuredSection || !featuredGrid || !status || !search || !dialog || !close || !title || !author || !variantWrap || !variantsSelect || !stateGrid || !apply || !handoff || !handoffTitle || !handoffCopy || !handoffRetry || !handoffDownload) return;

  const hoverOverlay = document.createElement("img");
  hoverOverlay.className = "catalog-cursor-overlay";
  hoverOverlay.alt = "";
  hoverOverlay.hidden = true;
  dialog.append(hoverOverlay);

  if (mobileWindowsNote && window.matchMedia("(max-width: 640px) and (pointer: coarse)").matches) {
    mobileWindowsNote.hidden = false;
    window.setTimeout(() => {
      mobileWindowsNote.hidden = true;
    }, 2_600);
  }

  const roleOrder = [
    "arrow",
    "help",
    "workingInBackground",
    "busy",
    "precisionSelect",
    "textSelect",
    "handwriting",
    "unavailable",
    "verticalResize",
    "horizontalResize",
    "diagonalResize1",
    "diagonalResize2",
    "move",
    "alternateSelect",
    "linkSelect",
    "personSelect",
    "locationSelect",
  ];

  const roleLabels = {
    arrow: "Normal Select",
    help: "Help Select",
    workingInBackground: "Working",
    busy: "Busy",
    precisionSelect: "Precision Select",
    textSelect: "Text Select",
    handwriting: "Handwriting",
    unavailable: "Unavailable",
    verticalResize: "Vertical Resize",
    horizontalResize: "Horizontal Resize",
    diagonalResize1: "Diagonal Resize 1",
    diagonalResize2: "Diagonal Resize 2",
    move: "Move",
    alternateSelect: "Alternate Select",
    linkSelect: "Link Select",
    personSelect: "Person Select",
    locationSelect: "Location Select",
  };

  const themeSuffix = /\s+((?:(?:dark|light)\s+)?(?:blue|green|orange|purple|red|cyan|magenta|cerise|white|black)|dark|light)$/i;
  const canonicalPackId = /^[a-z0-9][a-z0-9-]{0,127}$/;
  const details = new Map();
  let packs = [];
  let selectedPackId = null;
  let handoffTimer = 0;

  function nameParts(name) {
    const bracketed = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (bracketed) return { base: bracketed[1].trim(), theme: bracketed[2].trim() };
    const suffixed = name.match(themeSuffix);
    return suffixed
      ? { base: name.slice(0, suffixed.index).trim(), theme: suffixed[1].trim() }
      : { base: name.trim(), theme: "" };
  }

  function familyName(pack) {
    if (typeof pack.family === "string" && pack.family) return pack.family;
    const rootName = (pack.arrowFile || "").replaceAll("\\", "/").split("/")[0] || "";
    if (/\s+cursors?$/i.test(rootName)) return rootName.replace(/\s+cursors?$/i, "").trim();
    return nameParts(pack.name).base;
  }

  function variantLabel(pack) {
    if (typeof pack.variant === "string" && pack.variant) return pack.variant;
    const family = familyName(pack);
    const { base, theme } = nameParts(pack.name);
    const path = (pack.arrowFile || "").replaceAll("\\", "/").split("/");
    const alt = path.findIndex((part) => part.toLowerCase() === "_alt");
    const pathStyle = alt >= 0 ? path[alt + 1] : "";
    const nameStyle = base.toLowerCase().startsWith(family.toLowerCase())
      ? base.slice(family.length).trim()
      : "";
    const style = pathStyle || nameStyle;
    const parts = [style && style.toLowerCase() !== theme.toLowerCase() ? style : "", theme]
      .filter(Boolean);
    return parts.join(" · ") || "Default";
  }

  function familyVariants(items) {
    const variants = items
      .map((pack) => ({ pack, label: variantLabel(pack) }))
      .sort((left, right) => left.label.localeCompare(right.label) || left.pack.id.localeCompare(right.pack.id));
    const totals = new Map();
    const seen = new Map();
    for (const variant of variants) totals.set(variant.label, (totals.get(variant.label) || 0) + 1);
    return variants.map((variant) => {
      const number = (seen.get(variant.label) || 0) + 1;
      seen.set(variant.label, number);
      return {
        ...variant,
        label: (totals.get(variant.label) || 0) > 1 ? `${variant.label} #${number}` : variant.label,
      };
    });
  }

  function packFamilies(items) {
    const grouped = new Map();
    for (const pack of items) {
      const family = familyName(pack);
      grouped.set(family, [...(grouped.get(family) || []), pack]);
    }
    return [...grouped]
      .map(([name, familyPacks]) => ({ name, variants: familyVariants(familyPacks) }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  function image(url, alt) {
    const element = document.createElement("img");
    element.src = url;
    element.alt = alt;
    element.loading = "lazy";
    element.decoding = "async";
    return element;
  }

  function createCard(pack, nameText, detailText) {
    const card = document.createElement("article");
    card.className = "catalog-card";
    const button = document.createElement("button");
    button.type = "button";
    button.addEventListener("click", () => void openPack(pack.id));

    const preview = document.createElement("div");
    preview.className = "catalog-preview";
    const normalImage = image(pack.preview, `${nameText} cursor preview`);
    normalImage.className = "catalog-normal-preview";
    const linkImage = document.createElement("img");
    linkImage.className = "catalog-link-preview";
    linkImage.alt = "";
    linkImage.loading = "lazy";
    linkImage.decoding = "async";
    const linkPreview = typeof pack.linkPreview === "string" ? pack.linkPreview : pack.preview;
    let previewTimer = 0;
    let hovering = false;
    const revealLink = () => {
      window.clearTimeout(previewTimer);
      previewTimer = window.setTimeout(() => {
        if (!hovering) return;
        preview.classList.remove("is-switching");
        preview.classList.add("is-link-preview");
      }, 300);
    };
    button.addEventListener("pointerenter", () => {
      hovering = true;
      window.clearTimeout(previewTimer);
      preview.classList.remove("is-link-preview");
      preview.classList.add("is-switching");
      if (linkImage.getAttribute("src") === linkPreview && linkImage.complete) revealLink();
      else {
        linkImage.addEventListener("load", revealLink, { once: true });
        linkImage.src = linkPreview;
      }
    });
    button.addEventListener("pointerleave", () => {
      hovering = false;
      window.clearTimeout(previewTimer);
      preview.classList.remove("is-switching", "is-link-preview");
    });
    preview.append(normalImage, linkImage);
    const name = document.createElement("strong");
    name.textContent = nameText;
    const detail = document.createElement("span");
    detail.textContent = detailText;

    button.append(preview, name, detail);
    card.append(button);
    return card;
  }

  function renderFeatured() {
    const featured = packs.filter((pack) => pack.author === "Beepo Cursors");
    featuredSection.hidden = featured.length === 0;
    featuredGrid.replaceChildren();
    const cards = document.createDocumentFragment();
    for (const pack of featured) cards.append(createCard(pack, pack.name, `by ${pack.author}`));
    featuredGrid.append(cards);
  }

  function renderCatalog() {
    const query = search.value.trim().toLocaleLowerCase();
    const visible = packs.filter((pack) => !query || [
      pack.name,
      pack.author,
      familyName(pack),
      variantLabel(pack),
    ].some((value) => value.toLocaleLowerCase().includes(query)));
    const families = packFamilies(visible);
    grid.replaceChildren();

    if (families.length === 0) {
      const empty = document.createElement("p");
      empty.className = "catalog-empty";
      empty.textContent = "No cursors found.";
      grid.append(empty);
      status.textContent = "No matching cursor packs.";
      return;
    }

    const cards = document.createDocumentFragment();
    for (const family of families) {
      const first = family.variants[0].pack;
      cards.append(createCard(
        first,
        family.name,
        `${family.variants.length} ${family.variants.length === 1 ? "pack" : "variants"}`,
      ));
    }
    grid.append(cards);
    status.textContent = `${families.length} cursor families · ${visible.length} packs`;
  }

  function setDetailHeader(pack, variants) {
    title.textContent = variants.length > 1 ? familyName(pack) : pack.name;
    author.textContent = pack.author ? `by ${pack.author}` : "";
    author.hidden = !pack.author;
    if (pack.authorUrl) {
      author.href = pack.authorUrl;
      author.target = "_blank";
      author.rel = "noreferrer";
    } else {
      author.removeAttribute("href");
      author.removeAttribute("target");
      author.removeAttribute("rel");
    }
    variantWrap.hidden = variants.length < 2;
    variantsSelect.replaceChildren();
    for (const variant of variants) {
      const option = document.createElement("option");
      option.value = variant.pack.id;
      option.textContent = variant.label;
      option.selected = variant.pack.id === pack.id;
      variantsSelect.append(option);
    }
  }

  function clearHandoff() {
    window.clearTimeout(handoffTimer);
    handoffTimer = 0;
    handoff.hidden = true;
    handoffRetry.hidden = true;
    handoffDownload.hidden = true;
    apply.disabled = false;
  }

  function hideHoverPreview() {
    hoverOverlay.hidden = true;
  }

  function moveHoverPreview(event, hotspot) {
    const [hotspotX, hotspotY] = hotspot;
    hoverOverlay.style.left = `${event.clientX - hotspotX}px`;
    hoverOverlay.style.top = `${event.clientY - hotspotY}px`;
  }

  function showHoverPreview(event, cursor) {
    if (hoverOverlay.src !== new URL(cursor.hover, window.location.href).href) hoverOverlay.src = cursor.hover;
    moveHoverPreview(event, cursor.hotspot);
    hoverOverlay.hidden = false;
  }

  function openApp(pack) {
    if (!canonicalPackId.test(pack.id)) return;
    window.clearTimeout(handoffTimer);
    handoff.hidden = false;
    handoffTitle.textContent = "Opening Beepo Cursors…";
    handoffCopy.textContent = "Applying this cursor pack in the app.";
    handoffRetry.hidden = true;
    handoffDownload.hidden = true;
    apply.disabled = true;
    window.location.href = `beepocursors://apply/${encodeURIComponent(pack.id)}`;
    handoffTimer = window.setTimeout(() => {
      if (document.hidden) return;
      handoffTitle.textContent = "Didn't open?";
      handoffCopy.textContent = "Try again after installing Beepo Cursors.";
      handoffRetry.hidden = false;
      handoffDownload.hidden = false;
    }, 1_500);
  }

  function renderStates(pack) {
    const states = document.createDocumentFragment();
    for (const role of roleOrder) {
      const cursor = pack.roles?.[role];
      if (!cursor?.preview) continue;
      const state = document.createElement("article");
      state.className = "catalog-state";
      const hasHover = typeof cursor.hover === "string"
        && Array.isArray(cursor.hotspot)
        && cursor.hotspot.length === 2
        && cursor.hotspot.every(Number.isInteger);
      if (hasHover) {
        state.dataset.hoverPreview = "";
        state.addEventListener("pointerenter", (event) => showHoverPreview(event, cursor));
        state.addEventListener("pointermove", (event) => moveHoverPreview(event, cursor.hotspot));
        state.addEventListener("pointerleave", hideHoverPreview);
      }
      const preview = document.createElement("div");
      preview.className = "catalog-state-preview";
      preview.append(image(cursor.preview, ""));
      const label = document.createElement("span");
      label.textContent = roleLabels[role];
      state.append(preview, label);
      states.append(state);
    }
    stateGrid.replaceChildren(states);
  }

  function detailUrl(packId) {
    const url = new URL(root.dataset.catalogUrl, window.location.href);
    url.searchParams.set("pack", packId);
    return url;
  }

  async function openPack(packId) {
    const summary = packs.find((pack) => pack.id === packId);
    if (!summary) return;
    hideHoverPreview();
    clearHandoff();
    selectedPackId = packId;
    const variants = familyVariants(packs.filter((pack) => familyName(pack) === familyName(summary)));
    setDetailHeader(summary, variants);
    const loading = document.createElement("p");
    loading.className = "catalog-empty";
    loading.textContent = "Loading previews…";
    stateGrid.replaceChildren(loading);
    if (!dialog.open) dialog.showModal();

    const cached = details.get(packId);
    if (cached) {
      renderStates(cached);
      return;
    }

    try {
      const response = await fetch(detailUrl(packId));
      if (!response.ok) throw new Error("Cursor pack unavailable");
      const detail = await response.json();
      if (!detail || detail.id !== packId) throw new Error("Invalid cursor pack");
      details.set(packId, detail);
      if (selectedPackId === packId && dialog.open) renderStates(detail);
    } catch {
      if (selectedPackId !== packId || !dialog.open) return;
      const error = document.createElement("p");
      error.className = "catalog-empty";
      error.textContent = "Could not load this cursor pack.";
      stateGrid.replaceChildren(error);
    }
  }

  variantsSelect.addEventListener("change", () => void openPack(variantsSelect.value));
  apply.addEventListener("click", () => {
    const pack = packs.find((candidate) => candidate.id === selectedPackId);
    if (pack) openApp(pack);
  });
  handoffRetry.addEventListener("click", () => {
    const pack = packs.find((candidate) => candidate.id === selectedPackId);
    if (pack) openApp(pack);
  });
  search.addEventListener("input", renderCatalog);
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    selectedPackId = null;
    clearHandoff();
    hideHoverPreview();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) window.clearTimeout(handoffTimer);
  });

  async function loadCatalog() {
    try {
      const response = await fetch(root.dataset.catalogUrl);
      if (!response.ok) throw new Error("Cursor catalog unavailable");
      const payload = await response.json();
      packs = Array.isArray(payload?.packs)
        ? payload.packs.filter((pack) => canonicalPackId.test(pack?.id) && typeof pack?.name === "string" && typeof pack?.preview === "string")
        : [];
      renderFeatured();
      renderCatalog();
    } catch {
      status.textContent = "Could not load the cursor library.";
      featuredSection.hidden = true;
      featuredGrid.replaceChildren();
      const error = document.createElement("p");
      error.className = "catalog-empty";
      error.textContent = "Refresh to try again.";
      grid.replaceChildren(error);
    }
  }

  void loadCatalog();
})();
