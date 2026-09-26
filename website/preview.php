<?php

declare(strict_types=1);

$pack = $_GET["pack"] ?? "";
$role = $_GET["role"] ?? "";
$asset = $_GET["asset"] ?? "preview";
$roles = [
    "arrow",
    "help",
    "workingInBackground",
    "busy",
    "precisionSelect",
    "textSelect",
    "handwriting",
    "unavailable",
    "verticalResize",
    "horizontalResize",
    "diagonalResize1",
    "diagonalResize2",
    "move",
    "alternateSelect",
    "linkSelect",
    "personSelect",
    "locationSelect",
];

if (!is_string($pack) || !preg_match("/^[a-z0-9][a-z0-9-]*$/", $pack) || !is_string($role) || !in_array($role, $roles, true) || !is_string($asset) || !in_array($asset, ["preview", "hover"], true)) {
    http_response_code(404);
    exit;
}

$root = realpath(dirname(__DIR__) . "/private/generated");
$names = $asset === "preview"
    ? [$role . "-preview.png"]
    : [$role . "-hover.webp", $role . "-hover.png"];
$path = false;
if ($root !== false) {
    foreach ($names as $name) {
        $candidate = realpath($root . DIRECTORY_SEPARATOR . $pack . DIRECTORY_SEPARATOR . $name);
        if ($candidate !== false && is_file($candidate) && str_starts_with($candidate, $root . DIRECTORY_SEPARATOR)) {
            $path = $candidate;
            break;
        }
    }
}

if ($path === false || !is_file($path) || !str_starts_with($path, $root . DIRECTORY_SEPARATOR)) {
    http_response_code(404);
    exit;
}

header("Content-Type: " . (str_ends_with($path, ".webp") ? "image/webp" : "image/png"));
header("Content-Length: " . (string) filesize($path));
header("Cache-Control: no-store");
header("X-Content-Type-Options: nosniff");
readfile($path);
