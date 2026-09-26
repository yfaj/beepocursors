<?php

declare(strict_types=1);

require_once __DIR__ . "/distribution-lib.php";

$catalog = distribution_catalog();
$pack = $_GET["pack"] ?? "";
$role = $_GET["role"] ?? "";
$asset = $_GET["asset"] ?? "preview";
if ($catalog === null || !distribution_id($pack) || !is_string($role) || !in_array($role, distribution_roles(), true)
    || !is_string($asset) || !in_array($asset, ["preview", "hover"], true)
    || ($entry = distribution_pack($catalog, $pack)) === null || distribution_summary($entry, $catalog) === null
    || !is_array($entry["roles"] ?? null) || !isset($entry["roles"][$role])) {
    http_response_code(404);
    exit;
}

$path = distribution_asset_path($pack, $role, $asset);
if ($path === false) {
    http_response_code(404);
    exit;
}

distribution_public_headers(str_ends_with($path, ".webp") ? "image/webp" : "image/png");
header("Content-Length: " . (string) filesize($path));
readfile($path);
