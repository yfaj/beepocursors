"""Export explicitly approved cursor packs for the desktop distribution endpoint."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path


SCHEMA = 1
PACK_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,127}$")
THEME_SUFFIX = re.compile(r"\s+((?:(?:dark|light)\s+)?(?:blue|green|orange|purple|red|cyan|magenta|cerise|white|black)|dark|light)$", re.I)
ROLES = (
    "arrow", "help", "workingInBackground", "busy", "precisionSelect", "textSelect",
    "handwriting", "unavailable", "verticalResize", "horizontalResize", "diagonalResize1",
    "diagonalResize2", "move", "alternateSelect", "linkSelect", "personSelect", "locationSelect",
)
REQUIRED_ROLES = frozenset(ROLES[:15])


def arguments() -> argparse.Namespace:
    repo = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=repo / "cursors")
    parser.add_argument("--catalog", type=Path, default=repo / "cursors" / "catalog.local.json")
    parser.add_argument("--sources", type=Path, default=repo / "cursors" / "sources.json")
    parser.add_argument("--output", type=Path, default=repo / "website" / "private" / "distribution")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def canonical_json(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def content_fingerprint(files: list[tuple[str, Path]]) -> str:
    hasher = hashlib.sha256()
    for role, source in sorted(files):
        hasher.update(Path(role).stem.encode("utf-8"))
        hasher.update(b"\0")
        hasher.update(source.read_bytes())
        hasher.update(b"\0")
    return hasher.hexdigest()


def text(value: object) -> str:
    return value if isinstance(value, str) else ""


def name_parts(name: str) -> tuple[str, str]:
    bracketed = re.match(r"^(.*?)\s*\(([^)]+)\)\s*$", name)
    if bracketed:
        return bracketed.group(1).strip(), bracketed.group(2).strip()
    suffixed = THEME_SUFFIX.search(name)
    return (name[:suffixed.start()].strip(), suffixed.group(1).strip()) if suffixed else (name.strip(), "")


def family_and_variant(pack: dict[str, object]) -> tuple[str, str]:
    name = text(pack.get("name"))
    base, theme = name_parts(name)
    roles = pack.get("roles")
    arrow = roles.get("arrow", {}) if isinstance(roles, dict) else {}
    arrow_file = text(arrow.get("file")) if isinstance(arrow, dict) else ""
    parts = arrow_file.replace("\\", "/").split("/")
    root = parts[0] if parts else ""
    family = re.sub(r"\s+cursors?$", "", root, flags=re.I).strip() if re.search(r"\s+cursors?$", root, re.I) else base
    alt = next((index for index, part in enumerate(parts) if part.casefold() == "_alt"), -1)
    path_style = parts[alt + 1] if alt >= 0 and alt + 1 < len(parts) else ""
    name_style = base[len(family):].strip() if base.casefold().startswith(family.casefold()) else ""
    style = path_style or name_style
    labels = [value for value in (style if style.casefold() != theme.casefold() else "", theme) if value]
    return family or name, " · ".join(labels) or "Default"


def safe_folder(root: Path, value: object) -> Path:
    folder = text(value)
    if not folder or Path(folder).name != folder or folder in {".", ".."}:
        raise ValueError("pack folder is invalid")
    path = (root / folder).resolve()
    if not path.is_dir() or path.parent != root:
        raise ValueError("pack folder escaped cursor root")
    return path


def safe_cursor(pack_root: Path, value: object) -> Path:
    relative = text(value).replace("\\", "/")
    if not relative or relative.startswith("/"):
        raise ValueError("cursor file path is invalid")
    path = (pack_root / relative).resolve()
    try:
        path.relative_to(pack_root)
    except ValueError as error:
        raise ValueError("cursor file escaped pack folder") from error
    if not path.is_file() or path.suffix.casefold() not in {".cur", ".ani"}:
        raise ValueError(f"cursor file is not a .cur or .ani: {relative}")
    return path


def package_manifest(pack: dict[str, object], root: Path) -> tuple[dict[str, object], list[tuple[str, Path]]]:
    pack_id = text(pack.get("id"))
    if not PACK_ID.fullmatch(pack_id):
        raise ValueError("pack id is invalid")
    pack_root = safe_folder(root, pack.get("folder"))
    raw_roles = pack.get("roles")
    if not isinstance(raw_roles, dict):
        raise ValueError(f"{pack_id}: roles are invalid")

    roles: dict[str, dict[str, str]] = {}
    files: list[tuple[str, Path]] = []
    for role in sorted(raw_roles):
        data = raw_roles[role]
        if role not in ROLES or not isinstance(data, dict):
            raise ValueError(f"{pack_id}: role is invalid")
        source = safe_cursor(pack_root, data.get("file"))
        target = f"roles/{role}{source.suffix.casefold()}"
        roles[role] = {"file": target, "sha256": digest(source.read_bytes())}
        files.append((target, source))
    if not REQUIRED_ROLES.issubset(roles):
        raise ValueError(f"{pack_id}: missing required cursor roles")

    fingerprint = content_fingerprint(files)
    family, variant = family_and_variant(pack)
    manifest: dict[str, object] = {
        "schema": SCHEMA,
        "id": pack_id,
        "name": text(pack.get("name")) or pack_id,
        "author": text(pack.get("author")),
        "authorUrl": text(pack.get("authorUrl")),
        "license": text(pack.get("license")),
        "family": family,
        "variant": variant,
        "fingerprint": fingerprint,
        "roles": roles,
    }
    manifest_hash = digest(canonical_json(manifest))
    manifest["manifestHash"] = manifest_hash
    manifest["version"] = manifest_hash
    return manifest, files


def write_entry(archive: zipfile.ZipFile, name: str, data: bytes) -> None:
    entry = zipfile.ZipInfo(name, date_time=(2024, 1, 1, 0, 0, 0))
    entry.compress_type = zipfile.ZIP_DEFLATED
    entry.external_attr = 0o100644 << 16
    archive.writestr(entry, data)


def write_package(path: Path, manifest: dict[str, object], files: list[tuple[str, Path]]) -> None:
    temporary = path.with_suffix(".zip.tmp")
    with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        write_entry(archive, "manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"))
        for target, source in files:
            write_entry(archive, target, source.read_bytes())
    temporary.replace(path)


def write_json(path: Path, value: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8") + b"\n")
    temporary.replace(path)


def main() -> int:
    options = arguments()
    root = options.root.resolve()
    catalog = json.loads(options.catalog.read_text(encoding="utf-8"))
    sources = json.loads(options.sources.read_text(encoding="utf-8"))
    if not isinstance(catalog, dict) or not isinstance(catalog.get("packs"), list) or not isinstance(sources, dict):
        raise SystemExit("Catalog or source approvals are invalid")

    published: list[dict[str, object]] = []
    approved = 0
    for pack in catalog["packs"]:
        if not isinstance(pack, dict):
            continue
        source = sources.get(text(pack.get("folder")), {})
        downloadable = isinstance(source, dict) and source.get("distribution") is True
        if not downloadable:
            continue
        manifest, files = package_manifest(pack, root)
        package_name = f"{manifest['id']}.zip"
        package_path = options.output / "packages" / package_name
        if not options.dry_run:
            package_path.parent.mkdir(parents=True, exist_ok=True)
            write_package(package_path, manifest, files)
        packaged = dict(pack)
        packaged.update({
            "fingerprint": manifest["fingerprint"],
            "manifestHash": manifest["manifestHash"],
            "version": manifest["version"],
            "family": manifest["family"],
            "variant": manifest["variant"],
            "downloadable": downloadable,
        })
        if downloadable:
            approved += 1
            packaged["package"] = {
                "file": package_name,
                "sha256": digest(package_path.read_bytes()) if package_path.is_file() else "",
                "bytes": package_path.stat().st_size if package_path.is_file() else 0,
            }
        published.append(packaged)

    revision = digest(canonical_json([
        {"id": pack["id"], "version": pack["version"], "sha256": pack.get("package", {}).get("sha256", "")}
        for pack in published
    ]))
    if not options.dry_run:
        options.output.mkdir(parents=True, exist_ok=True)
        write_json(options.output / "catalog.json", {"schema": SCHEMA, "revision": revision, "packs": published})

    print(f"packs={len(published)} approved={approved} revision={revision}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
