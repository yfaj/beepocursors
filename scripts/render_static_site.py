#!/usr/bin/env python3
"""Freeze website/*.php into a static tree for GitHub Pages.

Runs the PHP sources as-is (php CLI), then adapts query-string URLs to static
paths at build time. The website sources are never modified.

Usage: python scripts/render_static_site.py --out _site [--downloads release]
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
WEBSITE = REPO / "website"
GENERATED = REPO / "public" / "generated"

CSP_META = (
    '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; '
    "img-src 'self'; style-src 'self'; script-src 'self'; "
    'form-action \'self\'; base-uri \'none\'">'
)


def sh(*args: str) -> str:
    return subprocess.run(args, cwd=REPO, check=True, capture_output=True, text=True, encoding="utf-8").stdout


def php(script: str, query: str = "") -> str:
    return sh("php", "-r", "parse_str($argv[1], $_GET); include $argv[2];", query, str(WEBSITE / script))


def patch(text: str, old: str, new: str, label: str, required: int = 1) -> str:
    found = text.count(old)
    if found < required:
        sys.exit(f"render patch failed ({label}): {found} of {required} matches")
    return text.replace(old, new)


_ABS = re.compile(r'"/(?P<p>[^/"\'`][^"\'`<>]*)')


def relativize(text: str, depth: int) -> str:
    """Rewrite root-absolute URLs in double-quoted strings to depth-relative ones."""
    prefix = "../" * depth
    return _ABS.sub(lambda m: '"' + prefix + m.group("p"), text)


def emit(out: Path, rel: str, text: str) -> None:
    path = out / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(relativize(text, rel.count("/")), encoding="utf-8")


def hover_url(pack: str, role: str) -> str:
    for ext in ("webp", "png"):
        if (GENERATED / pack / f"{role}-hover.{ext}").is_file():
            return f"/generated/{pack}/{role}-hover.{ext}"
    return f"/generated/{pack}/{role}-preview.png"


def rewrite_site_urls(text: str) -> str:
    text = re.sub(
        r'"/preview\.php\?pack=([a-z0-9-]+)&role=([A-Za-z0-9]+)&asset=hover&v=[^" ]*"',
        lambda m: json.dumps(hover_url(m.group(1), m.group(2))),
        text,
    )
    return re.sub(
        r'"/preview\.php\?pack=([a-z0-9-]+)&role=([A-Za-z0-9]+)&v=[^" ]*"',
        r'"/generated/\1/\2-preview.png"',
        text,
    )


def rewrite_dist_urls(text: str) -> str:
    text = re.sub(
        r'"/distribution-preview\.php\?pack=([a-z0-9-]+)&role=([A-Za-z0-9]+)&asset=hover&v=[^" ]*"',
        lambda m: json.dumps(hover_url(m.group(1), m.group(2))),
        text,
    )
    text = re.sub(
        r'"/distribution-preview\.php\?pack=([a-z0-9-]+)&role=([A-Za-z0-9]+)&v=[^" ]*"',
        r'"/generated/\1/\2-preview.png"',
        text,
    )
    return re.sub(r'"/package\.php\?pack=([a-z0-9-]+)&v=[^"]*"', r'"/packages/\1.zip"', text)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=REPO / "_site")
    parser.add_argument("--downloads", type=Path, help="directory with installer .exe files")
    options = parser.parse_args()
    out: Path = options.out

    # 1. distribution data (catalog.json + packages/*.zip) at the root the PHP expects
    sh("python", "scripts/export_cursor_distribution.py", "--output", "private/distribution")
    dist = json.loads((REPO / "private" / "distribution" / "catalog.json").read_text(encoding="utf-8"))
    pack_ids = [pack["id"] for pack in dist["packs"]]

    if out.exists():
        shutil.rmtree(out)

    # 2. render the three page views and adapt their URLs
    for view, target in (("home", "index.html"), ("browse", "browse/index.html"), ("download", "download/index.html")):
        html = php("index.php", f"view={view}")
        html = patch(html, 'href="/?view=browse"', 'href="../browse/"' if target != "index.html" else 'href="browse/"', "browse link")
        html = patch(html, 'href="/?view=download"', 'href="../download/"' if target != "index.html" else 'href="download/"', "download link")
        html = patch(html, 'href="/"', 'href="./"', "home link")
        html = re.sub(r'data-catalog-url="/catalog\.php\?v=\d+"', f'data-catalog-url="{"../" * target.count("/")}catalog.json"', html)
        html = patch(html, '<meta charset="utf-8">', f'<meta charset="utf-8">\n    {CSP_META}', "csp meta")
        emit(out, target, html)

    # 3. site catalog + per-pack detail (app-compatible shape)
    (out / "catalog.json").write_text(relativize(rewrite_site_urls(php("catalog.php")), 0), encoding="utf-8")
    (out / "distribution.json").write_text(relativize(rewrite_dist_urls(php("distribution.php")), 0), encoding="utf-8")
    (out / "packs").mkdir()
    for pack_id in pack_ids:
        detail = relativize(rewrite_dist_urls(php("distribution.php", f"pack={pack_id}")), 0)
        (out / "packs" / f"{pack_id}.json").write_text(detail, encoding="utf-8")

    # 4. static assets, with build-time JS URL patches
    shutil.copy2(WEBSITE / "styles.css", out / "styles.css")
    menu = patch(
        (WEBSITE / "menu.js").read_text(encoding="utf-8"),
        'const view = target.searchParams.get("view") === "browse"\n'
        '    ? "browse"\n'
        '    : target.searchParams.get("view") === "download"\n'
        '      ? "download"\n'
        '      : "home";',
        'const view = target.pathname.includes("browse")\n'
        '    ? "browse"\n'
        '    : target.pathname.includes("download")\n'
        '      ? "download"\n'
        '      : "home";',
        "menu view routing",
    )
    menu = patch(
        menu,
        'const requestedView = new URL(link.href, window.location.href).searchParams.get("view");',
        'const requestedView = new URL(link.href, window.location.href).pathname.includes("browse")\n'
        '      ? "browse"\n'
        '      : new URL(link.href, window.location.href).pathname.includes("download")\n'
        '        ? "download"\n'
        '        : "home";',
        "menu tab state",
    )
    menu = patch(
        menu,
        '.find((script) => new URL(script.getAttribute("src") || "", window.location.href).pathname === "/catalog.js");',
        '.find((script) => new URL(script.getAttribute("src") || "", window.location.href).pathname.endsWith("/catalog.js"));',
        "menu catalog script probe",
    )
    menu = patch(
        menu,
        'document.querySelectorAll(".top-tab[href]").forEach((link) => {\n'
        '    const requestedView = new URL(link.href, window.location.href).pathname.includes("browse")\n'
        '      ? "browse"\n'
        '      : new URL(link.href, window.location.href).pathname.includes("download")\n'
        '        ? "download"\n'
        '        : "home";',
        'const siteRoot = window.location.pathname.replace(/(browse|download)\/?$/, "");\n'
        '  document.querySelectorAll(".top-tab[href]").forEach((link) => {\n'
        '    const label = (link.textContent || "").trim().toLowerCase();\n'
        '    const requestedView = label === "browse" ? "browse" : label === "download" ? "download" : "home";\n'
        '    link.href = siteRoot + (requestedView === "home" ? "" : requestedView + "/");',
        "menu nav depth",
    )
    emit(out, "menu.js", menu)
    catalog_js = patch(
        (WEBSITE / "catalog.js").read_text(encoding="utf-8"),
        'const url = new URL(root.dataset.catalogUrl, window.location.href);\n'
        '    url.searchParams.set("pack", packId);\n'
        '    return url;',
        'return new URL(`../packs/${packId}.json`, window.location.href);',
        "catalog detail url",
    )
    catalog_js = patch(
        catalog_js,
        'function image(url, alt) {\n    const element = document.createElement("img");\n    element.src = url;',
        'function image(url, alt) {\n    const element = document.createElement("img");\n    element.src = new URL(url, catalogUrl).href;',
        "image base",
    )
    catalog_js = patch(
        catalog_js,
        'if (hoverOverlay.src !== new URL(cursor.hover, window.location.href).href) hoverOverlay.src = cursor.hover;',
        'const hoverHref = new URL(cursor.hover, catalogUrl).href;\n    if (hoverOverlay.src !== hoverHref) hoverOverlay.src = hoverHref;',
        "hover base",
    )
    catalog_js = patch(
        catalog_js,
        'async function loadCatalog() {\n    try {\n      const response = await fetch(root.dataset.catalogUrl);',
        'async function loadCatalog() {\n    try {\n      const response = await fetch(catalogUrl);',
        "catalog base",
    )
    catalog_js = patch(
        catalog_js,
        'const root = document.querySelector("[data-catalog-url]");',
        'const root = document.querySelector("[data-catalog-url]");\n  const catalogUrl = new URL(root.dataset.catalogUrl, window.location.href);',
        "catalog base const",
    )
    catalog_js = patch(
        catalog_js,
        'const linkPreview = typeof pack.linkPreview === "string" ? pack.linkPreview : pack.preview;',
        'const linkPreview = new URL(typeof pack.linkPreview === "string" ? pack.linkPreview : pack.preview, catalogUrl).href;',
        "link preview base",
    )
    emit(out, "catalog.js", catalog_js)

    shutil.copytree(WEBSITE / "assets", out / "assets")
    shutil.copytree(GENERATED, out / "generated")
    shutil.copytree(REPO / "private" / "distribution" / "packages", out / "packages")
    if options.downloads:
        shutil.copytree(options.downloads, out / "downloads")

    print(f"rendered {len(pack_ids)} packs -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
