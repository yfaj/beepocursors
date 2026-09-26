import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const websiteFile = (path, encoding) =>
  readFile(new URL(`../website/${path}`, import.meta.url), encoding);

test("V46/V49/V83 website is public and exposes Discord instead of Lock", async () => {
  const [source, styles, catalogEndpoint, previewEndpoint] = await Promise.all([
    websiteFile("index.php", "utf8"),
    websiteFile("styles.css", "utf8"),
    websiteFile("catalog.php", "utf8"),
    websiteFile("preview.php", "utf8"),
  ]);

  assert.match(source, /<body class="site-page">/);
  assert.match(source, /class="discord-link" href="https:\/\/discord\.gg\/beep"/);
  assert.match(source, /aria-label="Join our Discord"/);
  assert.match(styles, /\.discord-link\s*\{[^}]*margin-left:\s*auto/s);
  assert.doesNotMatch(`${source}\n${catalogEndpoint}\n${previewEndpoint}`, /auth\.php|preview_unlocked|preview-key|require_preview_access|>Lock</i);
});

test("V47 website shell exposes Home, Browse, and a dedicated Download page", async () => {
  const [source, styles] = await Promise.all([
    websiteFile("index.php", "utf8"),
    websiteFile("styles.css", "utf8"),
  ]);

  assert.match(source, /<span>Beepo <span class="brand-accent">Cursors<\/span><\/span>/);
  assert.match(source, /href="\/"/);
  assert.match(source, />Home<\/a>/);
  assert.match(source, /href="\/\?view=browse"/);
  assert.match(source, />Browse<\/a>/);
  assert.match(source, /in_array\(\$requestedView, \["browse", "download"\], true\)/);
  assert.match(source, /download-toggle[\s\S]*href="\/\?view=download"[\s\S]*data-site-route[\s\S]*>Download<\/a>/);
  assert.match(source, /<main class="page home-page" aria-label="Beepo Cursors">/);
  assert.match(source, /<main class="page" aria-label="Cursor catalog">/);
  assert.match(source, /<main class="page download-page" aria-label="Downloads">/);
  assert.match(source, /<p class="catalog-kicker">Beepo Cursors 1\.2<\/p>/);
  assert.match(source, /beepo-cursors-installer\.exe\?v=1\.2\.0-62aa513/);
  assert.match(source, /beepo-cursors-portable\.exe\?v=1\.2\.0-62aa513/);
  assert.match(source, /if \(\$view === "browse"\)/);
  assert.match(source, /<div class="download-menu">/);
  assert.match(source, /download-toggle/);
  assert.match(source, /<div id="download-options" class="download-cluster" aria-label="Downloads" hidden>/);
  for (const option of [
    "Desktop Installer",
    "Desktop Portable",
    "Browser Companion",
  ]) {
    assert.match(source, new RegExp(`<strong>${option}<\\/strong>`));
  }
  assert.match(source, /class="windows-mark"/);
  assert.doesNotMatch(source, /<button type="button" disabled>Desktop/);
  assert.match(styles, /\.site-shell\s*\{[^}]*border-radius:\s*18px/s);
  assert.match(styles, /#100d0e|#090708/);
  assert.match(styles, /#eebabe/);
  assert.match(styles, /\.home-page\s*\{[^}]*place-items:\s*center/s);
  assert.match(styles, /\.download-page-option\s*\{[^}]*min-height:\s*72px[^}]*align-content:\s*center/s);
});

test("V55 website brand accents only Cursors with the theme color", async () => {
  const [source, styles] = await Promise.all([
    websiteFile("index.php", "utf8"),
    websiteFile("styles.css", "utf8"),
  ]);

  assert.match(source, /<h1 id="home-title">Beepo <span class="brand-accent">Cursors<\/span><\/h1>/);
  assert.match(source, /<p>quiet place to find Windows cursor packs\.<\/p>/);
  assert.doesNotMatch(source, /A quiet place to find Windows cursor packs/);
  assert.match(source, /<div class="home-actions">[\s\S]*home-cta home-cta-muted" href="\/\?view=browse" data-site-route>Browse<\/[\s\S]*home-cta" href="\/\?view=download" data-site-route>Download<\//);
  assert.match(styles, /\.brand-accent\s*\{[^}]*color:\s*#eebabe/s);
});

test("V48 website loads a public, lazy cursor catalog", async () => {
  const [source, catalogScript, catalogEndpoint, previewEndpoint] = await Promise.all([
    websiteFile("index.php", "utf8"),
    websiteFile("catalog.js", "utf8"),
    websiteFile("catalog.php", "utf8"),
    websiteFile("preview.php", "utf8"),
  ]);

  assert.match(source, /<main class="page" aria-label="Cursor catalog">/);
  assert.match(source, /data-catalog-url="\/catalog\.php\?v=<\?= \$catalogVersion \?>"/);
  assert.match(source, /<h2>Featured<\/h2>/);
  assert.match(source, /data-featured-grid/);
  assert.match(source, /catalog\.js\?v=<\?=\s*filemtime\(__DIR__ \. "\/catalog\.js"\)\s*\?>/);
  assert.match(catalogScript, /fetch\(root\.dataset\.catalogUrl\)/);
  assert.match(catalogScript, /pack\.author === "Beepo Cursors"/);
  assert.match(catalogScript, /url\.searchParams\.set\("pack", packId\)/);
  assert.match(catalogScript, /element\.loading = "lazy"/);
  assert.match(catalogScript, /roleOrder/);
  assert.match(catalogEndpoint, /\$requestedPack = \$_GET\["pack"\]/);
  assert.match(previewEndpoint, /preg_match\("\/\^\[a-z0-9\]/);
  assert.doesNotMatch(source, /\/generated\//);
  assert.doesNotMatch(source, /github|open[\s-]?source|redscursors:\/\/|download=/i);
});

test("V64 public catalog assets stay validated and outside webroot", async () => {
  const [catalogEndpoint, previewEndpoint] = await Promise.all([
    websiteFile("catalog.php", "utf8"),
    websiteFile("preview.php", "utf8"),
  ]);

  assert.match(catalogEndpoint, /Cache-Control: no-store/);
  assert.match(catalogEndpoint, /private\/distribution\/catalog\.json/);
  assert.match(previewEndpoint, /preg_match\("\/\^\[a-z0-9\]/);
  assert.match(previewEndpoint, /in_array\(\$role, \$roles, true\)/);
  assert.match(previewEndpoint, /str_starts_with\(\$candidate, \$root/);
  assert.match(previewEndpoint, /Cache-Control: no-store/);
  assert.doesNotMatch(`${catalogEndpoint}\n${previewEndpoint}`, /require_preview_access|auth\.php/);
});

test("V68 website pack details keep only creator credit", async () => {
  const [source, catalogScript] = await Promise.all([
    websiteFile("index.php", "utf8"),
    websiteFile("catalog.js", "utf8"),
  ]);

  assert.match(source, /data-catalog-author/);
  assert.doesNotMatch(source, /data-catalog-license/);
  assert.doesNotMatch(catalogScript, /data-catalog-license|license\.textContent/);
});

test("V69 Home, Browse, and Download stay inside the same website shell", async () => {
  const [source, styles, menuScript] = await Promise.all([
    websiteFile("index.php", "utf8"),
    websiteFile("styles.css", "utf8"),
    websiteFile("menu.js", "utf8"),
  ]);

  assert.match(source, /<a class="top-tab.*href="\/"/);
  assert.match(source, /<a class="top-tab.*href="\/\?view=browse"/);
  assert.match(source, /href="\/\?view=download"/);
  assert.match(source, /<div class="home-actions">[\s\S]*home-cta home-cta-muted" href="\/\?view=browse" data-site-route>Browse<\/[\s\S]*home-cta" href="\/\?view=download" data-site-route>Download<\//);
  assert.match(menuScript, /closest\("a\[data-site-route\]"\)/);
  assert.match(menuScript, /view === "download"/);
  assert.match(menuScript, /toggle instanceof HTMLAnchorElement/);
  assert.match(menuScript, /event\.preventDefault\(\)/);
  assert.match(menuScript, /fetch\(target\.href/);
  assert.match(menuScript, /history\.pushState/);
  assert.match(menuScript, /addEventListener\("popstate"/);
  assert.match(menuScript, /catalog\.js/);
  assert.match(styles, /\.page\.is-leaving/);
  assert.match(styles, /\.page\.is-entering/);
  assert.doesNotMatch(menuScript, /isReducedMotion|prefers-reduced-motion/);
  assert.doesNotMatch(styles, /prefers-reduced-motion/);
});

test("V65 website Apply hands off only a canonical pack id", async () => {
  const [source, catalogScript] = await Promise.all([
    websiteFile("index.php", "utf8"),
    websiteFile("catalog.js", "utf8"),
  ]);

  assert.match(source, /data-catalog-apply>Apply<\/button>/);
  assert.match(source, /data-catalog-handoff/);
  assert.match(source, /data-catalog-handoff-download/);
  assert.match(catalogScript, /canonicalPackId = \^?\/\^\[a-z0-9\]\[a-z0-9-\]\{0,127\}\$\//);
  assert.match(catalogScript, /beepocursors:\/\/apply\/\$\{encodeURIComponent\(pack\.id\)\}/);
  assert.match(catalogScript, /window\.location\.href = `beepocursors:/);
  assert.match(catalogScript, /Didn't open\?/);
  assert.match(catalogScript, /handoffRetry\.addEventListener\("click"/);
  assert.match(catalogScript, /handoffDownload\.hidden = false/);
  assert.doesNotMatch(catalogScript, /apply_cursor_pack|\.cur|\.ani|invoke\(/);
});

test("V70 website Apply spinner stays calm", async () => {
  const styles = await websiteFile("styles.css", "utf8");

  assert.match(
    styles,
    /\.catalog-handoff-spinner\s*\{[^}]*animation:\s*catalog-handoff-spin 1\.8s linear infinite/s,
  );
});

test("V71 website detail actions align to the variant selector", async () => {
  const [source, styles] = await Promise.all([
    websiteFile("index.php", "utf8"),
    websiteFile("styles.css", "utf8"),
  ]);

  assert.match(source, /<div class="catalog-detail-actions">[\s\S]*data-catalog-variant-wrap[\s\S]*data-catalog-apply/);
  assert.match(styles, /\.catalog-detail-header\s*\{[^}]*align-items:\s*flex-end/s);
  assert.match(styles, /\.catalog-detail-actions\s*\{[^}]*align-items:\s*flex-end[^}]*margin-left:\s*auto/s);
  assert.match(styles, /\.catalog-variants\s*\{[^}]*margin-left:\s*0/s);
});

test("V72 Browse briefly tells phone visitors that cursor changes need Windows", async () => {
  const [source, catalogScript, styles] = await Promise.all([
    websiteFile("index.php", "utf8"),
    websiteFile("catalog.js", "utf8"),
    websiteFile("styles.css", "utf8"),
  ]);

  assert.match(source, /data-mobile-windows-note hidden/);
  assert.match(source, /You can only change cursors on a Windows PC\./);
  assert.match(catalogScript, /\(max-width: 640px\) and \(pointer: coarse\)/);
  assert.match(catalogScript, /mobileWindowsNote\.hidden = true;[\s\S]*2_600/);
  assert.match(styles, /@keyframes mobile-windows-note/);
});

test("V73 website role previews keep a uniform card scale and use protected hover cursors", async () => {
  const [catalogEndpoint, previewEndpoint, catalogScript, styles] = await Promise.all([
    websiteFile("catalog.php", "utf8"),
    websiteFile("preview.php", "utf8"),
    websiteFile("catalog.js", "utf8"),
    websiteFile("styles.css", "utf8"),
  ]);

  assert.match(catalogEndpoint, /function hover_url/);
  assert.match(catalogEndpoint, /asset=hover/);
  assert.match(catalogEndpoint, /\$roleData\["hover"\] = hover_url/);
  assert.match(catalogEndpoint, /\$roleData\["hotspot"\] = \$hotspot/);
  assert.match(previewEndpoint, /\$asset = \$_GET\["asset"\] \?\? "preview"/);
  assert.match(previewEndpoint, /in_array\(\$asset, \["preview", "hover"\], true\)/);
  assert.match(previewEndpoint, /-hover\.webp/);
  assert.match(previewEndpoint, /-hover\.png/);
  assert.match(previewEndpoint, /str_ends_with\(\$path, "\.webp"\).*"image\/webp"/s);
  assert.match(catalogScript, /catalog-cursor-overlay/);
  assert.match(catalogScript, /pointerenter/);
  assert.match(catalogScript, /pointermove/);
  assert.match(catalogScript, /pointerleave/);
  assert.match(catalogScript, /event\.clientX - hotspotX/);
  assert.match(styles, /\.catalog-state\[data-hover-preview\]\s*\{[^}]*cursor:\s*none/s);
  assert.match(styles, /\.catalog-cursor-overlay\s*\{[^}]*width:\s*32px[^}]*height:\s*32px[^}]*pointer-events:\s*none/s);
  assert.match(styles, /\.catalog-state-preview img\s*\{[^}]*width:\s*72%[^}]*height:\s*72%/s);
});

test("V74 website pack cards fade Normal Select before Link Select grows in", async () => {
  const [catalogEndpoint, catalogScript, styles] = await Promise.all([
    websiteFile("catalog.php", "utf8"),
    websiteFile("catalog.js", "utf8"),
    websiteFile("styles.css", "utf8"),
  ]);

  assert.match(catalogEndpoint, /\$linkSelect = \$pack\["roles"\]\["linkSelect"\]/);
  assert.match(catalogEndpoint, /preview_url\(\$id, "linkSelect", \$version\)/);
  assert.match(catalogScript, /normalImage\.className = "catalog-normal-preview"/);
  assert.match(catalogScript, /linkImage\.className = "catalog-link-preview"/);
  assert.match(catalogScript, /preview\.classList\.add\("is-switching"\)/);
  assert.match(catalogScript, /linkImage\.addEventListener\("load", revealLink, \{ once: true \}\)/);
  assert.match(catalogScript, /preview\.classList\.add\("is-link-preview"\)/);
  assert.match(catalogScript, /button\.addEventListener\("pointerleave", \(\) => \{\s*hovering = false;\s*window\.clearTimeout\(previewTimer\)/s);
  assert.match(styles, /\.catalog-preview img[^}]*opacity 300ms[^}]*transform 300ms/s);
  assert.match(styles, /\.catalog-preview\.is-switching \.catalog-normal-preview\s*\{[^}]*opacity:\s*\.18[^}]*scale\(\.94\)/s);
  assert.match(styles, /\.catalog-preview\.is-link-preview \.catalog-link-preview\s*\{[^}]*scale\(1\.1\)/s);
  assert.match(styles, /\.catalog-preview img\s*\{[^}]*width:\s*64px[^}]*height:\s*64px/s);
});

test("V75 website keeps its topbar outside the page scroll region", async () => {
  const styles = await websiteFile("styles.css", "utf8");

  assert.match(styles, /\.site-page\s*\{[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/s);
  assert.match(styles, /\.site-shell\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*52px minmax\(0, 1fr\)[^}]*height:\s*calc\(100dvh - 32px\)/s);
  assert.match(styles, /\.page\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s);
});

test("V77 website tabs visibly fade only page content before swapping", async () => {
  const [menuScript, styles] = await Promise.all([
    websiteFile("menu.js", "utf8"),
    websiteFile("styles.css", "utf8"),
  ]);

  assert.match(menuScript, /currentPage\.classList\.add\("is-leaving"\);[\s\S]*window\.setTimeout\(resolve, 300\)[\s\S]*currentPage\.replaceWith\(nextPage\)/);
  assert.match(styles, /\.page\s*\{[^}]*animation:\s*content-enter 600ms 260ms var\(--soft-out\) backwards[^}]*transition:\s*opacity 300ms[^}]*transform 300ms/s);
  assert.doesNotMatch(styles, /\.page\.is-leaving\s*\{[^}]*translateY/s);
  assert.doesNotMatch(styles, /@keyframes page-enter\s*\{[^}]*translateY/s);
  assert.match(styles, /\.page\.is-entering\s*\{\s*animation:\s*page-enter 340ms var\(--soft-out\) backwards/s);
});

test("V78 Home exposes dark Browse and blush Download actions", async () => {
  const [source, styles] = await Promise.all([
    websiteFile("index.php", "utf8"),
    websiteFile("styles.css", "utf8"),
  ]);

  assert.match(source, /class="home-cta home-cta-muted" href="\/\?view=browse" data-site-route>Browse<\/a>/);
  assert.match(source, /class="home-cta" href="\/\?view=download" data-site-route>Download<\/a>/);
  assert.match(styles, /\.home-actions\s*\{[^}]*display:\s*flex/s);
  assert.match(styles, /\.home-cta-muted\s*\{[^}]*background:\s*#191315[^}]*border:\s*1px solid #3c2d30/s);
});

test("V47 website uses the existing product logo unchanged", async () => {
  const [websiteLogo, productLogo] = await Promise.all([
    websiteFile("assets/logo.png"),
    readFile(new URL("../logo.png", import.meta.url)),
  ]);

  assert.deepEqual(websiteLogo, productLogo);
});

test("V51 website shell fills the viewport and introduces motion independently", async () => {
  const styles = await websiteFile("styles.css", "utf8");

  assert.match(styles, /\.site-shell\s*\{[^}]*width:\s*100%/s);
  assert.match(styles, /\.site-shell\s*\{[^}]*height:\s*calc\(100dvh - 32px\)/s);
  assert.doesNotMatch(styles, /gate-shell|gate-content|preview-gate-page/);
  assert.doesNotMatch(styles, /width:\s*min\(380px/);
  for (const animation of [
    "shell-enter",
    "logo-enter",
    "content-enter",
    "cluster-enter",
  ]) {
    assert.match(styles, new RegExp(`@keyframes ${animation}`));
  }
  assert.match(styles, /\.download-cluster\s*\{[^}]*animation:\s*cluster-enter/s);
  assert.doesNotMatch(styles, /prefers-reduced-motion/);
});

test("V52 deployed stylesheet URL changes with the file version", async () => {
  const source = await websiteFile("index.php", "utf8");

  assert.match(
    source,
    /styles\.css\?v=<\?=\s*filemtime\(__DIR__ \. "\/styles\.css"\)\s*\?>/,
  );
});

test("V53 topbar layers the Download cluster above animated page content", async () => {
  const styles = await websiteFile("styles.css", "utf8");

  assert.match(styles, /\.topbar\s*\{[^}]*z-index:\s*[1-9][0-9]*/s);
});

test("V54 Download keeps its dormant dropdown hidden behind the direct route", async () => {
  const [source, styles, menuScript] = await Promise.all([
    websiteFile("index.php", "utf8"),
    websiteFile("styles.css", "utf8"),
    websiteFile("menu.js", "utf8"),
  ]);

  assert.match(source, /download-toggle/);
  assert.match(source, /href="\/\?view=download" data-site-route/);
  assert.match(source, /download-cluster" aria-label="Downloads" hidden/);
  assert.doesNotMatch(source, /aria-expanded="false"/);
  assert.match(
    source,
    /menu\.js\?v=<\?=\s*filemtime\(__DIR__ \. "\/menu\.js"\)\s*\?>/,
  );
  assert.match(
    styles,
    /\.download-menu:not\(\.hover-suppressed\):hover\s+\.download-cluster/,
  );
  assert.match(styles, /\.download-toggle\[aria-expanded="true"\]\s*\+\s*\.download-cluster/);
  assert.match(styles, /\.download-cluster\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(styles, /\.download-cluster::after\s*\{[^}]*height:\s*11px/s);
  assert.match(menuScript, /addEventListener\("click"/);
  assert.match(menuScript, /toggle instanceof HTMLAnchorElement/);
  assert.match(menuScript, /setAttribute\("aria-expanded"/);
  assert.match(menuScript, /classList\.toggle\("hover-suppressed", !open\)/);
  assert.match(menuScript, /addEventListener\("pointerleave"/);
});
