import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
const companionSource = await readFile(new URL("../src/Companion.tsx", import.meta.url), "utf8");
const companionCssSource = await readFile(new URL("../src/companion.css", import.meta.url), "utf8");
const remoteSource = await readFile(new URL("../src/remote.ts", import.meta.url), "utf8");
const viteSource = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
const rustSource = await readFile(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
const rustMainSource = await readFile(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
const cargoSource = await readFile(new URL("../src-tauri/Cargo.toml", import.meta.url), "utf8");
const cargoLockSource = await readFile(new URL("../src-tauri/Cargo.lock", import.meta.url), "utf8");
const readmeSource = await readFile(new URL("../README.md", import.meta.url), "utf8");
const packageMetadata = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const tauriConfig = JSON.parse(
  await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"),
);
const capability = JSON.parse(
  await readFile(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"),
);
const catalog = JSON.parse(
  await readFile(new URL("../cursors/catalog.local.json", import.meta.url), "utf8"),
);
const cursorSources = JSON.parse(
  await readFile(new URL("../cursors/sources.json", import.meta.url), "utf8"),
);
const importerSource = await readFile(
  new URL("../scripts/import_cursor_packs.py", import.meta.url),
  "utf8",
);
const nativeImporterSource = await readFile(
  new URL("../src-tauri/src/importer.rs", import.meta.url),
  "utf8",
);
const buildReleaseSource = await readFile(
  new URL("../scripts/build_windows_release.ps1", import.meta.url),
  "utf8",
);
const rustBuildSource = await readFile(
  new URL("../src-tauri/build.rs", import.meta.url),
  "utf8",
);
const beepoPopGeneratorSource = await readFile(
  new URL("../scripts/create_beepo_pop.py", import.meta.url),
  "utf8",
);
const beepoRoundedGeneratorSource = await readFile(
  new URL("../scripts/create_beepo_rounded.py", import.meta.url),
  "utf8",
);
const beepoCrosshairGeneratorSource = await readFile(
  new URL("../scripts/create_beepo_crosshair.py", import.meta.url),
  "utf8",
);
const pinkMonsterGeneratorSource = await readFile(
  new URL("../scripts/create_pink_monster.py", import.meta.url),
  "utf8",
);

test("main menu exposes every T1 destination", () => {
  assert.match(appSource, /const menuItems = \["Browse", "Settings"\] as const;/);
});

test("custom title bar exposes accessible window controls", () => {
  for (const label of ["Minimize window", "Close window"]) {
    assert.match(appSource, new RegExp(`aria-label=\\"${label}\\"`));
  }
  assert.doesNotMatch(appSource, /Maximize window|toggleMaximize/);
  assert.match(appSource, /onPointerDown=\{startSmoothDrag\}/);
  assert.doesNotMatch(appSource, /data-tauri-drag-region/);
});

test("V27 transparent host disables the Windows 11 native border", () => {
  assert.match(rustSource, /DWMWA_BORDER_COLOR/);
  assert.match(rustSource, /DWMWA_COLOR_NONE/);
  assert.match(
    rustSource,
    /let border_color = DWMWA_COLOR_NONE;[\s\S]*DwmSetWindowAttribute\([\s\S]*DWMWA_BORDER_COLOR[\s\S]*&border_color/,
  );
});

test("V29 CSS is the only painted host surface", () => {
  const window = tauriConfig.app.windows[0];
  assert.equal(window.backgroundColor, "#00000000");
  assert.match(rustSource, /DWMWCP_DONOTROUND/);
  assert.doesNotMatch(rustSource, /DWMWCP_ROUND:\s*u32/);
  assert.match(cssSource, /\.startup-viewport\s*\{[^}]*background:\s*transparent/s);
});

test("V6 native window stays fixed and centered at 800x560", () => {
  const window = tauriConfig.app.windows[0];
  assert.equal(window.decorations, false);
  assert.equal(window.width, 800);
  assert.equal(window.height, 560);
  assert.equal(window.center, true);
  assert.equal(window.transparent, true);
  assert.equal(window.resizable, false);
  assert.equal(window.maximizable, false);
});

test("V25 startup loader waits, reports real work, and expands its shell", () => {
  assert.match(appSource, /const MIN_STARTUP_MS = 2_000/);
  assert.match(appSource, /Loading cursor catalog…/);
  assert.match(appSource, /Checking installed cursors…/);
  assert.match(appSource, /Promise\.all\(\[catalogReady, minimumDelay\]\)/);
  assert.match(appSource, /<div className="startup-loader"/);
  assert.match(appSource, /setStartupExpanding\(true\)/);
  assert.match(cssSource, /@keyframes startup-logo/);
  assert.match(cssSource, /@keyframes startup-window-grow/);
  assert.match(cssSource, /\.app-enter \.titlebar/);
  assert.match(cssSource, /\.app-enter \.page/);
});

test("V26 startup transition never resizes the native window per frame", () => {
  assert.doesNotMatch(appSource, /PhysicalSize|setSize|currentMonitor|outerSize/);
  assert.doesNotMatch(appSource, /setStartupExpanding\(true\)[\s\S]{0,300}setPosition/);
  assert.ok(!capability.permissions.includes("core:window:allow-set-size"));
  assert.match(cssSource, /\.startup-expand[\s\S]*animation:\s*startup-window-grow/);
});

test("V28 startup is temporarily always on top", () => {
  const window = tauriConfig.app.windows[0];
  assert.equal(window.alwaysOnTop, true);
  assert.ok(capability.permissions.includes("core:window:allow-set-always-on-top"));
  assert.match(appSource, /await appWindow\.setAlwaysOnTop\(false\)/);
  assert.match(appSource, /setStartupExpanding\(true\)[\s\S]*await appWindow\.setAlwaysOnTop\(false\)[\s\S]*setStartupLeaving\(true\)[\s\S]*setAppReady\(true\)/);
});

test("V30 title bar drag is app-controlled and lightly smoothed", () => {
  assert.match(appSource, /setSmoothWindowPosition/);
  assert.match(appSource, /onPointerMove=\{moveSmoothDrag\}/);
  assert.match(appSource, /onPointerUp=\{\(event\) => void endSmoothDrag\(event\.pointerId\)\}/);
  assert.doesNotMatch(appSource, /startDragging/);
  assert.ok(!capability.permissions.includes("core:window:allow-set-position"));
});

test("V32 drag prediction is responsive and capped", () => {
  assert.match(appSource, /const DRAG_PREDICTION_MS = 24/);
  assert.match(appSource, /const DRAG_MAX_LEAD = 10/);
  assert.match(appSource, /velocityX/);
  assert.match(appSource, /lastMoveAt/);
  assert.match(appSource, /const idle = now - drag\.lastMoveAt/);
});

test("V33 main navigation reveals from the title bar and frees page width", () => {
  assert.match(appSource, /<nav className="title-tabs" aria-label="Main menu">/);
  assert.doesNotMatch(appSource, /<aside className="main-menu"/);
  assert.match(
    cssSource,
    /\.title-tabs\s*\{[^}]*opacity:\s*0[^}]*transition-delay:\s*4s/s,
  );
  assert.match(
    cssSource,
    /\.titlebar:hover \.title-tabs,[\s\S]*\.title-tabs:focus-within\s*\{[^}]*opacity:\s*1[^}]*transition-delay:\s*0s/s,
  );
  assert.doesNotMatch(cssSource, /grid-template-columns:\s*164px/);
});

test("V34 title tabs drop from the titlebar bottom edge", () => {
  assert.match(
    cssSource,
    /\.title-tabs\s*\{[^}]*top:\s*calc\(100% - 1px\)[^}]*transform:\s*translate\(-50%, -10px\)/s,
  );
  assert.match(cssSource, /\.titlebar\s*\{[^}]*z-index:\s*2/s);
});

test("V35 prediction caps the combined lead vector", () => {
  assert.match(appSource, /Math\.hypot\(leadX, leadY\)/);
  assert.match(appSource, /leadLength > DRAG_MAX_LEAD/);
  assert.doesNotMatch(appSource, /const capLead/);
});

test("V36 collapsed navigation exposes an integrated pull handle", () => {
  assert.match(
    appSource,
    /className="tabs-peek"[\s\S]{0,100}aria-label="Show navigation"/,
  );
  assert.match(cssSource, /\.tabs-peek\s*\{[^}]*width:\s*44px[^}]*height:\s*7px/s);
  assert.match(
    cssSource,
    /\.title-tabs\s*\{[^}]*background:\s*#090708[^}]*border-top:\s*0[^}]*border-radius:\s*0 0 10px 10px/s,
  );
  assert.match(
    cssSource,
    /\.title-tabs button\.active\s*\{[^}]*box-shadow:\s*inset 0 -2px #eebabe/s,
  );
});

test("V37 drag ownership survives repeated pointer input and morphs corners", () => {
  assert.match(appSource, /let dragPointerId: number \| null = null/);
  assert.match(appSource, /let dragFinishing = false/);
  assert.match(appSource, /if \(dragPointerId !== null\) return/);
  assert.match(appSource, /if \(pointerId !== dragPointerId \|\| dragFinishing\) return/);
  assert.match(cssSource, /\.window-shell\s*\{[^}]*transition:\s*border-radius/s);
  assert.match(cssSource, /\.dragging \.window-shell\s*\{[^}]*border-radius:\s*22px/s);
});

test("V43 smooth drag preserves WebView client pixels", () => {
  assert.match(appSource, /invoke<void>\("set_smooth_window_position"/);
  assert.doesNotMatch(appSource, /appWindow\s*\.setPosition/);
  assert.match(rustSource, /fn set_smooth_window_position/);
  assert.match(rustSource, /SetWindowPos/);
  assert.doesNotMatch(rustSource, /InvalidateRgn|SWP_NOCOPYBITS/);
});

test("V44 active drag dims and restores page context gradually", () => {
  assert.match(
    cssSource,
    /\.app-layout\s*\{[^}]*opacity:\s*1[^}]*transition:\s*opacity 660ms cubic-bezier\(\.16, 1, \.3, 1\)/s,
  );
  assert.match(
    cssSource,
    /\.dragging \.app-layout\s*\{[^}]*opacity:\s*\.28[^}]*pointer-events:\s*none[^}]*transition-duration:\s*360ms/s,
  );
  assert.doesNotMatch(
    cssSource,
    /\.dragging \.(?:window-shell|titlebar)\s*\{[^}]*opacity:\s*0/s,
  );
  assert.match(appSource, /document\.documentElement\.classList\.remove\("dragging"\)/);
});

test("V45 drag response uses frame elapsed time", () => {
  assert.match(appSource, /const DRAG_INTERPOLATION_MS = 45/);
  assert.match(appSource, /lastFrameAt/);
  assert.match(
    appSource,
    /1 - Math\.exp\(-frameElapsed \/ DRAG_INTERPOLATION_MS\)/,
  );
  assert.doesNotMatch(appSource, /DRAG_SMOOTHING/);
  assert.match(appSource, /const DRAG_PREDICTION_MS = 24/);
  assert.match(appSource, /const DRAG_MAX_LEAD = 10/);
  assert.match(appSource, /setSmoothWindowPosition\(drag\.targetX, drag\.targetY\)/);
});

test("V39 drawer opens for five seconds on every launch and moves smoothly", () => {
  assert.match(
    cssSource,
    /\.title-tabs\s*\{[^}]*transition:\s*opacity 320ms cubic-bezier\(\.16, 1, \.3, 1\),\s*transform 320ms cubic-bezier\(\.16, 1, \.3, 1\)/s,
  );
  assert.match(
    cssSource,
    /\.app-enter \.title-tabs\s*\{[^}]*animation:\s*launch-tabs-hide 320ms 5s cubic-bezier\(\.16, 1, \.3, 1\) backwards/s,
  );
  assert.match(
    cssSource,
    /\.app-enter \.tabs-peek\s*\{[^}]*animation:\s*launch-peek-show 320ms 5s cubic-bezier\(\.16, 1, \.3, 1\) backwards/s,
  );
  assert.match(cssSource, /@keyframes launch-tabs-hide/);
  assert.match(cssSource, /@keyframes launch-peek-show/);
});

test("V40 visible drawer remains clickable through delayed hide", () => {
  assert.match(cssSource, /\.title-tabs\s*\{[^}]*pointer-events:\s*auto/s);

  const launchStart = cssSource.indexOf("@keyframes launch-tabs-hide");
  const launchEnd = cssSource.indexOf("@keyframes launch-peek-show");
  assert.ok(launchStart >= 0 && launchEnd > launchStart);
  assert.doesNotMatch(cssSource.slice(launchStart, launchEnd), /pointer-events/);
});

test("V31 close uses the app-rendered goodbye shrink", () => {
  assert.match(appSource, /appWindow\.onCloseRequested/);
  assert.match(appSource, /event\.preventDefault\(\)/);
  assert.match(appSource, /onClick=\{\(\) => void beginClose\(\)\}/);
  assert.match(appSource, /await appWindow\.destroy\(\)/);
  assert.ok(capability.permissions.includes("core:window:allow-destroy"));
  assert.match(appSource, /<strong>Cya!<\/strong>/);
  assert.match(appSource, />Closing…<\/span>/);
  assert.match(cssSource, /@keyframes shutdown-window-shrink/);
  assert.match(cssSource, /\.shutdown-shell[\s\S]*animation:\s*shutdown-window-shrink/);
});

test("V9 Windows app icon is a valid ICO resource", async () => {
  const icon = await readFile(new URL("../src-tauri/icons/icon.ico", import.meta.url));
  assert.deepEqual([...icon.subarray(0, 4)], [0, 0, 1, 0]);
  assert.ok(icon.readUInt16LE(4) >= 4, "icon must contain multiple sizes");
});

test("T9 Windows release builds an NSIS installer", () => {
  assert.equal(tauriConfig.bundle.active, true);
  assert.deepEqual(tauriConfig.bundle.targets, ["nsis"]);
  assert.equal(tauriConfig.bundle.publisher, "yfaj");
});

test("V61 releases exclude cursor payloads", () => {
  assert.match(buildReleaseSource, /Copy-Item -LiteralPath \$portable -Destination \(Join-Path \$output "beepo-cursors-portable\.exe"\) -Force/);
  assert.match(buildReleaseSource, /Remove-Item -LiteralPath \(Join-Path \$output "cursors"\) -Recurse -Force/);
  assert.doesNotMatch(buildReleaseSource, /cursorResources/);
  assert.equal(tauriConfig.bundle.resources, undefined);
  assert.doesNotMatch(rustBuildSource, /include_bytes!|EMBEDDED_CURSOR_REVISION|cursor/);
  assert.doesNotMatch(rustSource, /embedded_cursors\.rs|EMBEDDED_CURSOR_FILES/);
  assert.equal(viteSource.includes("publicDir: false"), true);
  assert.doesNotMatch(rustSource, /resource_dir\(\)/);
});

test("V62 missing packs stream through Apply progress", () => {
  assert.match(remoteSource, /response\.body\?\.getReader\(\)/);
  assert.match(remoteSource, /onProgress\(received \/ pack\.packageBytes\)/);
  assert.match(appSource, /"idle" \| "downloading" \| "applying" \| "applied"/);
  assert.match(appSource, /Downloading \$\{Math\.round\(applyProgress \* 100\)\}%/);
  assert.match(cssSource, /\.apply-button\.downloading::before\s*\{[^}]*width:\s*var\(--download-progress, 0%\)/s);
  assert.match(rustSource, /async fn list_cursor_packs[\s\S]*spawn_blocking[\s\S]*load_catalog\(&app\)/);
});

test("V65/V66 website handoff uses one strict installer-owned protocol", () => {
  assert.deepEqual(tauriConfig.plugins?.["deep-link"]?.desktop?.schemes, ["beepocursors"]);
  assert.ok(capability.permissions.includes("core:event:default"));
  assert.ok(capability.permissions.includes("deep-link:default"));
  assert.match(cargoSource, /tauri-plugin-deep-link/);
  assert.match(cargoSource, /tauri-plugin-single-instance.*features = \["deep-link"\]/);
  assert.match(remoteSource, /\^beepocursors:\\\/\\\/apply\\\/\(\[a-z0-9\]\[a-z0-9-\]\{0,127\}\)\$/);
  assert.match(mainSource, /getCurrent\(\)/);
  assert.match(appSource, /onOpenUrl\(/);
  assert.doesNotMatch(`${appSource}\n${mainSource}\n${companionSource}`, /register_all|register\(\s*["']beepocursors/);
  assert.match(rustSource, /app\.deep_link\(\)\.register_all\(\)\?/);
  assert.ok(
    rustSource.indexOf("tauri_plugin_single_instance::init")
      < rustSource.indexOf("tauri_plugin_deep_link::init"),
  );
  assert.match(rustSource, /fn apply_cursor_pack/);
  assert.match(rustSource, /validated_cursor_paths/);
});

test("V67 protocol mode applies once and only a fresh launch closes", () => {
  assert.match(mainSource, /import\("\.\/Companion"\)/);
  assert.match(appSource, /setProtocolRequest\(packId\)/);
  assert.match(companionSource, /getCurrentWindow\(\)\.destroy\(\)/);
  assert.doesNotMatch(appSource, /initialCompanion|closeAfter/);
  assert.doesNotMatch(`${appSource}\n${companionSource}\n${rustSource}`, /autostart|tray/i);
});

test("V90 portable launch self-registers browser Apply without background state", () => {
  assert.match(rustSource, /use tauri_plugin_deep_link::DeepLinkExt/);
  assert.match(rustSource, /\.setup\(\|app\| \{[\s\S]*app\.deep_link\(\)\.register_all\(\)\?/);
  assert.doesNotMatch(`${appSource}\n${mainSource}\n${companionSource}\n${rustSource}`, /autostart|tray/i);
});

test("V86 protocol installs a verified remote pack before applying", () => {
  assert.match(cargoSource, /zip\s*=\s*\{/);
  assert.match(remoteSource, /packageSha256/);
  assert.match(remoteSource, /fetch\(pack\.packageUrl/);
  assert.match(remoteSource, /invoke\("install_remote_cursor_pack"/);
  assert.match(appSource, /remoteStatus === "Checking…"/);
  assert.match(companionSource, /REMOTE_CATALOG_URL\}\?pack=/);
  assert.match(companionSource, /await installRemotePack\(remotePack, setProgress\)/);
  assert.match(companionSource, /await invoke\("apply_cursor_pack", \{ packId \}\)/);
  assert.match(companionSource, /<strong>Applying cursor<\/strong>/);
  assert.doesNotMatch(companionSource, /Finding cursor|Fetching cursor|Applying…|Applying\.\.\./);
  assert.match(rustSource, /fn install_remote_cursor_pack/);
  assert.match(nativeImporterSource, /ZipArchive/);
  assert.match(nativeImporterSource, /enclosed_name\(\)/);
  assert.match(nativeImporterSource, /MAX_REMOTE_PACKAGE_BYTES/);
  assert.match(nativeImporterSource, /Package checksum does not match/);
  assert.match(nativeImporterSource, /content_fingerprint\(&sources\)/);
});

test("V82/V88 fresh browser Apply uses only the compact companion entry", () => {
  assert.equal(tauriConfig.app.windows[0].visible, false);
  assert.ok(capability.permissions.includes("core:window:allow-show"));
  assert.doesNotMatch(mainSource, /^import App/m);
  assert.match(mainSource, /import\("\.\/Companion"\)/);
  assert.match(mainSource, /import\("\.\/App"\)/);
  assert.match(mainSource, /flushSync\(\(\) => root\.render/);
  assert.match(mainSource, /getCurrentWindow\(\)\.show\(\)/);
  assert.ok(mainSource.indexOf("flushSync") < mainSource.indexOf("getCurrentWindow().show()"));
  assert.match(companionSource, /import "\.\/companion\.css"/);
  assert.match(appSource, /import "\.\/styles\.css"/);
  assert.doesNotMatch(companionSource, /Browse|Settings|titlebar/);
  assert.match(companionSource, /`Downloading \$\{Math\.round\(progress \* 100\)\}%`/);
  assert.match(companionSource, /"Applying"/);
  assert.match(companionSource, /"Applied"/);
  assert.match(companionSource, /"Could not apply cursor"/);
  assert.match(companionCssSource, /\.companion-window\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/s);
  assert.doesNotMatch(companionCssSource, /companion-glow|box-shadow/);
  assert.match(rustSource, /fn fresh_companion_launch\(\)/);
  assert.match(rustSource, /if fresh_companion_launch\(\)[\s\S]*\(320\.0, 220\.0\)[\s\S]*\(800\.0, 560\.0\)/);
  assert.match(rustSource, /window\.set_size\([\s\S]*window\.center\(\)/);
});

test("V89 browser companion animates out before destroying its host", () => {
  assert.match(companionSource, /setClosing\(true\)[\s\S]*await wait\(420\)[\s\S]*getCurrentWindow\(\)\.destroy\(\)/);
  assert.match(companionSource, /closing \? " is-closing"/);
  assert.match(companionCssSource, /\.is-closing \.companion-window\s*\{[^}]*companion-exit 420ms/s);
  assert.match(companionCssSource, /@keyframes companion-exit\s*\{[\s\S]*opacity:\s*0[\s\S]*scale\(\.9\)/);
});

test("V94 companion keeps one full-bleed blush shell in success", () => {
  assert.doesNotMatch(companionCssSource, /calc\(100% - 16px\)|box-shadow|companion-glow|border-color:\s*#9fe2b1/);
  assert.match(companionCssSource, /\.companion-window\s*\{[^}]*border-radius:\s*12px/s);
  assert.match(companionCssSource, /\.is-applied \.companion-window\s*\{[^}]*border-color:\s*#5a3a40/s);
  assert.match(companionCssSource, /\.is-applied \.companion-copy span\s*\{[^}]*color:\s*#9fe2b1/s);
});

test("V38 NSIS installer explicitly uses the Beepo Cursors app logo", () => {
  assert.equal(tauriConfig.bundle.windows.nsis.installerIcon, "icons/icon.ico");
});

test("V41 product and package identity is beepo-cursors", () => {
  assert.equal(packageMetadata.name, "beepo-cursors");
  assert.equal(packageMetadata.version, "1.2.0");
  assert.equal(tauriConfig.productName, "Beepo Cursors");
  assert.equal(tauriConfig.version, "1.2.0");
  assert.equal(tauriConfig.identifier, "com.yfaj.beepo-cursors");
  assert.equal(tauriConfig.app.windows[0].title, "Beepo Cursors");
  assert.match(cargoSource, /name = "beepo-cursors"/);
  assert.match(cargoSource, /name = "beepo_cursors_lib"/);
  assert.match(cargoSource, /version = "1\.2\.0"/);
  assert.match(cargoLockSource, /name = "beepo-cursors"\s+version = "1\.2\.0"/);
  assert.match(appSource, /Beepo Cursors · 1\.2/);
  assert.match(rustMainSource, /beepo_cursors_lib::run\(\)/);

  const trackedBranding = [
    appSource,
    rustSource,
    rustMainSource,
    cargoSource,
    cargoLockSource,
    readmeSource,
    JSON.stringify(packageMetadata),
    JSON.stringify(tauriConfig),
    JSON.stringify(capability),
  ].join("\n");
  assert.doesNotMatch(trackedBranding, /red(?:[._'-]?lie|['’]s Cursors)/i);
});

test("V42 startup and titlebar show Beepo Cursors", () => {
  assert.match(appSource, /<strong>Beepo <span className="brand-accent">Cursors<\/span><\/strong>/);
  assert.match(appSource, /<span>Beepo <span className="brand-accent">Cursors<\/span><\/span>/);
});

test("V55 desktop brand accents only Cursors with the theme color", () => {
  assert.match(cssSource, /\.brand-accent\s*\{[^}]*color:\s*#eebabe/s);
});

test("V22 packaged Windows launch has no terminal", () => {
  assert.match(rustMainSource, /cfg_attr\(not\(debug_assertions\), windows_subsystem = "windows"\)/);
});

test("V23 cursor schemes use one registry import", () => {
  assert.match(rustSource, /fn import_cursor_scheme/);
  assert.match(rustSource, /Windows Registry Editor Version 5\.00/);
  assert.doesNotMatch(rustSource, /for \(name, path\)[\s\S]*set_registry_cursor/);
});

test("V10 Vite ignores Rust build output", () => {
  assert.match(viteSource, /ignored:\s*\["\*\*\/src-tauri\/\*\*"\]/);
});

test("V11 main menu contains no informational filler", () => {
  for (const filler of [
    "menu-heading",
    "menu-footer",
    "eyebrow",
    "page-copy",
    "empty-state",
    "Cursor catalog comes next",
  ]) {
    assert.doesNotMatch(appSource, new RegExp(filler));
  }
});

test("source catalog retains packs and attribution", async () => {
  assert.equal(catalog.packs.length, 7);
  for (const [name, author] of [
    ["Beepo Pop", "Beepo Cursors"],
    ["Beepo Rounded", "Beepo Cursors"],
    ["Athema White", "Anaidon"],
  ]) {
    assert.equal(catalog.packs.find((pack) => pack.name === name)?.author, author);
  }
  assert.equal(Object.keys(catalog.packs.find((pack) => pack.name === "Beepo Pop")?.roles ?? {}).length, 17);
  assert.equal(Object.keys(catalog.packs.find((pack) => pack.name === "Beepo Rounded")?.roles ?? {}).length, 17);
  assert.match(appSource, /useState<CursorPack\[\]>\(\[\]\)/);
  assert.doesNotMatch(appSource, /localCatalog|bundledPacks/);
  assert.match(appSource, /href=\{selectedPack\.authorUrl\}/);
  assert.match(appSource, /href=\{pack\.authorUrl\}/);
  assert.match(appSource, /arrow cursor preview/);
  assert.match(appSource, /roleOrder\.map\(\(role\) => \{/);
  assert.match(appSource, /apply_cursor_pack/);
  assert.match(appSource, /restore_windows_default_cursors/);
  assert.equal(appSource.match(/openCreator\(event,/g)?.length, 1);
  assert.match(rustSource, /fn open_creator_profile/);
  assert.match(appSource, /cursor-overlay/);
  assert.match(rustSource, /cursor-scheme-backup\.reg/);
  assert.match(rustSource, /SystemParametersInfoW/);
  assert.match(rustSource, /\("Crosshair", ""\)/);
  assert.match(rustSource, /import_cursor_scheme\(&app, "Windows Aero", &cursors\)/);
  assert.equal(tauriConfig.bundle.resources, undefined);
  assert.match(cssSource, /\.pack-thumbnail img\s*\{[^}]*width:\s*64px/s);
  assert.match(cssSource, /\.cursor-overlay\s*\{[^}]*width:\s*32px/s);
  const preview = catalog.packs[0].preview.replace(/^\//, "../public/");
  assert.ok((await readFile(new URL(preview, import.meta.url))).length > 0);
});

test("V84 Beepo Crosshair is a centered non-Featured remote pack", () => {
  const crosshair = catalog.packs.find((pack) => pack.name === "Beepo Crosshair");
  const white = catalog.packs.find((pack) => pack.name === "Beepo Crosshair (White)");
  assert.equal(crosshair?.author, "Beepo");
  assert.equal(crosshair?.distribution, true);
  assert.equal(Object.keys(crosshair?.roles ?? {}).length, 17);
  assert.deepEqual(crosshair?.roles.arrow.hotspot, [16, 16]);
  assert.match(beepoCrosshairGeneratorSource, /arms = \(/);
  assert.match(beepoCrosshairGeneratorSource, /"arrow": \(32, 32\)/);
  assert.match(beepoCrosshairGeneratorSource, /crosshair\(image, color, diagonal=role in \{"help", "linkSelect"\}\)/);
  assert.match(beepoCrosshairGeneratorSource, /diagonal=role in \{"help", "linkSelect"\}/);
  assert.doesNotMatch(beepoCrosshairGeneratorSource, /question_mark\(draw, 48, 15\)/);
  assert.doesNotMatch(beepoCrosshairGeneratorSource, /question_badge|crosshair_glow|GaussianBlur/);
  assert.doesNotMatch(beepoCrosshairGeneratorSource, /"author": "Beepo Cursors"/);
  assert.equal(white?.author, "Beepo");
  assert.equal(Object.keys(white?.roles ?? {}).length, 17);
  assert.equal(cursorSources["Beepo Crosshair White"].distribution, true);
  for (const role of Object.keys(crosshair?.roles ?? {})) {
    assert.deepEqual(white?.roles[role].hotspot, crosshair?.roles[role].hotspot);
  }
  assert.match(beepoCrosshairGeneratorSource, /WHITE = \(238, 239, 242, 255\)/);
  assert.match(beepoCrosshairGeneratorSource, /"Beepo Crosshair \(White\)"/);
  assert.match(beepoCrosshairGeneratorSource, /pink\.getchannel\("A"\)\.tobytes\(\) != white\.getchannel\("A"\)\.tobytes\(\)/);
  assert.match(beepoCrosshairGeneratorSource, /raise ValueError\(f"\{role\}: white variant geometry drifted"\)/);
});

test("V95 Pink Monster is extracted identically from its approved 1:1 cells", () => {
  const pack = catalog.packs.find((candidate) => candidate.name === "Pink Monster");
  assert.ok(pack);
  assert.equal(Object.keys(pack.roles).length, 17);
  assert.equal(cursorSources["Pink Monster"].author, "Beepo Cursors");
  assert.equal(cursorSources["Pink Monster"].distribution, true);
  assert.match(pinkMonsterGeneratorSource, /SOURCE_CELL = 220/);
  assert.match(pinkMonsterGeneratorSource, /MASTER_SIZE = 128/);
  assert.match(pinkMonsterGeneratorSource, /image\.resize\(\(32, 32\), Image\.Resampling\.NEAREST\)[\s\S]*image\.resize\(\(64, 64\), Image\.Resampling\.NEAREST\)[\s\S]*image,/);
  assert.match(pinkMonsterGeneratorSource, /if actual\.tobytes\(\) != expected\.tobytes\(\)/);
  assert.match(pinkMonsterGeneratorSource, /raise ValueError\(f"\{role\}: generated cursor drifted from approved art"\)/);
  assert.match(pinkMonsterGeneratorSource, /raise ValueError\(f"\{role\}: approved artwork touches the cursor edge"\)/);
  assert.match(pinkMonsterGeneratorSource, /pink-monster-comparison\.png/);
  assert.match(pinkMonsterGeneratorSource, /if role == "move":\s+sprite = Image\.new\("RGBA", \(MASTER_SIZE, MASTER_SIZE\)\)\s+draw_move_cross\(sprite\)\s+return sprite/);
  assert.match(pinkMonsterGeneratorSource, /def draw_move_cross\(sprite: Image\.Image\)/);
});

test("V101 retired Beepo Dot variants are absent from the app catalog", () => {
  assert.equal(catalog.packs.some((pack) => pack.name.startsWith("Beepo Dot")), false);
  assert.equal(Object.keys(cursorSources).some((name) => name.startsWith("Beepo Dot")), false);
});

test("V103 Beepo Crosshair Mini is a published centered plus pack", async () => {
  const generator = await readFile(
    new URL("../scripts/create_beepo_plus.py", import.meta.url),
    "utf8",
  ).catch(() => "");
  const pack = catalog.packs.find((candidate) => candidate.name === "Beepo Crosshair Mini");
  assert.ok(pack);
  assert.equal(Object.keys(pack.roles).length, 17);
  assert.equal(cursorSources["Beepo Crosshair Mini"].distribution, true);
  assert.match(generator, /MASTER_SIZE = 64/);
  assert.match(generator, /HOTSPOTS = \{[^}]*\(32, 32\)/s);
  assert.match(generator, /def x_mark\(/);
  assert.doesNotMatch(generator, /def question\(/);
  assert.match(generator, /rounded|soft/i);
  assert.match(generator, /PINK|#eebabe/i);
});

test("V85 Beepo diagonal resize roles follow Windows directions", () => {
  for (const source of [beepoPopGeneratorSource, beepoRoundedGeneratorSource]) {
    assert.match(source, /role == "diagonalResize1":[\s\S]{0,80}\(12, 12\), \(52, 52\)/);
    assert.match(source, /role == "diagonalResize2":[\s\S]{0,80}\(12, 52\), \(52, 12\)/);
  }
});

test("Beepo packs retain their separate arrow sources", async () => {
  assert.match(beepoRoundedGeneratorSource, /REFERENCE_POINTER = ROOT \/ "assets" \/ "beepo-pop-pointer\.png"/);
  assert.match(beepoRoundedGeneratorSource, /ROUNDED_PACK = ROOT \/ "cursors" \/ "Beepo Rounded"/);
  assert.match(beepoRoundedGeneratorSource, /for radius, opacity in \(\(3, 90\), \(1, 210\)\)/);
  assert.match(beepoRoundedGeneratorSource, /def write_ani/);
  assert.match(beepoPopGeneratorSource, /write_pack\(POP_PACK, "Beepo Pop"\)/);
  assert.doesNotMatch(beepoPopGeneratorSource, /Beepo Signature/);
  assert.deepEqual(catalog.packs.find((pack) => pack.name === "Beepo Pop")?.roles.linkSelect.hotspot, [6, 4]);
  const rounded = catalog.packs.find((pack) => pack.name === "Beepo Rounded");
  assert.deepEqual(rounded?.roles.linkSelect.hotspot, [5, 2]);
  for (const role of ["workingInBackground", "busy"]) {
    const file = rounded?.roles[role]?.file;
    assert.match(file ?? "", /\.ani$/);
    assert.match(rounded?.roles[role]?.hover ?? "", /\.webp$/);
    const cursor = await readFile(new URL(`../cursors/Beepo Rounded/${file}`, import.meta.url));
    assert.equal(cursor.subarray(0, 4).toString(), "RIFF");
    assert.equal(cursor.subarray(8, 12).toString(), "ACON");
  }
  assert.ok((await readFile(new URL("../assets/beepo-pop-pointer.png", import.meta.url))).length > 0);
});

test("Beepo Pop keeps sharp support cursors full-size and animated", async () => {
  const pop = catalog.packs.find((pack) => pack.name === "Beepo Pop");
  assert.deepEqual(pop?.roles.help.hotspot, pop?.roles.arrow.hotspot);
  assert.deepEqual(pop?.roles.workingInBackground.hotspot, pop?.roles.arrow.hotspot);
  assert.match(beepoPopGeneratorSource, /ANIMATED_ROLES = \{"workingInBackground", "busy"\}/);
  assert.match(beepoPopGeneratorSource, /BADGE_CENTER = \(46, 15\)/);
  assert.match(beepoPopGeneratorSource, /elif role == "help":\s*pointer\(draw\)\s*question_badge/s);
  assert.match(beepoPopGeneratorSource, /elif role == "workingInBackground":\s*pointer\(draw\)\s*spinner/s);
  assert.doesNotMatch(beepoPopGeneratorSource, /signature/);
  for (const role of ["workingInBackground", "busy"]) {
    const file = pop?.roles[role]?.file;
    assert.match(file ?? "", /\.ani$/);
    assert.match(pop?.roles[role]?.hover ?? "", /\.webp$/);
    const cursor = await readFile(new URL(`../cursors/Beepo Pop/${file}`, import.meta.url));
    assert.equal(cursor.subarray(0, 4).toString(), "RIFF");
    assert.equal(cursor.subarray(8, 12).toString(), "ACON");
  }
});

test("V63 Beepo Rounded overlays Help and Working without shrinking the pointer", () => {
  const rounded = catalog.packs.find((pack) => pack.name === "Beepo Rounded");
  assert.deepEqual(rounded?.roles.help.hotspot, rounded?.roles.arrow.hotspot);
  assert.deepEqual(rounded?.roles.workingInBackground.hotspot, rounded?.roles.arrow.hotspot);
  assert.match(beepoRoundedGeneratorSource, /BADGE_CENTER = \(44, 15\)/);
  assert.match(beepoRoundedGeneratorSource, /elif role == "help":\s*pointer\(image\)\s*question_badge/s);
  assert.match(beepoRoundedGeneratorSource, /elif role == "workingInBackground":\s*pointer\(image\)\s*spinner/s);
  assert.match(beepoRoundedGeneratorSource, /def question_mark/);
});

test("V16 importer is non-executing and generic apply validates catalog paths", () => {
  assert.match(importerSource, /suffix\.casefold\(\) == "\.inf"/);
  assert.match(importerSource, /\{"\.cur", "\.ani"\}/);
  assert.doesNotMatch(importerSource, /subprocess|os\.system|startfile/);
  assert.match(rustSource, /fn validated_cursor_paths/);
  assert.match(rustSource, /path\.starts_with\(&pack_root\)/);
  assert.match(rustSource, /fn apply_cursor_pack/);
});

test("V17 Browse omits Recent and opens merged-library search", () => {
  assert.doesNotMatch(appSource, /recent-packs|recentIds|recentPacks|rememberPack/);
  assert.doesNotMatch(appSource, /<h1>Recent<\/h1>/);
  assert.match(appSource, /const featuredPacks = packs\.filter\(\(pack\) => pack\.author === "Beepo Cursors"\)/);
  assert.match(appSource, /items=\{featuredPacks\}/);
  assert.match(appSource, /aria-label="Search cursors"/);
  assert.match(appSource, /items=\{visiblePacks\}/);
  assert.match(cssSource, /\.installed-search-toggle\s*\{[^}]*width:\s*28px/s);
  assert.match(cssSource, /\.installed-search\s*\{[^}]*height:\s*32px/s);
});

test("V24 scrollable surfaces use the app scrollbar", () => {
  assert.match(cssSource, /\*::\-webkit-scrollbar\s*\{/);
  assert.match(cssSource, /scrollbar-color:\s*#6a4b51 #100d0e/);
  assert.match(cssSource, /\*::\-webkit-scrollbar-thumb[\s\S]*border-radius:\s*999px/);
});

test("V19 Settings imports and normalizes a selected folder", () => {
  assert.match(appSource, /activeItem === "Settings"/);
  assert.match(appSource, /Import folder/);
  assert.match(appSource, /open\(\{ directory: true, multiple: false/);
  assert.match(appSource, /invoke<\{ packs: CursorPack\[\] \}>\("import_cursor_folder"/);
  assert.match(nativeImporterSource, /format!\("\{role\}\.\{extension\}"\)/);
  assert.match(nativeImporterSource, /cursor-imports/);
  assert.match(nativeImporterSource, /user-cursors\.json/);
  assert.doesNotMatch(nativeImporterSource, /Command::new|\.inf"\)/);
});

test("V20 clicked pack previews use canonical role order", () => {
  assert.match(appSource, /roleOrder\.map\(\(role\) => \{/);
  assert.doesNotMatch(appSource, /Object\.entries\(selectedPack\.roles\)/);
});

test("V56 detail previews preserve generated artwork quality", () => {
  assert.match(
    cssSource,
    /\.state-preview img\s*\{[^}]*width:\s*72%[^}]*height:\s*72%[^}]*object-fit:\s*contain[^}]*image-rendering:\s*auto/s,
  );
  assert.match(cssSource, /\.cursor-overlay\s*\{[^}]*width:\s*32px[^}]*height:\s*32px/s);
});

test("V57 startup and shutdown fade content before swapping shells", () => {
  assert.match(appSource, /const CONTENT_FADE_MS = 300/);
  assert.match(appSource, /setClosing\(true\);\s*await wait\(CONTENT_FADE_MS\);\s*setShowGoodbye\(true\)/s);
  assert.match(appSource, /setStartupLeaving\(true\);\s*await wait\(CONTENT_FADE_MS\);[\s\S]*setAppReady\(true\)/s);
  assert.match(cssSource, /\.startup-loader\s*\{[^}]*transition:\s*opacity 300ms/s);
  assert.match(cssSource, /\.startup-leaving \.startup-loader\s*\{[^}]*opacity:\s*0/s);
  assert.match(cssSource, /\.app-closing \.titlebar,[\s\S]*\.app-closing \.app-layout\s*\{[^}]*opacity:\s*0/s);
});

test("V58 hover hotspots match their 32px preview assets", () => {
  assert.match(importerSource, /def scale_hotspot\(hotspot: tuple\[int, int\], size: tuple\[int, int\]\) -> list\[int\]:/);
  assert.match(importerSource, /scale_hotspot\(headers\[0\]\[1\], headers\[0\]\[0\]\[0\]\.size\)/);
  assert.match(nativeImporterSource, /fn scale_hotspot\(hotspot: \[u16; 2\], width: u32, height: u32\) -> \[u16; 2\]/);
  assert.match(nativeImporterSource, /hotspot:\s*scale_hotspot\(\s*\[hotspot\.0, hotspot\.1\],\s*native_entry\.width\(\),\s*native_entry\.height\(\)/);
});

test("V59 Tauri scripts use the installed npm launcher", () => {
  assert.equal(tauriConfig.build.beforeDevCommand, "npm run dev");
  assert.equal(tauriConfig.build.beforeBuildCommand, "npm run build");
});

test("V60 Apply feedback stays inside a smoothly resizing button", () => {
  assert.match(appSource, /const APPLY_FEEDBACK_MS = 1_200/);
  assert.match(appSource, /const \[applyState, setApplyState\] = useState<"idle" \| "downloading" \| "applying" \| "applied">\("idle"\)/);
  assert.match(appSource, /setApplyState\("downloading"\)[\s\S]*setApplyState\("applying"\)[\s\S]*invoke\("apply_cursor_pack"[\s\S]*setApplyState\("applied"\)[\s\S]*await wait\(APPLY_FEEDBACK_MS\)[\s\S]*setApplyState\("idle"\)/);
  assert.match(appSource, /className=\{`primary-button apply-button \$\{applyState\}`\}/);
  assert.match(appSource, /disabled=\{applyState === "applying" \|\| applyState === "downloading"\}/);
  assert.match(cssSource, /\.apply-button\s*\{[^}]*display:\s*grid[^}]*place-items:\s*center[^}]*width:\s*80px[^}]*padding:\s*0[^}]*transition:\s*width 240ms/s);
  assert.match(cssSource, /\.pack-actions \.apply-button\s*\{[^}]*padding-inline:\s*0/s);
  assert.match(cssSource, /\.apply-button span\s*\{[^}]*place-items:\s*center[^}]*padding-inline:\s*14px[^}]*line-height:\s*1/s);
  assert.match(cssSource, /\.apply-button\.downloading\s*\{[^}]*width:\s*144px/s);
  assert.match(cssSource, /\.apply-button\.applying\s*\{[^}]*width:\s*96px/s);
  assert.match(cssSource, /\.apply-button\.applied\s*\{[^}]*animation:\s*apply-bloom 900ms/s);
  assert.match(cssSource, /@keyframes apply-bloom/);
});

test("V87 legacy bundled cache is removed and app data owns every installed pack", () => {
  assert.ok(Object.entries(cursorSources).every(([name, source]) => source.distribution === !["FTBIY Cursors 0.1", "FTBIY Cursor 0.2", "avalanche cursor", "free_cursors_pack_by_stardust2955_djsmdri"].includes(name)));
  assert.match(rustSource, /app_data_dir\(\)[\s\S]*root\.join\("bundled-cursors"\)[\s\S]*remove_dir_all\(legacy\)/);
  assert.match(rustSource, /importer::load_user_catalog\(app\)/);
  assert.match(rustSource, /let root = importer::imported_pack_root\(&app, ""\)\?/);
  assert.match(readmeSource, /Delete application data[\s\S]*removes downloaded and imported packs/);
});

test("content swaps fade between catalog and pack details", () => {
  assert.match(appSource, /const CONTENT_SWAP_MS = 180/);
  assert.match(appSource, /const \[contentLeaving, setContentLeaving\] = useState\(false\)/);
  assert.match(appSource, /const contentTransitioning = useRef\(false\)/);
  assert.match(appSource, /async function transitionContent\(nextItem: MenuItem, packId: string \| null\)[\s\S]*setContentLeaving\(true\)[\s\S]*await wait\(CONTENT_SWAP_MS\)[\s\S]*setActiveItem\(nextItem\)[\s\S]*setSelectedPackId\(packId\)/);
  assert.match(appSource, /onClick=\{\(\) => void transitionContent\(activeItem, null\)\}/);
  assert.match(appSource, /onSelect=\{\(packId\) => void transitionContent\(activeItem, packId\)\}/);
  assert.match(cssSource, /\.page-content\s*\{[^}]*animation:\s*content-fade-in 240ms/s);
  assert.match(cssSource, /\.page-content\.is-leaving\s*\{[^}]*opacity:\s*0[^}]*pointer-events:\s*none/s);
});

test("V21 Browse groups variants without hiding packs", () => {
  assert.match(appSource, /function familyName\(pack: CursorPack\)/);
  assert.match(appSource, /function variantLabel\(pack: CursorPack\)/);
  assert.match(appSource, /<FamilyGrid/);
  assert.match(appSource, /selectedFamily\.length > 1/);
  assert.match(appSource, /<select[\s\S]*transitionContent\(activeItem, event\.target\.value\)/);
  assert.match(appSource, /items=\{visiblePacks\}/);
});

test("V79 Browse merges online packs and marks exact local fingerprints", () => {
  assert.ok(catalog.packs.every((pack) => /^[a-f0-9]{64}$/.test(pack.fingerprint ?? "")));
  assert.match(remoteSource, /const REMOTE_CATALOG_URL = "https:\/\/cursors\.lie\.red\/distribution\.php"/);
  assert.match(appSource, /function mergeCatalogPacks\(localPacks: CursorPack\[\], remotePacks: RemotePack\[\]\)/);
  assert.match(appSource, /new Set\(localPacks\.map\(\(pack\) => pack\.fingerprint\)/);
  assert.match(appSource, /fetch\(REMOTE_CATALOG_URL/);
  assert.match(appSource, /className="installed-marker"/);
  assert.match(appSource, /aria-label="Installed"/);
  assert.match(cssSource, /\.installed-marker::after\s*\{[^}]*content:\s*"Installed"/s);
  assert.match(importerSource, /def content_fingerprint/);
  assert.match(rustSource, /fingerprint: String/);
  assert.match(nativeImporterSource, /Sha256/);
});

test("V91 remote static previews remain while live hover requires installation", () => {
  assert.match(appSource, /const detail = parseRemotePackDetail\(value\)/);
  assert.match(appSource, /Cursor previews unavailable/);
  assert.match(appSource, /const liveHover = selectedPack\.installed \? cursor\.hover : ""/);
  assert.match(appSource, /onMouseEnter=\{liveHover \? movePreview : undefined\}/);
  assert.match(appSource, /url: liveHover/);
  assert.doesNotMatch(appSource, /selectedPack\.installed && <div className="cursor-grid">/);
});

test("V93 Windows pointer hides only when a live hover replacement exists", () => {
  assert.match(appSource, /className=\{`cursor-state\$\{liveHover \? " has-live-hover" : ""\}`\}/);
  assert.match(cssSource, /\.cursor-state\.has-live-hover\s*\{\s*cursor:\s*none/);
  assert.doesNotMatch(cssSource, /\.cursor-state\s*\{[^}]*cursor:\s*none/s);
});

test("V81 Settings keeps only library and catalog controls", () => {
  assert.match(appSource, /Open library folder/);
  assert.match(appSource, /Refresh catalog/);
  assert.match(appSource, /Online catalog:/);
  assert.match(appSource, /invoke\("open_cursor_library"\)/);
  assert.match(rustSource, /fn open_cursor_library/);
  assert.doesNotMatch(appSource, /theme setting|appearance setting|color scheme/i);
});

test("V74 app pack cards fade Normal Select before Link Select grows in", () => {
  assert.match(appSource, /function PackOpenButton/);
  assert.match(appSource, /const linkPreview = pack\.roles\.linkSelect\?\.preview \?\? pack\.preview/);
  assert.match(appSource, /<img className="pack-normal-preview" src=\{pack\.preview\} alt=\{alt\} \/>/);
  assert.match(appSource, /<img className="pack-link-preview" src=\{linkPreview\} alt="" \/>/);
  assert.match(appSource, /window\.setTimeout\(\(\) => setShowLinkPreview\(true\), 300\)/);
  assert.match(appSource, /onMouseEnter=\{\(\) => setPreviewHovered\(true\)\}/);
  assert.match(appSource, /onMouseLeave=\{\(\) => \{\s*setShowLinkPreview\(false\);\s*setPreviewHovered\(false\);/s);
  assert.match(cssSource, /\.pack-thumbnail\s*\{[^}]*position:\s*relative/s);
  assert.match(cssSource, /\.pack-thumbnail img\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0[^}]*margin:\s*auto[^}]*opacity 300ms[^}]*transform 300ms/s);
  assert.match(cssSource, /\.pack-thumbnail\.is-switching \.pack-normal-preview\s*\{[^}]*opacity:\s*\.18[^}]*scale\(\.94\)/s);
  assert.match(cssSource, /\.pack-thumbnail\.is-link-preview \.pack-link-preview\s*\{[^}]*scale\(1\.1\)/s);
});
