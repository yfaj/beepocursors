"""Create the sharp, animated Beepo Pop Windows cursor pack."""

from __future__ import annotations

import json
import math
import struct
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


SIZE = 64
SCALE = 4
PINK = (221, 156, 171, 255)
DARK = (24, 19, 22, 255)
LIGHT = (255, 244, 246, 255)
ROOT = Path(__file__).resolve().parents[1]
POP_PACK = ROOT / "cursors" / "Beepo Pop"

ROLES = {
    "arrow": "Arrow.cur",
    "help": "Help.cur",
    "workingInBackground": "Working.ani",
    "busy": "Busy.ani",
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

ANIMATED_ROLES = {"workingInBackground", "busy"}
ANIMATION_FRAMES = 8
BADGE_CENTER = (46, 15)

HOTSPOTS = {
    "arrow": (11, 7), "help": (11, 7), "workingInBackground": (11, 7),
    "busy": (32, 32), "precisionSelect": (32, 32), "textSelect": (32, 32),
    "handwriting": (13, 53), "unavailable": (32, 32), "verticalResize": (32, 32),
    "horizontalResize": (32, 32), "diagonalResize1": (32, 32), "diagonalResize2": (32, 32),
    "move": (32, 32), "alternateSelect": (32, 8), "linkSelect": (11, 7),
    "personSelect": (32, 18), "locationSelect": (32, 54),
}


def xy(point: tuple[float, float]) -> tuple[int, int]:
    return round(point[0] * SCALE), round(point[1] * SCALE)


def points(values: list[tuple[float, float]]) -> list[tuple[int, int]]:
    return [xy(value) for value in values]


def circle(draw: ImageDraw.ImageDraw, x: float, y: float, radius: float, inset: float = 3) -> None:
    draw.ellipse((round((x - radius) * SCALE), round((y - radius) * SCALE), round((x + radius) * SCALE), round((y + radius) * SCALE)), fill=PINK)
    draw.ellipse((round((x - radius + inset) * SCALE), round((y - radius + inset) * SCALE), round((x + radius - inset) * SCALE), round((y + radius - inset) * SCALE)), fill=DARK)


def octagon(draw: ImageDraw.ImageDraw, x: float, y: float, radius: float, inset: float = 2.5) -> None:
    def shape(value: float) -> list[tuple[float, float]]:
        corner = value * .42
        return [
            (x - corner, y - value), (x + corner, y - value),
            (x + value, y - corner), (x + value, y + corner),
            (x + corner, y + value), (x - corner, y + value),
            (x - value, y + corner), (x - value, y - corner),
        ]

    draw.polygon(points(shape(radius)), fill=PINK)
    draw.polygon(points(shape(radius - inset)), fill=DARK)


def stroke(
    draw: ImageDraw.ImageDraw,
    values: list[tuple[float, float]],
    width: float = 3,
    core: tuple[int, int, int, int] = DARK,
) -> None:
    """A narrow dark channel with a crisp pink rim."""
    draw.line(points(values), fill=PINK, width=round((width + 3) * SCALE), joint="curve")
    draw.line(points(values), fill=core, width=max(1, round(width * SCALE)), joint="curve")


def arrowhead(draw: ImageDraw.ImageDraw, x: float, y: float, angle: float, size: float = 8) -> None:
    wings = []
    for delta in (2.56, -2.56):
        wings.append((x + math.cos(angle + delta) * size, y + math.sin(angle + delta) * size))
    stroke(draw, [wings[0], (x, y), wings[1]], 2.6)


def two_way(draw: ImageDraw.ImageDraw, start: tuple[float, float], end: tuple[float, float]) -> None:
    stroke(draw, [start, end], 2.8)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    arrowhead(draw, *start, angle + math.pi)
    arrowhead(draw, *end, angle)


def pointer(draw: ImageDraw.ImageDraw) -> None:
    """The original Pop silhouette, kept deliberately angular and clean."""
    outer = [(11, 7), (11, 55), (24, 43), (33, 57), (43, 51), (33, 37), (50, 34)]
    inner = [(15, 14), (15, 47), (24, 38), (34, 52), (37, 50), (27, 34), (43, 32)]
    draw.polygon(points(outer), fill=PINK)
    draw.polygon(points(inner), fill=DARK)
    draw.line(points([(24, 16), (37, 26)]), fill=LIGHT, width=round(2 * SCALE))


def pointer_glow(image: Image.Image) -> None:
    mask = Image.new("L", image.size)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.polygon(points([(11, 7), (11, 55), (24, 43), (33, 57), (43, 51), (33, 37), (50, 34)]), fill=255)
    for radius, opacity in ((4, 130), (1.5, 230)):
        glow = Image.new("RGBA", image.size, (255, 126, 177, 0))
        glow.putalpha(mask.point(lambda value: value * opacity // 255))
        image.alpha_composite(glow.filter(ImageFilter.GaussianBlur(round(radius * SCALE))))


def spinner_tick(
    draw: ImageDraw.ImageDraw,
    x: float,
    y: float,
    angle: float,
    inner: float,
    outer: float,
    width: float,
    fill: tuple[int, int, int, int],
) -> None:
    ux, uy = math.cos(angle), math.sin(angle)
    px, py = -uy * width / 2, ux * width / 2
    start = (x + ux * inner, y + uy * inner)
    end = (x + ux * outer, y + uy * outer)
    draw.polygon(points([
        (start[0] + px, start[1] + py), (end[0] + px, end[1] + py),
        (end[0] - px, end[1] - py), (start[0] - px, start[1] - py),
    ]), fill=fill)


def spinner(draw: ImageDraw.ImageDraw, x: float, y: float, radius: float, frame: int, width: float) -> None:
    for index in range(ANIMATION_FRAMES):
        phase = (frame - index) % ANIMATION_FRAMES
        fill = LIGHT if phase == 0 else PINK[:3] + (max(58, 210 - phase * 23),)
        angle = math.tau * index / ANIMATION_FRAMES - math.pi / 2
        spinner_tick(draw, x, y, angle, radius - 3.2, radius + 1.2, width, fill)


def question_mark(draw: ImageDraw.ImageDraw, x: float, y: float) -> None:
    curve = [
        (x - 4, y - 3), (x - 2, y - 5), (x + 1, y - 5), (x + 4, y - 3),
        (x + 4, y - 1), (x + 2, y + 1), (x, y + 2.5), (x, y + 4),
    ]
    stroke(draw, curve, 1.6, LIGHT)
    for radius, fill in ((2.1, PINK), (.9, LIGHT)):
        draw.ellipse(
            (
                round((x - radius) * SCALE), round((y + 7 - radius) * SCALE),
                round((x + radius) * SCALE), round((y + 7 + radius) * SCALE),
            ),
            fill=fill,
        )


def question_badge(draw: ImageDraw.ImageDraw, x: float, y: float) -> None:
    octagon(draw, x, y, 9)
    question_mark(draw, x, y)


def pencil(draw: ImageDraw.ImageDraw) -> None:
    draw.polygon(points([(17, 47), (23, 53), (47, 23), (41, 17)]), fill=PINK)
    draw.polygon(points([(20, 47), (23, 50), (44, 23), (41, 20)]), fill=DARK)
    draw.polygon(points([(12, 57), (17, 47), (23, 53)]), fill=PINK)
    draw.polygon(points([(15, 54), (17, 50), (20, 53)]), fill=LIGHT)


def draw_role(role: str, frame: int = 0) -> Image.Image:
    image = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE))
    draw = ImageDraw.Draw(image)

    if role == "arrow":
        pointer(draw)
    elif role == "help":
        pointer(draw)
        question_badge(draw, *BADGE_CENTER)
    elif role == "workingInBackground":
        pointer(draw)
        spinner(draw, *BADGE_CENTER, 8, frame, 2.3)
    elif role == "busy":
        spinner(draw, 32, 32, 17, frame, 3.8)
    elif role == "precisionSelect":
        octagon(draw, 32, 32, 9, 2.8)
        stroke(draw, [(32, 8), (32, 21)], 2.4)
        stroke(draw, [(32, 43), (32, 56)], 2.4)
        stroke(draw, [(8, 32), (21, 32)], 2.4)
        stroke(draw, [(43, 32), (56, 32)], 2.4)
    elif role == "textSelect":
        stroke(draw, [(32, 10), (32, 54)], 3.5)
        stroke(draw, [(20, 12), (44, 12)], 2.6)
        stroke(draw, [(20, 52), (44, 52)], 2.6)
    elif role == "handwriting":
        pencil(draw)
    elif role == "unavailable":
        circle(draw, 32, 32, 20, 3.5)
        stroke(draw, [(19, 45), (45, 19)], 4.2)
    elif role == "verticalResize":
        two_way(draw, (32, 9), (32, 55))
    elif role == "horizontalResize":
        two_way(draw, (9, 32), (55, 32))
    elif role == "diagonalResize1":
        two_way(draw, (12, 12), (52, 52))
    elif role == "diagonalResize2":
        two_way(draw, (12, 52), (52, 12))
    elif role == "move":
        stroke(draw, [(32, 10), (32, 54)], 2.8)
        stroke(draw, [(10, 32), (54, 32)], 2.8)
        octagon(draw, 32, 32, 5.5, 2.4)
        arrowhead(draw, 32, 10, -math.pi / 2)
        arrowhead(draw, 32, 54, math.pi / 2)
        arrowhead(draw, 10, 32, math.pi)
        arrowhead(draw, 54, 32, 0)
    elif role == "alternateSelect":
        stroke(draw, [(32, 15), (32, 49)], 2.8)
        arrowhead(draw, 32, 9, -math.pi / 2)
        arrowhead(draw, 32, 55, math.pi / 2)
    elif role == "linkSelect":
        pointer_glow(image)
        pointer(draw)
    elif role == "personSelect":
        circle(draw, 32, 20, 10, 2.8)
        draw.rounded_rectangle((15 * SCALE, 34 * SCALE, 49 * SCALE, 56 * SCALE), radius=9 * SCALE, fill=PINK)
        draw.rounded_rectangle((20 * SCALE, 39 * SCALE, 44 * SCALE, 56 * SCALE), radius=6 * SCALE, fill=DARK)
    elif role == "locationSelect":
        octagon(draw, 32, 25, 17, 3.5)
        draw.polygon(points([(15, 28), (49, 28), (32, 56)]), fill=PINK)
        draw.polygon(points([(21, 29), (43, 29), (32, 50)]), fill=DARK)
        circle(draw, 32, 25, 5, 2)
    else:
        raise ValueError(f"Unknown role: {role}")

    return image.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def cursor_bytes(image: Image.Image, hotspot: tuple[int, int]) -> bytes:
    frames = [image.resize((32, 32), Image.Resampling.LANCZOS), image]
    payloads = []
    for frame in frames:
        output = BytesIO()
        frame.save(output, format="PNG", optimize=True)
        payloads.append(output.getvalue())
    offset = 6 + 16 * len(frames)
    data = bytearray(struct.pack("<HHH", 0, 2, len(frames)))
    for frame, payload in zip(frames, payloads):
        width, height = frame.size
        scaled_hotspot = (round(hotspot[0] * width / SIZE), round(hotspot[1] * height / SIZE))
        data.extend(struct.pack("<BBBBHHII", width % 256, height % 256, 0, 0, *scaled_hotspot, len(payload), offset))
        offset += len(payload)
    return bytes(data + b"".join(payloads))


def write_cursor(path: Path, image: Image.Image, hotspot: tuple[int, int]) -> None:
    path.write_bytes(cursor_bytes(image, hotspot))


def riff_chunk(kind: bytes, payload: bytes) -> bytes:
    return kind + struct.pack("<I", len(payload)) + payload + (b"\0" if len(payload) % 2 else b"")


def write_ani(path: Path, frames: list[Image.Image], hotspot: tuple[int, int]) -> None:
    cursors = [cursor_bytes(frame, hotspot) for frame in frames]
    header = struct.pack("<9I", 36, len(cursors), len(cursors), 0, 0, 0, 0, 3, 1)
    frames_chunk = b"fram" + b"".join(riff_chunk(b"icon", cursor) for cursor in cursors)
    body = b"ACON" + riff_chunk(b"anih", header) + riff_chunk(b"LIST", frames_chunk)
    path.write_bytes(b"RIFF" + struct.pack("<I", len(body)) + body)


def write_pack(folder: Path, name: str) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    for old_file in ("Working.cur", "Busy.cur"):
        (folder / old_file).unlink(missing_ok=True)
    for role, filename in ROLES.items():
        if role in ANIMATED_ROLES:
            write_ani(
                folder / filename,
                [draw_role(role, frame) for frame in range(ANIMATION_FRAMES)],
                HOTSPOTS[role],
            )
        else:
            write_cursor(folder / filename, draw_role(role), HOTSPOTS[role])
    (folder / "manifest.json").write_text(json.dumps({
        "name": name,
        "author": "Beepo Cursors",
        "authorUrl": "",
        "roles": ROLES,
    }, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    write_pack(POP_PACK, "Beepo Pop")


if __name__ == "__main__":
    main()
