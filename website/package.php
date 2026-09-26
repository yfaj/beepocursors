<?php

declare(strict_types=1);

require_once __DIR__ . "/distribution-lib.php";

$catalog = distribution_catalog();
$requestedPack = $_GET["pack"] ?? "";
if ($catalog === null || !distribution_id($requestedPack) || ($pack = distribution_pack($catalog, $requestedPack)) === null
    || ($summary = distribution_summary($pack, $catalog)) === null || $summary["downloadable"] !== true) {
    http_response_code(404);
    exit;
}

$root = distribution_root();
$path = $root === false ? false : realpath($root . DIRECTORY_SEPARATOR . "packages" . DIRECTORY_SEPARATOR . $requestedPack . ".zip");
if ($path === false || !is_file($path) || !str_starts_with($path, $root . DIRECTORY_SEPARATOR . "packages" . DIRECTORY_SEPARATOR)) {
    http_response_code(404);
    exit;
}

distribution_public_headers("application/zip");
header("Content-Length: " . (string) filesize($path));
header("Content-Disposition: attachment; filename=\"" . $requestedPack . ".zip\"");
readfile($path);
