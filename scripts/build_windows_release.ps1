$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$output = Join-Path $repo "release"
Set-Location $repo

& npm run release:windows
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$installer = Get-ChildItem (Join-Path $repo "src-tauri\target\release\bundle\nsis") -Filter "*-setup.exe" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
$portable = Join-Path $repo "src-tauri\target\release\beepo-cursors.exe"
if (-not $installer -or -not (Test-Path -LiteralPath $portable)) {
  throw "Windows release artifacts were not produced."
}

New-Item -ItemType Directory -Force -Path $output | Out-Null
Copy-Item -LiteralPath $installer.FullName -Destination (Join-Path $output "beepo-cursors-installer.exe") -Force
Copy-Item -LiteralPath $portable -Destination (Join-Path $output "beepo-cursors-portable.exe") -Force
if (Test-Path -LiteralPath (Join-Path $output "cursors")) {
  Remove-Item -LiteralPath (Join-Path $output "cursors") -Recurse -Force
}
Get-ChildItem -LiteralPath $output -Force | Select-Object Name, Length, LastWriteTime
