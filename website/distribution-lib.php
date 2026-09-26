<?php

declare(strict_types=1);

const DISTRIBUTION_ROLES = [
    "arrow", "help", "workingInBackground", "busy", "precisionSelect", "textSelect",
    "handwriting", "unavailable", "verticalResize", "horizontalResize", "diagonalResize1",
    "diagonalResize2", "move", "alternateSelect", "linkSelect", "personSelect", "locationSelect",
];

function distribution_roles(): array
{
    return DISTRIBUTION_ROLES;
}

function distribution_id(mixed $value): bool
{
    return is_string($value) && preg_match("/^[a-z0-9][a-z0-9-]{0,127}$/", $value) === 1;
}

function distribution_root(): string|false
{
    return realpath(dirname(__DIR__) . "/private/distribution");
}

function distribution_catalog(): ?array
{
    $root = distribution_root();
    $path = $root === false ? false : $root . DIRECTORY_SEPARATOR . "catalog.json";
    $contents = $path === false ? false : @file_get_contents($path);
    $catalog = is_string($contents) ? json_decode($contents, true) : null;
    return is_array($catalog) && ($catalog["schema"] ?? null) === 1 && is_array($catalog["packs"] ?? null)
        ? $catalog
        : null;
}

function distribution_pack(array $catalog, string $id): ?array
{
    foreach ($catalog["packs"] as $pack) {
        if (is_array($pack) && ($pack["id"] ?? null) === $id) {
            return $pack;
        }
    }
    return null;
}

function distribution_public_headers(string $contentType): void
{
    header("Content-Type: " . $contentType);
    header("Cache-Control: public, max-age=300");
    header("Access-Control-Allow-Origin: *");
    header("X-Content-Type-Options: nosniff");
}

function distribution_version(array $catalog): string
{
    $revision = $catalog["revision"] ?? "";
    return is_string($revision) && preg_match("/^[a-f0-9]{64}$/", $revision) === 1 ? $revision : "0";
}

function distribution_summary(array $pack, array $catalog): ?array
{
    $id = $pack["id"] ?? null;
    $roles = $pack["roles"] ?? null;
    $package = $pack["package"] ?? null;
    $fingerprint = $pack["fingerprint"] ?? null;
    $manifestHash = $pack["manifestHash"] ?? null;
    $downloadable = ($pack["downloadable"] ?? false) === true;
    if (!distribution_id($id) || !is_array($roles)
        || !is_string($fingerprint) || preg_match("/^[a-f0-9]{64}$/", $fingerprint) !== 1
        || !is_string($manifestHash) || preg_match("/^[a-f0-9]{64}$/", $manifestHash) !== 1) {
        return null;
    }
    if ($downloadable && (!is_array($package) || ($package["file"] ?? null) !== $id . ".zip"
        || !is_string($package["sha256"] ?? null) || preg_match("/^[a-f0-9]{64}$/", $package["sha256"]) !== 1)) {
        return null;
    }

    $version = distribution_version($catalog);
    $link = $roles["linkSelect"] ?? [];
    $summary = [
        "id" => $id,
        "name" => is_string($pack["name"] ?? null) ? $pack["name"] : $id,
        "author" => is_string($pack["author"] ?? null) ? $pack["author"] : "",
        "authorUrl" => is_string($pack["authorUrl"] ?? null) ? $pack["authorUrl"] : "",
        "family" => is_string($pack["family"] ?? null) ? $pack["family"] : $id,
        "variant" => is_string($pack["variant"] ?? null) ? $pack["variant"] : "Default",
        "fingerprint" => $fingerprint,
        "manifestHash" => $manifestHash,
        "version" => is_string($pack["version"] ?? null) ? $pack["version"] : $manifestHash,
        "downloadable" => $downloadable,
        "preview" => "/distribution-preview.php?pack=" . rawurlencode($id) . "&role=arrow&v=" . rawurlencode($version),
        "linkPreview" => is_array($link)
            ? "/distribution-preview.php?pack=" . rawurlencode($id) . "&role=linkSelect&v=" . rawurlencode($version)
            : "/distribution-preview.php?pack=" . rawurlencode($id) . "&role=arrow&v=" . rawurlencode($version),
    ];
    if ($downloadable) {
        $summary["packageSha256"] = $package["sha256"];
        $summary["packageBytes"] = is_int($package["bytes"] ?? null) ? $package["bytes"] : 0;
        $summary["packageUrl"] = "/package.php?pack=" . rawurlencode($id) . "&v=" . rawurlencode($version);
    }
    return $summary;
}

function distribution_detail(array $pack, array $catalog): ?array
{
    $summary = distribution_summary($pack, $catalog);
    if ($summary === null) {
        return null;
    }
    $roles = [];
    foreach ($pack["roles"] as $role => $data) {
        if (!is_string($role) || !in_array($role, distribution_roles(), true) || !is_array($data)) {
            continue;
        }
        $roleData = [
            "preview" => "/distribution-preview.php?pack=" . rawurlencode($summary["id"])
                . "&role=" . rawurlencode($role) . "&v=" . rawurlencode(distribution_version($catalog)),
        ];
        $hotspot = $data["hotspot"] ?? null;
        if (is_string($data["hover"] ?? null) && is_array($hotspot) && count($hotspot) === 2
            && is_int($hotspot[0]) && is_int($hotspot[1])) {
            $roleData["hover"] = "/distribution-preview.php?pack=" . rawurlencode($summary["id"])
                . "&role=" . rawurlencode($role) . "&asset=hover&v=" . rawurlencode(distribution_version($catalog));
            $roleData["hotspot"] = [max(0, min(31, $hotspot[0])), max(0, min(31, $hotspot[1]))];
        }
        $roles[$role] = $roleData;
    }
    $summary["roles"] = $roles;
    return $summary;
}

function distribution_asset_path(string $pack, string $role, string $asset): string|false
{
    $root = realpath(dirname(__DIR__) . "/private/generated");
    $names = $asset === "preview"
        ? [$role . "-preview.png"]
        : [$role . "-hover.webp", $role . "-hover.png"];
    if ($root === false) {
        return false;
    }
    foreach ($names as $name) {
        $path = realpath($root . DIRECTORY_SEPARATOR . $pack . DIRECTORY_SEPARATOR . $name);
        if ($path !== false && is_file($path) && str_starts_with($path, $root . DIRECTORY_SEPARATOR)) {
            return $path;
        }
    }
    return false;
}
