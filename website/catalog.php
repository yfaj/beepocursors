<?php

declare(strict_types=1);

header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");
header("X-Content-Type-Options: nosniff");

$catalogPath = dirname(__DIR__) . "/private/distribution/catalog.json";
$contents = @file_get_contents($catalogPath);
$catalog = is_string($contents) ? json_decode($contents, true) : null;

if (!is_array($catalog) || !is_array($catalog["packs"] ?? null)) {
    http_response_code(503);
    echo json_encode(["error" => "Cursor catalog is unavailable."]);
    exit;
}

$version = is_file($catalogPath) ? (string) filemtime($catalogPath) : "0";

function preview_url(string $packId, string $role, string $version): string
{
    return "/preview.php?pack=" . rawurlencode($packId)
        . "&role=" . rawurlencode($role)
        . "&v=" . rawurlencode($version);
}

function hover_url(string $packId, string $role, string $version): string
{
    return "/preview.php?pack=" . rawurlencode($packId)
        . "&role=" . rawurlencode($role)
        . "&asset=hover"
        . "&v=" . rawurlencode($version);
}

function hover_hotspot(array $data): ?array
{
    $hotspot = $data["hotspot"] ?? null;
    if (!is_array($hotspot) || count($hotspot) !== 2 || !is_int($hotspot[0]) || !is_int($hotspot[1])) {
        return null;
    }

    return [
        max(0, min(31, $hotspot[0])),
        max(0, min(31, $hotspot[1])),
    ];
}

function catalog_pack_summary(array $pack, string $version): ?array
{
    $id = $pack["id"] ?? null;
    if (!is_string($id) || !preg_match("/^[a-z0-9][a-z0-9-]*$/", $id)) {
        return null;
    }

    $arrow = $pack["roles"]["arrow"] ?? [];
    $linkSelect = $pack["roles"]["linkSelect"] ?? [];
    return [
        "id" => $id,
        "name" => (string) ($pack["name"] ?? $id),
        "author" => (string) ($pack["author"] ?? ""),
        "authorUrl" => (string) ($pack["authorUrl"] ?? ""),
        "license" => (string) ($pack["license"] ?? ""),
        "family" => (string) ($pack["family"] ?? ""),
        "variant" => (string) ($pack["variant"] ?? ""),
        "fingerprint" => (string) ($pack["fingerprint"] ?? ""),
        "version" => (string) ($pack["version"] ?? ""),
        "arrowFile" => is_array($arrow) ? (string) ($arrow["file"] ?? "") : "",
        "preview" => preview_url($id, "arrow", $version),
        "linkPreview" => is_array($linkSelect) && isset($linkSelect["preview"])
            ? preview_url($id, "linkSelect", $version)
            : preview_url($id, "arrow", $version),
    ];
}

function catalog_pack_detail(array $pack, string $version): ?array
{
    $summary = catalog_pack_summary($pack, $version);
    if ($summary === null) {
        return null;
    }

    $roles = [];
    foreach ($pack["roles"] ?? [] as $role => $data) {
        if (is_string($role) && is_array($data) && isset($data["preview"])) {
            $roleData = ["preview" => preview_url($summary["id"], $role, $version)];
            $hotspot = hover_hotspot($data);
            if (isset($data["hover"]) && is_string($data["hover"]) && $hotspot !== null) {
                $roleData["hover"] = hover_url($summary["id"], $role, $version);
                $roleData["hotspot"] = $hotspot;
            }
            $roles[$role] = $roleData;
        }
    }
    $summary["roles"] = $roles;
    return $summary;
}

$requestedPack = $_GET["pack"] ?? "";
if ($requestedPack !== "") {
    if (!is_string($requestedPack) || !preg_match("/^[a-z0-9][a-z0-9-]*$/", $requestedPack)) {
        http_response_code(404);
        echo json_encode(["error" => "Cursor pack not found."]);
        exit;
    }

    foreach ($catalog["packs"] as $pack) {
        if (is_array($pack) && ($pack["id"] ?? null) === $requestedPack) {
            $detail = catalog_pack_detail($pack, $version);
            if ($detail !== null) {
                echo json_encode($detail, JSON_UNESCAPED_SLASHES);
                exit;
            }
        }
    }

    http_response_code(404);
    echo json_encode(["error" => "Cursor pack not found."]);
    exit;
}

$packs = [];
foreach ($catalog["packs"] as $pack) {
    if (is_array($pack) && ($summary = catalog_pack_summary($pack, $version)) !== null) {
        $packs[] = $summary;
    }
}

echo json_encode(["packs" => $packs], JSON_UNESCAPED_SLASHES);
