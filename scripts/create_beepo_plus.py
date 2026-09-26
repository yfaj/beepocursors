"""Create the soft, rounded, tiny Beepo Crosshair Mini plus cursor pack."""

from __future__ import annotations

import json
import math
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw

from create_beepo_pop import ANIMATION_FRAMES, write_ani, write_cursor


ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "cursors" / "Beepo Crosshair Mini"
SIZE = 64
SCALE = 8
MASTER_SIZE = 64
PINK = (221, 156, 171, 255)
DARK = (24, 19, 22, 255)
LIGHT = (255, 244, 246, 255)
ANIMATED_ROLES = {"workingInBackground", "busy"}
ROLES = {
    "arrow": "Arrow.cur", "help": "Help.cur", "workingInBackground": "Working.ani",
    "busy": "Busy.ani", "precisionSelect": "Precision.cur", "textSelect": "Text.cur",
    "handwriting": "Handwriting.cur", "unavailable": "Unavailable.cur",
    "verticalResize": "Vertical Resize.cur", "horizontalResize": "Horizontal Resize.cur",
    "diagonalResize1": "Diagonal Resize 1.cur", "diagonalResize2": "Diagonal Resize 2.cur",
    "move": "Move.cur", "alternateSelect": "Alternate.cur", "linkSelect": "Link.cur",
    "personSelect": "Person.cur", "locationSelect": "Location.cur",
}
HOTSPOTS = {role: (32, 32) for role in ROLES}


def point(value: tuple[float, float]) -> tuple[int, int]:
    return tuple(round(part * SCALE) for part in value)


def soft_line(draw: ImageDraw.ImageDraw, values: list[tuple[float, float]], color: tuple[int, int, int, int], width: float) -> None:
    scaled = [point(value) for value in values]
    draw.line(scaled, fill=color, width=round(width * SCALE), joint="curve")
    radius = width * SCALE / 2
    for x, y in (scaled[0], scaled[-1]):
        draw.ellipse((round(x - radius), round(y - radius), round(x + radius), round(y + radius)), fill=color)


def soft_circle(draw: ImageDraw.ImageDraw, center: tuple[float, float], radius: float, color: tuple[int, int, int, int]) -> None:
    x, y = center
    draw.ellipse((round((x - radius) * SCALE), round((y - radius) * SCALE), round((x + radius) * SCALE), round((y + radius) * SCALE)), fill=color)


def plus(draw: ImageDraw.ImageDraw, color: tuple[int, int, int, int] = PINK, width: float = 2.4, size: float = 10) -> None:
    soft_line(draw, [(32 - size, 32), (32 + size, 32)], color, width)
    soft_line(draw, [(32, 32 - size), (32, 32 + size)], color, width)


def arrowhead(draw: ImageDraw.ImageDraw, center: tuple[float, float], angle: float, color: tuple[int, int, int, int]) -> None:
    x, y = center
    wings = [(x + math.cos(angle + delta) * 6, y + math.sin(angle + delta) * 6) for delta in (2.55, -2.55)]
    soft_line(draw, [wings[0], center, wings[1]], color, 2.2)


def x_mark(draw: ImageDraw.ImageDraw, color: tuple[int, int, int, int], width: float = 2.4, size: float = 8) -> None:
    soft_line(draw, [(32 - size, 32 - size), (32 + size, 32 + size)], color, width)
    soft_line(draw, [(32 - size, 32 + size), (32 + size, 32 - size)], color, width)


def draw_role(role: str, frame: int = 0) -> Image.Image:
    image = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE))
    draw = ImageDraw.Draw(image)
    if role == "arrow":
        plus(draw, DARK, 4.8, 10)
        plus(draw, PINK, 2.4, 10)
    elif role == "help":
        x_mark(draw, DARK, 4.8, 8)
        x_mark(draw, PINK, 2.4, 8)
    elif role == "workingInBackground":
        plus(draw, DARK, 4.8, 10)
        plus(draw, PINK, 2.4, 10)
        for index, center in enumerate(((48, 16), (53, 22), (48, 28))):
            soft_circle(draw, center, 2.6, DARK)
            soft_circle(draw, center, 1.3, LIGHT if index == frame % 3 else PINK)
    elif role == "busy":
        soft_circle(draw, (32, 32), 16, DARK)
        soft_circle(draw, (32, 32), 11.5, LIGHT)
        angle = math.tau * (frame % ANIMATION_FRAMES) / ANIMATION_FRAMES
        soft_circle(draw, (32 + math.cos(angle) * 13.5, 32 + math.sin(angle) * 13.5), 2.8, PINK)
    elif role == "precisionSelect":
        plus(draw, DARK, 4.6, 15)
        plus(draw, PINK, 2, 15)
        soft_circle(draw, (32, 32), 3, LIGHT)
    elif role == "textSelect":
        soft_line(draw, [(32, 14), (32, 50)], DARK, 4.4)
        soft_line(draw, [(32, 14), (32, 50)], PINK, 2)
        soft_line(draw, [(23, 14), (41, 14)], DARK, 3.6)
        soft_line(draw, [(23, 50), (41, 50)], DARK, 3.6)
    elif role == "handwriting":
        soft_line(draw, [(17, 47), (45, 19)], DARK, 7)
        soft_line(draw, [(17, 47), (45, 19)], PINK, 3.6)
        soft_line(draw, [(12, 54), (18, 48)], DARK, 3)
    elif role == "unavailable":
        soft_circle(draw, (32, 32), 19, DARK)
        soft_circle(draw, (32, 32), 14, PINK)
        soft_line(draw, [(20, 44), (44, 20)], DARK, 3.5)
    elif role in {"verticalResize", "horizontalResize", "diagonalResize1", "diagonalResize2", "alternateSelect"}:
        ends = {
            "verticalResize": ((32, 10), (32, 54)), "horizontalResize": ((10, 32), (54, 32)),
            "diagonalResize1": ((12, 12), (52, 52)), "diagonalResize2": ((12, 52), (52, 12)),
            "alternateSelect": ((32, 13), (32, 51)),
        }
        start, end = ends[role]
        angle = math.atan2(end[1] - start[1], end[0] - start[0])
        soft_line(draw, [start, end], DARK, 4.2)
        soft_line(draw, [start, end], PINK, 2)
        arrowhead(draw, start, angle + math.pi, DARK)
        arrowhead(draw, end, angle, DARK)
    elif role == "move":
        plus(draw, DARK, 4.8, 17)
        plus(draw, PINK, 2.2, 17)
        for center, angle in [((32, 9), -math.pi / 2), ((32, 55), math.pi / 2), ((9, 32), math.pi), ((55, 32), 0)]:
            arrowhead(draw, center, angle, DARK)
    elif role == "linkSelect":
        plus(draw, DARK, 4.8, 10)
        plus(draw, PINK, 2.4, 10)
        soft_line(draw, [(43, 43), (53, 33)], DARK, 3.5)
        soft_circle(draw, (44, 44), 4.5, PINK)
        soft_circle(draw, (52, 34), 4.5, PINK)
    elif role == "personSelect":
        soft_circle(draw, (32, 20), 8, DARK)
        soft_circle(draw, (32, 20), 5, PINK)
        draw.rounded_rectangle((16 * SCALE, 34 * SCALE, 48 * SCALE, 56 * SCALE), radius=8 * SCALE, fill=DARK)
        draw.rounded_rectangle((21 * SCALE, 39 * SCALE, 43 * SCALE, 56 * SCALE), radius=5 * SCALE, fill=PINK)
    elif role == "locationSelect":
        draw.ellipse((17 * SCALE, 10 * SCALE, 47 * SCALE, 42 * SCALE), fill=DARK)
        draw.polygon([point(value) for value in ((17, 27), (47, 27), (32, 57))], fill=DARK)
        draw.ellipse((22 * SCALE, 15 * SCALE, 42 * SCALE, 35 * SCALE), fill=PINK)
        draw.polygon([point(value) for value in ((22, 27), (42, 27), (32, 50))], fill=PINK)
        soft_circle(draw, (32, 25), 3, DARK)
    else:
        raise ValueError(role)
    return image.resize((MASTER_SIZE, MASTER_SIZE), Image.Resampling.LANCZOS)


def main() -> None:
    PACK.mkdir(parents=True, exist_ok=True)
    for role, filename in ROLES.items():
        frames = [draw_role(role, frame) for frame in range(ANIMATION_FRAMES if role in ANIMATED_ROLES else 1)]
        if role in ANIMATED_ROLES:
            write_ani(PACK / filename, frames, HOTSPOTS[role])
        else:
            write_cursor(PACK / filename, frames[0], HOTSPOTS[role])
    (PACK / "manifest.json").write_text(json.dumps({
        "name": "Beepo Crosshair Mini", "author": "Beepo Cursors", "authorUrl": "", "roles": ROLES,
    }, indent=2) + "\n", encoding="utf-8")
    print(f"pack={PACK} roles={len(ROLES)} master={MASTER_SIZE}px")


if __name__ == "__main__":
    main()
