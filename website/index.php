<?php

declare(strict_types=1);

header("Content-Security-Policy: default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
header("Referrer-Policy: no-referrer");
header("X-Content-Type-Options: nosniff");
header("X-Frame-Options: DENY");

$requestedView = (string) ($_GET["view"] ?? "");
$view = in_array($requestedView, ["browse", "download"], true) ? $requestedView : "home";
$catalogPath = dirname(__DIR__) . "/private/catalog.local.json";
$catalogVersion = is_file($catalogPath) ? (string) filemtime($catalogPath) : "0";
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <meta name="view-transition" content="same-origin">
    <title>Beepo Cursors</title>
    <link rel="stylesheet" href="/styles.css?v=<?= filemtime(__DIR__ . "/styles.css") ?>">
    <script src="/menu.js?v=<?= filemtime(__DIR__ . "/menu.js") ?>" defer></script>
    <?php if ($view === "browse"): ?>
        <script src="/catalog.js?v=<?= filemtime(__DIR__ . "/catalog.js") ?>" defer></script>
    <?php endif; ?>
</head>
<body class="site-page">
    <div class="site-shell">
        <header class="topbar">
            <div class="brand">
                <img src="/assets/logo.png" alt="">
                <span>Beepo <span class="brand-accent">Cursors</span></span>
            </div>

            <nav class="top-tabs" aria-label="Main menu">
                <a class="top-tab<?= $view === "home" ? " active" : "" ?>" href="/" data-site-route<?= $view === "home" ? " aria-current=\"page\"" : "" ?>>Home</a>
                <a class="top-tab<?= $view === "browse" ? " active" : "" ?>" href="/?view=browse" data-site-route<?= $view === "browse" ? " aria-current=\"page\"" : "" ?>>Browse</a>
                <div class="download-menu">
                    <a class="top-tab download-toggle<?= $view === "download" ? " active" : "" ?>" href="/?view=download" data-site-route<?= $view === "download" ? " aria-current=\"page\"" : "" ?>>Download</a>
                    <div id="download-options" class="download-cluster" aria-label="Downloads" hidden></div>
                </div>
            </nav>

            <a class="discord-link" href="https://discord.gg/beep" target="_blank" rel="noreferrer" aria-label="Join our Discord">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18.9 5.3a16.7 16.7 0 0 0-4.1-1.2l-.5 1a15.3 15.3 0 0 0-4.6 0l-.5-1a16.7 16.7 0 0 0-4.1 1.2C2.5 9.1 1.8 12.8 2.2 16.5a16.9 16.9 0 0 0 5 2.5l1.2-1.7a10.8 10.8 0 0 1-1.9-.9l.5-.4a11.9 11.9 0 0 0 10 0l.5.4a10.8 10.8 0 0 1-1.9.9l1.2 1.7a16.9 16.9 0 0 0 5-2.5c.5-4.3-.8-7.9-2.9-11.2ZM8.7 14.4c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"/>
                </svg>
            </a>
        </header>
        <?php if ($view === "browse"): ?>
            <main class="page" aria-label="Cursor catalog">
                    <section class="catalog" data-catalog-url="/catalog.php?v=<?= $catalogVersion ?>">
                    <header class="catalog-header">
                        <div>
                            <p class="catalog-kicker">Cursor library</p>
                            <h1>Browse cursors</h1>
                        </div>
                        <label class="catalog-search" for="cursor-search">
                            <span class="sr-only">Search cursors</span>
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <circle cx="10.5" cy="10.5" r="5.5"></circle>
                                <path d="m15 15 4.5 4.5"></path>
                            </svg>
                            <input id="cursor-search" type="search" placeholder="Search cursors" autocomplete="off">
                        </label>
                    </header>
                    <p class="catalog-status" data-catalog-status role="status">Loading cursor library…</p>
                    <section class="catalog-section featured-section" data-featured-section hidden>
                        <h2>Featured</h2>
                        <div class="catalog-grid featured-grid" data-featured-grid></div>
                    </section>
                    <section class="catalog-section">
                        <h2>All cursors</h2>
                        <div class="catalog-grid" data-catalog-grid aria-live="polite"></div>
                    </section>
                    <aside class="mobile-windows-note" data-mobile-windows-note hidden role="status" aria-live="polite">
                        <strong>Windows PC only</strong>
                        <span>You can only change cursors on a Windows PC.</span>
                    </aside>
                </section>
            </main>

            <dialog class="catalog-dialog" data-catalog-dialog aria-labelledby="catalog-detail-title">
                <div class="catalog-dialog-shell">
                    <header class="catalog-detail-header">
                        <button class="catalog-back" type="button" data-catalog-close>← Back</button>
                        <div class="catalog-detail-identity">
                            <h2 id="catalog-detail-title" data-catalog-title></h2>
                            <a data-catalog-author target="_blank" rel="noreferrer"></a>
                        </div>
                        <div class="catalog-detail-actions">
                            <label class="catalog-variants" data-catalog-variant-wrap>
                                <span>Variant</span>
                                <select data-catalog-variants aria-label="Cursor variant"></select>
                            </label>
                            <button class="catalog-apply" type="button" data-catalog-apply>Apply</button>
                        </div>
                    </header>
                    <div class="catalog-state-grid" data-catalog-state-grid></div>
                    <div class="catalog-handoff" data-catalog-handoff hidden role="status" aria-live="polite">
                        <div class="catalog-handoff-card">
                            <span class="catalog-handoff-spinner" aria-hidden="true"></span>
                            <strong data-catalog-handoff-title>Opening Beepo Cursors…</strong>
                            <p data-catalog-handoff-copy>Applying this cursor pack in the app.</p>
                            <div class="catalog-handoff-actions">
                                <button type="button" data-catalog-handoff-retry hidden>Try again</button>
                                <a class="catalog-handoff-download" href="/?view=download" data-catalog-handoff-download data-site-route hidden>Download</a>
                            </div>
                        </div>
                    </div>
                </div>
            </dialog>
        <?php elseif ($view === "download"): ?>
            <main class="page download-page" aria-label="Downloads">
                <section class="download-page-content" aria-labelledby="download-title">
                    <div>
                        <p class="catalog-kicker">Beepo Cursors 1.2</p>
                        <h1 id="download-title">Download</h1>
                    </div>
                    <div class="download-page-options" aria-label="Available downloads">
                        <a class="download-page-option" href="/downloads/beepo-cursors-installer.exe?v=1.2.0-62aa513" download>
                            <div class="download-page-option-title">
                                <svg class="windows-mark" viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M2 3.5 10.5 2v9.4H2Zm10.5-1.7L22 0v11.4h-9.5ZM2 12.6h8.5V22L2 20.5Zm10.5 0H22V24l-9.5-1.5Z"/>
                                </svg>
                                <strong>Desktop Installer</strong>
                            </div>
                            <span>Windows installer</span>
                        </a>
                        <a class="download-page-option" href="/downloads/beepo-cursors-portable.exe?v=1.2.0-62aa513" download>
                            <div class="download-page-option-title">
                                <svg class="windows-mark" viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M2 3.5 10.5 2v9.4H2Zm10.5-1.7L22 0v11.4h-9.5ZM2 12.6h8.5V22L2 20.5Zm10.5 0H22V24l-9.5-1.5Z"/>
                                </svg>
                                <strong>Desktop Portable</strong>
                            </div>
                            <span>No install needed</span>
                        </a>
                        <article class="download-page-option">
                            <strong>Browser Companion</strong>
                            <span>Coming later</span>
                        </article>
                    </div>
                </section>
            </main>
        <?php else: ?>
            <main class="page home-page" aria-label="Beepo Cursors">
                <section class="home-hero" aria-labelledby="home-title">
                    <img class="home-logo" src="/assets/logo.png" alt="">
                    <div class="home-copy">
                        <h1 id="home-title">Beepo <span class="brand-accent">Cursors</span></h1>
                        <p>quiet place to find Windows cursor packs.</p>
                    </div>
                    <div class="home-actions">
                        <a class="home-cta home-cta-muted" href="/?view=browse" data-site-route>Browse</a>
                        <a class="home-cta" href="/?view=download" data-site-route>Download</a>
                    </div>
                </section>
            </main>
        <?php endif; ?>
    </div>
</body>
</html>
