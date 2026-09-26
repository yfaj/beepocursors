"""Create the rounded Beepo cursor pack from the supplied reference art."""

from __future__ import annotations

import json
import math
import struct
from functools import cache
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


SIZE = 64
SCALE = 4
PINK = (221, 156, 171, 255)
DARK = (24, 19, 22, 255)
LIGHT = (255, 244, 246, 255)
ROOT = Path(__file__).resolve().parents[1]
ROUNDED_PACK = ROOT / "cursors" / "Beepo Rounded"
REFERENCE_POINTER = ROOT / "assets" / "beepo-pop-pointer.png"

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
BADGE_CENTER = (44, 15)

HOTSPOTS = {
    "arrow": (10, 5), "help": (10, 5), "workingInBackground": (10, 5),
    "busy": (32, 32), "precisionSelect": (32, 32), "textSelect": (32, 32),
    "handwriting": (13, 53), "unavailable": (32, 32), "verticalResize": (32, 32),
    "horizontalResize": (32, 32), "diagonalResize1": (32, 32), "diagonalResize2": (32, 32),
    "move": (32, 32), "alternateSelect": (32, 8), "linkSelect": (10, 5),
    "personSelect": (32, 18), "locationSelect": (32, 54),
}


def xy(point: tuple[float, float]) -> tuple[int, int]:
    return round(point[0] * SCALE), round(point[1] * SCALE)


def points(values: list[tuple[float, float]]) -> list[tuple[int, int]]:
    return [xy(value) for value in values]


def circle(draw: ImageDraw.ImageDraw, x: float, y: float, radius: float, inset: float = 3) -> None:
    draw.ellipse((round((x - radius) * SCALE), round((y - radius) * SCALE), round((x + radius) * SCALE), round((y + radius) * SCALE)), fill=PINK)
    draw.ellipse((round((x - radius + inset) * SCALE), round((y - radius + inset) * SCALE), round((x + radius - inset) * SCALE), round((y + radius - inset) * SCALE)), fill=DARK)


def rounded_line(draw: ImageDraw.ImageDraw, values: list[tuple[float, float]], fill: tuple[int, int, int, int], width: float) -> None:
    line = points(values)
    diameter = max(1, round(width * SCALE))
    draw.line(line, fill=fill, width=diameter, joint="curve")
    radius = diameter / 2
    for x, y in (line[0], line[-1]):
        draw.ellipse((round(x - radius), round(y - radius), round(x + radius), round(y + radius)), fill=fill)


def stroke(draw: ImageDraw.ImageDraw, values: list[tuple[float, float]], width: float = 4) -> None:
    rounded_line(draw, values, PINK, width + 4)
    rounded_line(draw, values, DARK, width)


def arrowhead(draw: ImageDraw.ImageDraw, x: float, y: float, angle: float, size: float = 8) -> None:
    wings = []
    for delta in (2.55, -2.55):
        wings.append((x + math.cos(angle + delta) * size, y + math.sin(angle + delta) * size))
    stroke(draw, [wings[0], (x, y), wings[1]], 4)


def two_way(draw: ImageDraw.ImageDraw, start: tuple[float, float], end: tuple[float, float]) -> None:
    stroke(draw, [start, end], 4)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    arrowhead(draw, *start, angle + math.pi)
    arrowhead(draw, *end, angle)


@cache
def reference_pointer() -> Image.Image:
    source = Image.open(REFERENCE_POINTER).convert("RGBA")
    bounds = source.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError("Beepo pointer reference has no visible pixels")
    return source.crop(bounds)


def pointer_layer(
    scale: float = 1,
    offset: tuple[float, float] = (0, 0),
) -> Image.Image:
    source = reference_pointer()
    height = round(52 * SCALE * scale)
    width = round(source.width * height / source.height)
    layer = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE))
    layer.alpha_composite(
        source.resize((width, height), Image.Resampling.LANCZOS),
        (round((10 * scale + offset[0]) * SCALE), round((5 * scale + offset[1]) * SCALE)),
    )
    return layer


def pointer(image: Image.Image, scale: float = 1, offset: tuple[float, float] = (0, 0)) -> None:
    image.alpha_composite(pointer_layer(scale, offset))


def pointer_glow(image: Image.Image, scale: float = 1, offset: tuple[float, float] = (0, 0)) -> None:
    alpha = pointer_layer(scale, offset).getchannel("A")
    for radius, opacity in ((3, 90), (1, 210)):
        glow = Image.new("RGBA", image.size, (255, 121, 177, 0))
        glow.putalpha(alpha.point(lambda value: value * opacity // 255))
        image.alpha_composite(glow.filter(ImageFilter.GaussianBlur(radius * SCALE)))


def spinner(draw: ImageDraw.ImageDraw, x: float, y: float, radius: float, frame: int, width: float) -> None:
    for index in range(ANIMATION_FRAMES):
        angle = math.tau * index / ANIMATION_FRAMES - math.pi / 2
        inner = radius - 3.2
        outer = radius + 1.4
        phase = (frame - index) % ANIMATION_FRAMES
        fill = LIGHT if phase == 0 else PINK[:3] + (max(70, 225 - phase * 24),)
        rounded_line(
            draw,
            [
                (x + math.cos(angle) * inner, y + math.sin(angle) * inner),
                (x + math.cos(angle) * outer, y + math.sin(angle) * outer),
            ],
            fill,
            width,
        )


def question_mark(draw: ImageDraw.ImageDraw, x: float, y: float) -> None:
    curve = [
        (x - 4, y - 3), (x - 2, y - 5), (x + 1, y - 5), (x + 4, y - 3),
        (x + 4, y - 1), (x + 2, y + 1), (x, y + 2.5), (x, y + 4),
    ]
    rounded_line(draw, curve, PINK, 4)
    rounded_line(draw, curve, LIGHT, 1.6)
    for radius, fill in ((2.4, PINK), (1.1, LIGHT)):
        draw.ellipse(
            (
                round((x - radius) * SCALE), round((y + 7 - radius) * SCALE),
                round((x + radius) * SCALE), round((y + 7 + radius) * SCALE),
            ),
            fill=fill,
        )


def question_badge(draw: ImageDraw.ImageDraw, x: float, y: float) -> None:
    circle(draw, x, y, 9, 2.5)
    question_mark(draw, x, y)


def draw_role(role: str, frame: int = 0) -> Image.Image:
    image = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE))
    draw = ImageDraw.Draw(image)

    if role == "arrow":
        pointer(image)
    elif role == "help":
        pointer(image)
        question_badge(draw, *BADGE_CENTER)
    elif role == "workingInBackground":
        pointer(image)
        spinner(draw, *BADGE_CENTER, 8.2, frame, 2.3)
    elif role == "busy":
        spinner(draw, 32, 32, 17, frame, 4)
    elif role == "precisionSelect":
        circle(draw, 32, 32, 10, 3)
        stroke(draw, [(32, 8), (32, 21)], 3)
        stroke(draw, [(32, 43), (32, 56)], 3)
        stroke(draw, [(8, 32), (21, 32)], 3)
        stroke(draw, [(43, 32), (56, 32)], 3)
    elif role == "textSelect":
        stroke(draw, [(32, 10), (32, 54)], 5)
        stroke(draw, [(20, 12), (44, 12)], 4)
        stroke(draw, [(20, 52), (44, 52)], 4)
    elif role == "handwriting":
        stroke(draw, [(18, 48), (42, 18)], 7)
        draw.polygon(points([(13, 54), (18, 43), (23, 49)]), fill=PINK)
        draw.polygon(points([(15, 51), (18, 46), (20, 49)]), fill=LIGHT)
    elif role == "unavailable":
        circle(draw, 32, 32, 20, 4)
        stroke(draw, [(19, 45), (45, 19)], 6)
    elif role == "verticalResize":
        two_way(draw, (32, 9), (32, 55))
    elif role == "horizontalResize":
        two_way(draw, (9, 32), (55, 32))
    elif role == "diagonalResize1":
        two_way(draw, (12, 12), (52, 52))
    elif role == "diagonalResize2":
        two_way(draw, (12, 52), (52, 12))
    elif role == "move":
        stroke(draw, [(32, 10), (32, 54)], 4)
        stroke(draw, [(10, 32), (54, 32)], 4)
        arrowhead(draw, 32, 10, -math.pi / 2)
        arrowhead(draw, 32, 54, math.pi / 2)
        arrowhead(draw, 10, 32, math.pi)
        arrowhead(draw, 54, 32, 0)
    elif role == "alternateSelect":
        two_way(draw, (32, 12), (32, 52))
    elif role == "linkSelect":
        pointer_glow(image)
        pointer(image)
    elif role == "personSelect":
        circle(draw, 32, 20, 11, 3)
        draw.rounded_rectangle((16 * SCALE, 34 * SCALE, 48 * SCALE, 55 * SCALE), radius=10 * SCALE, fill=PINK)
        draw.rounded_rectangle((21 * SCALE, 39 * SCALE, 43 * SCALE, 55 * SCALE), radius=7 * SCALE, fill=DARK)
    elif role == "locationSelect":
        draw.ellipse((15 * SCALE, 8 * SCALE, 49 * SCALE, 42 * SCALE), fill=PINK)
        draw.polygon(points([(15, 25), (49, 25), (32, 56)]), fill=PINK)
        draw.ellipse((20 * SCALE, 13 * SCALE, 44 * SCALE, 37 * SCALE), fill=DARK)
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
    write_pack(ROUNDED_PACK, "Beepo Rounded")


if __name__ == "__main__":
    main()
