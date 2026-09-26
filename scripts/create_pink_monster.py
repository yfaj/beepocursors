"""Build Pink Monster cursors directly from the approved pixel-art sheet."""

from __future__ import annotations

import json
import struct
from collections import deque
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "pink-monster-approved.png"
FINAL_SHEET = ROOT / "assets" / "pink-monster-final-sheet.png"
COMPARISON = ROOT / "assets" / "pink-monster-comparison.png"
PACK = ROOT / "cursors" / "Pink Monster"
MASTER_SIZE = 128
SOURCE_CELL = 220

ROLES = {
    "arrow": "Arrow.cur",
    "help": "Help.cur",
    "workingInBackground": "Working.cur",
    "busy": "Busy.cur",
    "precisionSelect": "Precision.cur",
    "textSelect": "Text.cur",
    "handwriting": "Handwriting.cur",
    "unavailable": "Unavailable.cur",
    "verticalResize": "Vertical Resize.cur",
    "horizontalResize": "Horizontal Resize.cur",
    "diagonalResize1": "Diagonal Resize 1.cur",
    "diagonalResize2": "Diagonal Resize 2.cur",
    "move": "Move.cur",
    "alternateSelect": "Alternate.cur",
    "linkSelect": "Link.cur",
    "personSelect": "Person.cur",
    "locationSelect": "Location.cur",
}

ROLE_CELLS = {
    "arrow": (0, 0), "linkSelect": (0, 1), "help": (0, 2),
    "workingInBackground": (0, 3), "busy": (0, 4), "textSelect": (0, 5),
    "handwriting": (1, 0), "verticalResize": (1, 1), "horizontalResize": (1, 2),
    "diagonalResize1": (1, 3), "diagonalResize2": (1, 4), "move": (1, 5),
    "precisionSelect": (2, 0), "unavailable": (2, 1), "alternateSelect": (2, 2),
    "locationSelect": (2, 3), "personSelect": (2, 4),
}

X_BOUNDS = ((26, 275), (279, 530), (534, 779), (783, 1024), (1028, 1277), (1281, 1509))
Y_BOUNDS = ((26, 334), (338, 655), (659, 996))

HOTSPOTS_64 = {
    "arrow": (19, 9), "help": (19, 9), "workingInBackground": (19, 9),
    "busy": (32, 32), "precisionSelect": (32, 32), "textSelect": (32, 32),
    "handwriting": (47, 54), "unavailable": (32, 32), "verticalResize": (32, 32),
    "horizontalResize": (32, 32), "diagonalResize1": (32, 32),
    "diagonalResize2": (32, 32), "move": (32, 32), "alternateSelect": (21, 10),
    "linkSelect": (19, 9), "personSelect": (20, 9), "locationSelect": (48, 54),
}
HOTSPOTS = {role: (x * 2, y * 2) for role, (x, y) in HOTSPOTS_64.items()}


def complete_cell(sheet: Image.Image, row: int, column: int) -> Image.Image:
    left, right = X_BOUNDS[column]
    top, bottom = Y_BOUNDS[row]
    return sheet.crop((left, top, right, bottom))


def foreground_mask(cell: Image.Image) -> Image.Image:
    """Keep colored/dark art plus enclosed highlights; discard the gray sheet."""
    rgb = cell.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    seed = [[False] * width for _ in range(height)]
    for y in range(height):
        for x in range(width):
            red, green, blue = pixels[x, y]
            seed[y][x] = max(red, green, blue) - min(red, green, blue) > 24 or min(red, green, blue) < 165

    background = [[False] * width for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        for y in (0, height - 1):
            if not seed[y][x] and not background[y][x]:
                background[y][x] = True
                queue.append((x, y))
    for y in range(height):
        for x in (0, width - 1):
            if not seed[y][x] and not background[y][x]:
                background[y][x] = True
                queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= next_x < width and 0 <= next_y < height:
                if not seed[next_y][next_x] and not background[next_y][next_x]:
                    background[next_y][next_x] = True
                    queue.append((next_x, next_y))

    mask = Image.new("L", cell.size)
    output = mask.load()
    for y in range(height):
        for x in range(width):
            output[x, y] = 0 if background[y][x] else 255
    return mask


def approved_sprite(sheet: Image.Image, role: str) -> Image.Image:
    cell = complete_cell(sheet, *ROLE_CELLS[role])
    mask = foreground_mask(cell)
    rgba = cell.convert("RGBA")
    rgba.putalpha(mask)
    bounds = mask.getbbox()
    if bounds is None:
        raise ValueError(f"{role}: approved cell has no artwork")
    center_x, center_y = cell.width / 2, cell.height / 2
    radius = max(
        center_x - bounds[0], bounds[2] - center_x,
        center_y - bounds[1], bounds[3] - center_y,
    )
    side = max(SOURCE_CELL, round(radius * 2 + 12))
    canvas = Image.new("RGBA", (side, side))
    canvas.alpha_composite(rgba, (round((side - cell.width) / 2), round((side - cell.height) / 2)))
    if role == "move":
        sprite = Image.new("RGBA", (MASTER_SIZE, MASTER_SIZE))
        draw_move_cross(sprite)
        return sprite
    return canvas.resize((MASTER_SIZE, MASTER_SIZE), Image.Resampling.NEAREST)


def draw_move_cross(sprite: Image.Image) -> None:
    draw = ImageDraw.Draw(sprite)
    dark = (19, 20, 19, 255)
    pink = (255, 63, 126, 255)
    draw.line((38, 64, 90, 64), fill=dark, width=9)
    draw.line((64, 38, 64, 90), fill=dark, width=9)
    draw.polygon(((24, 64), (43, 47), (43, 81)), fill=dark)
    draw.polygon(((104, 64), (85, 47), (85, 81)), fill=dark)
    draw.polygon(((64, 24), (47, 43), (81, 43)), fill=dark)
    draw.polygon(((64, 104), (47, 85), (81, 85)), fill=dark)
    draw.line((39, 64, 89, 64), fill=pink, width=5)
    draw.line((64, 39, 64, 89), fill=pink, width=5)
    draw.polygon(((29, 64), (45, 52), (45, 76)), fill=pink)
    draw.polygon(((99, 64), (83, 52), (83, 76)), fill=pink)
    draw.polygon(((64, 29), (52, 45), (76, 45)), fill=pink)
    draw.polygon(((64, 99), (52, 83), (76, 83)), fill=pink)


def cursor_bytes(image: Image.Image, hotspot: tuple[int, int]) -> bytes:
    frames = [
        image.resize((32, 32), Image.Resampling.NEAREST),
        image.resize((64, 64), Image.Resampling.NEAREST),
        image,
    ]
    payloads: list[bytes] = []
    for frame in frames:
        output = BytesIO()
        frame.save(output, format="PNG", optimize=True)
        payloads.append(output.getvalue())
    offset = 6 + 16 * len(frames)
    data = bytearray(struct.pack("<HHH", 0, 2, len(frames)))
    for frame, payload in zip(frames, payloads):
        width, height = frame.size
        scaled = (round(hotspot[0] * width / MASTER_SIZE), round(hotspot[1] * height / MASTER_SIZE))
        data.extend(struct.pack("<BBBBHHII", width % 256, height % 256, 0, 0, *scaled, len(payload), offset))
        offset += len(payload)
    return bytes(data + b"".join(payloads))


def cursor_master_frame(data: bytes) -> Image.Image:
    count = struct.unpack_from("<H", data, 4)[0]
    for index in range(count):
        width, height, _, _, _, _, size, offset = struct.unpack_from("<BBBBHHII", data, 6 + index * 16)
        width = width or 256
        height = height or 256
        if (width, height) == (MASTER_SIZE, MASTER_SIZE):
            return Image.open(BytesIO(data[offset:offset + size])).convert("RGBA")
    raise ValueError("128px cursor frame missing")


def render_final_sheet(sprites: dict[str, Image.Image], approved: Image.Image) -> Image.Image:
    sheet = Image.new("RGB", approved.size, (238, 238, 238))
    draw = ImageDraw.Draw(sheet)
    for left, _ in X_BOUNDS:
        draw.line((left - 2, 22, left - 2, 999), fill=(198, 198, 198), width=4)
    draw.line((1511, 22, 1511, 999), fill=(198, 198, 198), width=4)
    for top, _ in Y_BOUNDS:
        draw.line((22, top - 2, 1512, top - 2), fill=(198, 198, 198), width=4)
    draw.line((22, 998, 1512, 998), fill=(198, 198, 198), width=4)
    for role, sprite in sprites.items():
        row, column = ROLE_CELLS[role]
        left, right = X_BOUNDS[column]
        top, bottom = Y_BOUNDS[row]
        enlarged = sprite.resize((SOURCE_CELL, SOURCE_CELL), Image.Resampling.NEAREST)
        x = (left + right - SOURCE_CELL) // 2
        y = (top + bottom - SOURCE_CELL) // 2
        sheet.paste(enlarged, (x, y), enlarged)
    return sheet


def main() -> None:
    approved = Image.open(SOURCE).convert("RGB")
    if approved.size != (1536, 1024):
        raise ValueError(f"Approved sheet changed size: {approved.size}")
    PACK.mkdir(parents=True, exist_ok=True)
    sprites: dict[str, Image.Image] = {}
    for role, filename in ROLES.items():
        expected = approved_sprite(approved, role)
        bounds = expected.getchannel("A").getbbox()
        if bounds is None or min(bounds[0], bounds[1], MASTER_SIZE - bounds[2], MASTER_SIZE - bounds[3]) < 2:
            raise ValueError(f"{role}: approved artwork touches the cursor edge")
        data = cursor_bytes(expected, HOTSPOTS[role])
        actual = cursor_master_frame(data)
        if actual.tobytes() != expected.tobytes():
            raise ValueError(f"{role}: generated cursor drifted from approved art")
        (PACK / filename).write_bytes(data)
        sprites[role] = actual

    (PACK / "manifest.json").write_text(json.dumps({
        "name": "Pink Monster",
        "author": "Beepo Cursors",
        "authorUrl": "",
        "roles": ROLES,
    }, indent=2) + "\n", encoding="utf-8")

    final_sheet = render_final_sheet(sprites, approved)
    final_sheet.save(FINAL_SHEET, optimize=True)
    comparison = Image.new("RGB", (approved.width * 2 + 16, approved.height), (24, 19, 22))
    comparison.paste(approved, (0, 0))
    comparison.paste(final_sheet, (approved.width + 16, 0))
    comparison.save(COMPARISON, optimize=True)
    print(f"roles={len(sprites)} identity=100% comparison={COMPARISON}")


if __name__ == "__main__":
    main()
