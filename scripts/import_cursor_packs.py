"""Build the local cursor catalog without executing or modifying source packs."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
from io import BytesIO
from pathlib import Path

try:
    from PIL import Image
except ImportError as error:
    raise SystemExit("Pillow is required: python -m pip install Pillow") from error


ROLE_KEYS = {
    "arrow": ("pointer", "arrow"),
    "help": ("help",),
    "workingInBackground": ("working", "work"),
    "busy": ("busy",),
    "precisionSelect": ("precision", "cross"),
    "textSelect": ("text",),
    "handwriting": ("handwrt", "hand"),
    "unavailable": ("unavailable", "unavailiable"),
    "verticalResize": ("vert",),
    "horizontalResize": ("horz",),
    "diagonalResize1": ("dgn1",),
    "diagonalResize2": ("dgn2",),
    "move": ("move",),
    "alternateSelect": ("alternate",),
    "linkSelect": ("link",),
    "personSelect": ("person",),
    "locationSelect": ("pin",),
}
REQUIRED_ROLES = set(ROLE_KEYS) - {"personSelect", "locationSelect"}


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    repo = Path(__file__).resolve().parents[1]
    parser.add_argument("--root", type=Path, default=repo / "cursors")
    parser.add_argument("--catalog", type=Path, default=repo / "cursors" / "catalog.local.json")
    parser.add_argument("--assets", type=Path, default=repo / "public" / "generated")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def read_text(path: Path) -> str:
    data = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-16", "cp1252"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            pass
    return data.decode("utf-8", errors="replace")


def strings_section(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    section = ""
    for raw_line in read_text(path).splitlines():
        line = raw_line.strip()
        if line.startswith("[") and line.endswith("]"):
            section = line[1:-1].casefold()
            continue
        if section != "strings" or not line or line.startswith(";") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip().casefold()] = value.strip().strip('"').strip()
    return values


def resolve_file(folder: Path, value: str) -> Path | None:
    wanted = value.replace("\\", "/").casefold()
    direct = folder / value.replace("\\", "/")
    if direct.is_file():
        return direct
    for candidate in folder.iterdir():
        if candidate.is_file() and candidate.name.casefold() == Path(wanted).name.casefold():
            return candidate
    return None


def slug(value: str) -> str:
    clean = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    digest = hashlib.sha1(value.encode("utf-8")).hexdigest()[:8]
    return f"{clean[:64]}-{digest}"


def content_fingerprint(root: Path, pack: dict[str, object]) -> str:
    digest = hashlib.sha256()
    folder = root / str(pack["folder"])
    for role, value in sorted(dict(pack["roles"]).items()):
        digest.update(role.encode("utf-8"))
        digest.update(b"\0")
        digest.update((folder / str(dict(value)["file"])).read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def decode_dib(data: bytes, offset: int, width: int, height: int) -> Image.Image:
    header_size, dib_width, dib_height = struct.unpack_from("<Iii", data, offset)
    planes, bits, compression = struct.unpack_from("<HHI", data, offset + 12)
    actual_height = abs(dib_height) // 2
    if header_size < 40 or dib_width != width or actual_height != height:
        raise ValueError("unsupported DIB dimensions")
    if planes != 1 or bits != 32 or compression != 0:
        raise ValueError(f"unsupported DIB format: {bits}bpp/{compression}")
    start = offset + header_size
    pixels = data[start:start + width * height * 4]
    if len(pixels) != width * height * 4:
        raise ValueError("truncated DIB pixels")
    image = Image.frombytes("RGBA", (width, height), pixels, "raw", "BGRA")
    if dib_height > 0:
        image = image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    if image.getchannel("A").getextrema() == (0, 0):
        mask_stride = ((width + 31) // 32) * 4
        mask_start = start + width * height * 4
        mask = data[mask_start:mask_start + mask_stride * height]
        if len(mask) == mask_stride * height:
            alpha = bytearray(width * height)
            for y in range(height):
                source_y = height - 1 - y if dib_height > 0 else y
                for x in range(width):
                    hidden = mask[source_y * mask_stride + x // 8] & (0x80 >> (x % 8))
                    alpha[y * width + x] = 0 if hidden else 255
            image.putalpha(Image.frombytes("L", (width, height), bytes(alpha)))
        else:
            image.putalpha(255)
    return image


def cursor_headers(data: bytes) -> list[tuple[list[Image.Image], tuple[int, int]]]:
    results = []
    position = 0
    while position + 6 <= len(data):
        start = data.find(b"\x00\x00\x02\x00", position)
        if start < 0 or start + 6 > len(data):
            break
        count = struct.unpack_from("<H", data, start + 4)[0]
        if not 0 < count <= 32 or start + 6 + count * 16 > len(data):
            position = start + 4
            continue
        entries = []
        valid = True
        for index in range(count):
            entry = start + 6 + index * 16
            width = data[entry] or 256
            height = data[entry + 1] or 256
            hotspot = struct.unpack_from("<HH", data, entry + 4)
            size, relative = struct.unpack_from("<II", data, entry + 8)
            image_offset = start + relative
            if image_offset + size > len(data):
                valid = False
                break
            try:
                if data[image_offset:image_offset + 8] == b"\x89PNG\r\n\x1a\n":
                    image = Image.open(BytesIO(data[image_offset:image_offset + size])).convert("RGBA")
                else:
                    image = decode_dib(data, image_offset, width, height)
                entries.append((image, hotspot))
            except (OSError, ValueError, struct.error):
                valid = False
                break
        if valid and entries:
            ordered = sorted(entries, key=lambda item: (item[0].size != (32, 32), -item[0].width))
            native, hotspot = ordered[0]
            largest = max(entries, key=lambda item: item[0].width)[0]
            results.append(([native, largest], hotspot))
            position = start + 6 + count * 16
        else:
            position = start + 4
    return results


def scale_hotspot(hotspot: tuple[int, int], size: tuple[int, int]) -> list[int]:
    x, y = hotspot
    width, height = size
    return [min(31, (x * 32 + width // 2) // width), min(31, (y * 32 + height // 2) // height)]


def build_assets(cursor: Path, output: Path, role: str) -> dict[str, object]:
    headers = cursor_headers(cursor.read_bytes())
    if not headers:
        raise ValueError("no supported 32-bit or PNG cursor frame")
    native_frames = [images[0].resize((32, 32), Image.Resampling.LANCZOS) for images, _ in headers]
    largest = headers[0][0][1]
    visible_alpha = largest.getchannel("A").point(lambda value: 255 if value >= 8 else 0)
    bounds = visible_alpha.getbbox()
    cropped = largest.crop(bounds) if bounds else largest
    side = max(cropped.size) + 8
    card = Image.new("RGBA", (side, side))
    card.alpha_composite(cropped, ((side - cropped.width) // 2, (side - cropped.height) // 2))

    output.mkdir(parents=True, exist_ok=True)
    preview = output / f"{role}-preview.png"
    card.save(preview, optimize=True)
    animated = cursor.suffix.casefold() == ".ani" and len(native_frames) > 1
    hover = output / f"{role}-hover.{'webp' if animated else 'png'}"
    if animated:
        native_frames[0].save(
            hover,
            save_all=True,
            append_images=native_frames[1:],
            duration=50,
            loop=0,
            lossless=True,
        )
    else:
        native_frames[0].save(hover, optimize=True)
    return {
        "preview": f"/generated/{output.name}/{preview.name}",
        "hover": f"/generated/{output.name}/{hover.name}",
        "hotspot": scale_hotspot(headers[0][1], headers[0][0][0].size),
    }


def attribution(root: Path) -> dict[str, dict[str, str]]:
    return json.loads((root / "sources.json").read_text(encoding="utf-8"))


def metadata_for(path: Path, root: Path, sources: dict[str, dict[str, str]]) -> tuple[str, dict[str, str]]:
    top = path.relative_to(root).parts[0]
    return top, sources.get(top, {"author": "Unknown", "authorUrl": ""})


def manifest_packs(root: Path, sources: dict[str, dict[str, str]]) -> list[dict[str, object]]:
    packs = []
    for manifest_path in sorted(root.glob("*/manifest.json")):
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        top, source = metadata_for(manifest_path, root, sources)
        roles = {}
        for role, file in manifest["roles"].items():
            path = manifest_path.parent / file
            if path.suffix.casefold() not in {".cur", ".ani"} or not path.is_file():
                raise ValueError(f"{manifest_path}: invalid role file {file}")
            roles[role] = {"file": path.relative_to(manifest_path.parent).as_posix()}
        packs.append({
            "id": slug(manifest["name"]),
            "name": manifest["name"],
            "folder": top,
            **source,
            "roles": roles,
        })
    return packs


def inf_packs(root: Path, sources: dict[str, dict[str, str]]) -> tuple[list[dict[str, object]], list[str]]:
    packs = []
    rejected = []
    manifests = {path.parent.resolve() for path in root.glob("*/manifest.json")}
    infs = sorted(path for path in root.rglob("*") if path.is_file() and path.suffix.casefold() == ".inf")
    for inf in infs:
        if any(parent.resolve() in manifests for parent in [inf.parent, *inf.parents]):
            continue
        values = strings_section(inf)
        roles = {}
        missing = []
        for role, aliases in ROLE_KEYS.items():
            value = next((values[key] for key in aliases if key in values), None)
            if value is None:
                if role in REQUIRED_ROLES:
                    missing.append(role)
                continue
            cursor = resolve_file(inf.parent, value)
            if cursor is None or cursor.suffix.casefold() not in {".cur", ".ani"}:
                missing.append(role)
                continue
            roles[role] = {"file": cursor.relative_to(root / inf.relative_to(root).parts[0]).as_posix()}
        if missing:
            rejected.append(f"{inf.relative_to(root)}: missing {', '.join(missing)}")
            continue
        top, source = metadata_for(inf, root, sources)
        name = values.get("scheme_name", inf.parent.name)
        packs.append({
            "id": slug(inf.parent.relative_to(root).as_posix()),
            "name": name,
            "folder": top,
            **source,
            "roles": roles,
        })
    return packs, rejected


def main() -> int:
    options = arguments()
    root = options.root.resolve()
    sources = attribution(root)
    packs = manifest_packs(root, sources)
    discovered, rejected = inf_packs(root, sources)
    packs.extend(discovered)
    # publish gate: only packs approved in sources.json enter the catalog
    packs = [pack for pack in packs if pack.get("distribution") is True]
    packs.sort(key=lambda pack: str(pack["name"]).casefold())
    for pack in packs:
        pack["fingerprint"] = content_fingerprint(root, pack)

    if not options.dry_run:
        for pack in packs:
            output = options.assets / str(pack["id"])
            for role, value in pack["roles"].items():
                cursor = root / str(pack["folder"]) / str(value["file"])
                try:
                    value.update(build_assets(cursor, output, role))
                except ValueError as error:
                    raise SystemExit(f"{pack['name']} / {role}: {error}") from error
            pack["preview"] = pack["roles"]["arrow"]["preview"]
        options.catalog.write_text(
            json.dumps({"packs": packs}, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    print(f"accepted={len(packs)} rejected={len(rejected)}")
    for message in rejected:
        print(f"REJECT {message}")
    return 0 if packs else 1


if __name__ == "__main__":
    raise SystemExit(main())
