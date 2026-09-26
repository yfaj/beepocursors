"""Create the simple Beepo Crosshair Windows cursor pack."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw
import create_beepo_pop as pop

from create_beepo_pop import (
    ANIMATED_ROLES,
    ANIMATION_FRAMES,
    DARK,
    HOTSPOTS,
    PINK,
    ROLES,
    SCALE,
    SIZE,
    draw_role as draw_pop_role,
    spinner,
    write_ani,
    write_cursor,
)


ROOT = Path(__file__).resolve().parents[1]
CROSSHAIR_PACK = ROOT / "cursors" / "Beepo Crosshair"
WHITE_PACK = ROOT / "cursors" / "Beepo Crosshair White"
WHITE = (238, 239, 242, 255)
CROSSHAIR_ROLES = {"arrow", "help", "workingInBackground", "precisionSelect", "linkSelect"}
CROSSHAIR_HOTSPOTS = {
    **HOTSPOTS,
    "arrow": (32, 32),
    "help": (32, 32),
    "workingInBackground": (32, 32),
    "precisionSelect": (32, 32),
    "linkSelect": (32, 32),
}


def rounded_line(
    draw: ImageDraw.ImageDraw,
    start: tuple[float, float],
    end: tuple[float, float],
    fill: tuple[int, int, int, int],
    width: float,
) -> None:
    points = [tuple(round(value * SCALE) for value in point) for point in (start, end)]
    diameter = round(width * SCALE)
    radius = diameter / 2
    draw.line(points, fill=fill, width=diameter)
    for x, y in points:
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def crosshair(
    image: Image.Image,
    color: tuple[int, int, int, int],
    diagonal: bool = False,
) -> None:
    draw = ImageDraw.Draw(image)
    arms = (
        [((16, 16), (27, 27)), ((37, 37), (48, 48)), ((16, 48), (27, 37)), ((37, 27), (48, 16))]
        if diagonal
        else [((32, 10), (32, 27)), ((32, 37), (32, 54)), ((10, 32), (27, 32)), ((37, 32), (54, 32))]
    )
    for start, end in arms:
        rounded_line(draw, start, end, DARK, 8)
        rounded_line(draw, start, end, color, 4)


def draw_role(
    role: str,
    frame: int = 0,
    color: tuple[int, int, int, int] = PINK,
) -> Image.Image:
    original = pop.PINK
    pop.PINK = color
    try:
        if role not in CROSSHAIR_ROLES:
            return draw_pop_role(role, frame)

        image = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE))
        crosshair(image, color, diagonal=role in {"help", "linkSelect"})
        draw = ImageDraw.Draw(image)
        if role == "workingInBackground":
            spinner(draw, 48, 15, 8, frame, 2.3)
        return image.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    finally:
        pop.PINK = original


def write_pack(
    folder: Path,
    name: str,
    color: tuple[int, int, int, int],
) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    for role, filename in ROLES.items():
        if role in ANIMATED_ROLES:
            write_ani(
                folder / filename,
                [draw_role(role, frame, color) for frame in range(ANIMATION_FRAMES)],
                CROSSHAIR_HOTSPOTS[role],
            )
        else:
            write_cursor(folder / filename, draw_role(role, color=color), CROSSHAIR_HOTSPOTS[role])
    (folder / "manifest.json").write_text(json.dumps({
        "name": name,
        "author": "Beepo",
        "authorUrl": "",
        "roles": ROLES,
    }, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    for role in ROLES:
        frames = range(ANIMATION_FRAMES) if role in ANIMATED_ROLES else range(1)
        for frame in frames:
            pink = draw_role(role, frame, PINK)
            white = draw_role(role, frame, WHITE)
            if pink.getchannel("A").tobytes() != white.getchannel("A").tobytes():
                raise ValueError(f"{role}: white variant geometry drifted")
    write_pack(CROSSHAIR_PACK, "Beepo Crosshair", PINK)
    write_pack(WHITE_PACK, "Beepo Crosshair (White)", WHITE)


if __name__ == "__main__":
    main()
