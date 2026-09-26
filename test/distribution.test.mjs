import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("V80 distribution exporter and endpoints expose only validated catalog assets", async () => {
  const [exporter, library, catalog, packageEndpoint, preview, privateCatalog, catalogScript] = await Promise.all([
    source("scripts/export_cursor_distribution.py"),
    source("website/distribution-lib.php"),
    source("website/distribution.php"),
    source("website/package.php"),
    source("website/distribution-preview.php"),
    source("website/catalog.php"),
    source("website/catalog.js"),
  ]);

  assert.match(exporter, /source\.get\("distribution"\) is True/);
  assert.match(exporter, /sha256/);
  assert.match(exporter, /zipfile\.ZIP_DEFLATED/);
  assert.match(exporter, /\.cur", "\.ani"/);
  assert.match(library, /Access-Control-Allow-Origin/);
  assert.match(library, /\$summary = \[[\s\S]*"downloadable"[\s\S]*if \(\$downloadable\)[\s\S]*\["packageUrl"\][\s\S]*return \$summary;/);
  assert.match(catalog, /\$requestedPack = \$_GET\["pack"\]/);
  assert.match(library, /preg_match\("\/\^\[a-z0-9\]/);
  assert.match(packageEndpoint, /Content-Disposition: attachment/);
  assert.match(preview, /in_array\(\$role, distribution_roles\(\), true\)/);
  assert.match(preview, /\["preview", "hover"\]/);
  assert.match(library, /"hover"[\s\S]*"hotspot"/);
  assert.match(privateCatalog, /private\/distribution\/catalog\.json/);
  assert.match(catalogScript, /typeof pack\.family === "string"/);
  assert.match(catalogScript, /typeof pack\.variant === "string"/);
  assert.doesNotMatch(`${catalog}\n${packageEndpoint}\n${preview}`, /require_preview_access|generated\//);
});
