<?php

declare(strict_types=1);

require_once __DIR__ . "/distribution-lib.php";

$catalog = distribution_catalog();
if ($catalog === null) {
    http_response_code(503);
    distribution_public_headers("application/json; charset=utf-8");
    echo json_encode(["error" => "Cursor distribution is unavailable."]);
    exit;
}

distribution_public_headers("application/json; charset=utf-8");
$requestedPack = $_GET["pack"] ?? "";
if ($requestedPack !== "") {
    if (!distribution_id($requestedPack) || ($pack = distribution_pack($catalog, $requestedPack)) === null) {
        http_response_code(404);
        echo json_encode(["error" => "Cursor pack not found."]);
        exit;
    }
    $detail = distribution_detail($pack, $catalog);
    if ($detail === null) {
        http_response_code(404);
        echo json_encode(["error" => "Cursor pack not found."]);
        exit;
    }
    echo json_encode($detail, JSON_UNESCAPED_SLASHES);
    exit;
}

$packs = [];
foreach ($catalog["packs"] as $pack) {
    if (is_array($pack) && ($summary = distribution_summary($pack, $catalog)) !== null) {
        $packs[] = $summary;
    }
}
echo json_encode(["schema" => 1, "revision" => distribution_version($catalog), "packs" => $packs], JSON_UNESCAPED_SLASHES);
