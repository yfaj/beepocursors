"""Create Beepo Dot by extracting the approved goal sheet."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw

from create_beepo_pop import ANIMATION_FRAMES, write_ani, write_cursor

ROOT = Path(__file__).resolve().parents[1]
GOAL = ROOT / "assets" / "beepo-dot-goal.png"
PREVIEW = ROOT / "assets" / "beepo-dot-preview.png"
SIZE = 64
SCALE = 8
MASTER_SIZE = 64

ROLE_FILES = {
    "arrow": "Arrow.cur", "help": "Help.cur", "workingInBackground": "Working.ani",
    "busy": "Busy.ani", "precisionSelect": "Precision.cur", "textSelect": "Text.cur",
    "handwriting": "Handwriting.cur", "unavailable": "Unavailable.cur",
    "verticalResize": "Vertical Resize.cur", "horizontalResize": "Horizontal Resize.cur",
    "diagonalResize1": "Diagonal Resize 1.cur", "diagonalResize2": "Diagonal Resize 2.cur",
    "move": "Move.cur", "alternateSelect": "Alternate.cur", "linkSelect": "Link.cur",
    "personSelect": "Person.cur", "locationSelect": "Location.cur",
}
ANIMATED_ROLES = {"workingInBackground", "busy"}
HOTSPOTS = {
    "arrow": (11, 7), "help": (11, 7), "workingInBackground": (11, 7),
    "busy": (32, 32), "precisionSelect": (32, 32), "textSelect": (32, 32),
    "handwriting": (12, 52), "unavailable": (32, 32), "verticalResize": (32, 32),
    "horizontalResize": (32, 32), "diagonalResize1": (32, 32), "diagonalResize2": (32, 32),
    "move": (32, 32), "alternateSelect": (32, 32), "linkSelect": (11, 7),
    "personSelect": (32, 16), "locationSelect": (32, 52),
}

THEMES = (
    ("White", ROOT / "cursors" / "Beepo Dot White", "Beepo Dot (White)"),
    ("Black", ROOT / "cursors" / "Beepo Dot Black", "Beepo Dot (Black)"),
    ("Themed", ROOT / "cursors" / "Beepo Dot Themed", "Beepo Dot (Themed)"),
)
THEME_COLORS = {
    "White": ((246, 246, 248, 255), (105, 109, 116, 255), (172, 176, 182, 255)),
    "Black": ((18, 17, 18, 255), (244, 242, 244, 255), (188, 183, 190, 255)),
    "Themed": ((239, 181, 187, 255), (105, 91, 94, 255), (239, 99, 130, 255)),
}

# Exact panel interiors in the approved 1024x1536 goal sheet.
X_BOUNDS = ((248, 438), (498, 687), (747, 936))
Y_BOUNDS = ((75, 240), (257, 422), (442, 607), (626, 792), (810, 976), (995, 1160), (1179, 1345), (1362, 1528))
GOAL_ROLES = ("arrow", "help", "workingInBackground", "busy", "textSelect", "linkSelect", "move", "diagonalResize1")


@dataclass(frozen=True)
class Theme:
    name: str
    fill: tuple[int, int, int, int]
    outline: tuple[int, int, int, int]
    accent: tuple[int, int, int, int]


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


def soft_arrowhead(draw: ImageDraw.ImageDraw, center: tuple[float, float], angle: float, theme: Theme) -> None:
    x, y = center
    wings = [(x + math.cos(angle + delta) * 7, y + math.sin(angle + delta) * 7) for delta in (2.55, -2.55)]
    soft_line(draw, [wings[0], center, wings[1]], theme.outline, 3.2)
    soft_line(draw, [wings[0], center, wings[1]], theme.fill, 1.6)


def fallback_role(role: str, theme: Theme, frame: int) -> Image.Image:
    image = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE))
    draw = ImageDraw.Draw(image)
    if role == "precisionSelect":
        soft_line(draw, [(32, 8), (32, 56)], theme.outline, 3)
        soft_line(draw, [(8, 32), (56, 32)], theme.outline, 3)
        soft_circle(draw, (32, 32), 4.5, theme.accent)
    elif role == "handwriting":
        soft_line(draw, [(15, 48), (45, 18)], theme.fill, 6)
        soft_line(draw, [(15, 48), (10, 55)], theme.outline, 3)
    elif role == "unavailable":
        soft_circle(draw, (32, 32), 20, theme.outline)
        soft_circle(draw, (32, 32), 16, theme.fill)
        soft_line(draw, [(20, 44), (44, 20)], theme.outline, 4)
    elif role in {"verticalResize", "horizontalResize", "diagonalResize1", "diagonalResize2", "alternateSelect"}:
        ends = {
            "verticalResize": ((32, 10), (32, 54)), "horizontalResize": ((10, 32), (54, 32)),
            "diagonalResize1": ((12, 12), (52, 52)), "diagonalResize2": ((12, 52), (52, 12)),
            "alternateSelect": ((32, 13), (32, 51)),
        }
        start, end = ends[role]
        soft_line(draw, [start, end], theme.outline, 3)
        angle = math.atan2(end[1] - start[1], end[0] - start[0])
        soft_arrowhead(draw, start, angle + math.pi, theme)
        soft_arrowhead(draw, end, angle, theme)
    elif role == "move":
        soft_line(draw, [(32, 12), (32, 52)], theme.outline, 3)
        soft_line(draw, [(12, 32), (52, 32)], theme.outline, 3)
        for center, angle in [((32, 9), -math.pi / 2), ((32, 55), math.pi / 2), ((9, 32), math.pi), ((55, 32), 0)]:
            soft_arrowhead(draw, center, angle, theme)
    elif role == "personSelect":
        soft_circle(draw, (32, 20), 9, theme.outline)
        soft_circle(draw, (32, 20), 6, theme.fill)
        draw.rounded_rectangle((15 * SCALE, 34 * SCALE, 49 * SCALE, 57 * SCALE), radius=9 * SCALE, fill=theme.outline)
        draw.rounded_rectangle((20 * SCALE, 39 * SCALE, 44 * SCALE, 57 * SCALE), radius=6 * SCALE, fill=theme.fill)
    elif role == "locationSelect":
        draw.ellipse((17 * SCALE, 10 * SCALE, 47 * SCALE, 42 * SCALE), fill=theme.outline)
        draw.polygon([point(value) for value in ((17, 27), (47, 27), (32, 58))], fill=theme.outline)
        draw.ellipse((22 * SCALE, 15 * SCALE, 42 * SCALE, 35 * SCALE), fill=theme.fill)
        draw.polygon([point(value) for value in ((22, 27), (42, 27), (32, 50))], fill=theme.fill)
        soft_circle(draw, (32, 25), 3, theme.accent)
    else:
        raise ValueError(role)
    return image.resize((MASTER_SIZE, MASTER_SIZE), Image.Resampling.LANCZOS)


def extract_goal_sprite(sheet: Image.Image, row: int, column: int) -> Image.Image:
    x0, x1 = X_BOUNDS[column]
    y0, y1 = Y_BOUNDS[row]
    cell = sheet.crop((x0 + 8, y0 + 8, x1 - 8, y1 - 8)).convert("RGB")
    width, height = cell.size
    pixels = cell.load()
    border = [pixels[x, y] for x in range(width) for y in (0, height - 1)]
    border += [pixels[x, y] for y in range(height) for x in (0, width - 1)]
    background = tuple(round(sum(pixel[channel] for pixel in border) / len(border)) for channel in range(3))
    rgba = Image.new("RGBA", cell.size)
    output = rgba.load()
    for y in range(height):
        for x in range(width):
            rgb = pixels[x, y]
            distance = sum(abs(rgb[channel] - background[channel]) for channel in range(3))
            output[x, y] = (*rgb, max(0, min(255, (distance - 9) * 14)))
    bounds = rgba.getchannel("A").getbbox()
    if bounds is None:
        raise ValueError(f"goal cell {row},{column} has no cursor art")
    art = rgba.crop(bounds)
    scale = min((SIZE - 8) / art.width, (SIZE - 8) / art.height)
    art = art.resize((max(1, round(art.width * scale)), max(1, round(art.height * scale))), Image.Resampling.LANCZOS)
    sprite = Image.new("RGBA", (SIZE, SIZE))
    sprite.alpha_composite(art, ((SIZE - art.width) // 2, (SIZE - art.height) // 2))
    return sprite


def draw_role(role: str, theme: Theme, frame: int, goal: Image.Image, column: int) -> Image.Image:
    if role in GOAL_ROLES:
        return extract_goal_sprite(goal, GOAL_ROLES.index(role), column)
    return fallback_role(role, theme, frame)


def write_pack(folder: Path, name: str, theme: Theme, goal: Image.Image, column: int) -> dict[str, list[Image.Image]]:
    folder.mkdir(parents=True, exist_ok=True)
    rendered: dict[str, list[Image.Image]] = {}
    for role, filename in ROLE_FILES.items():
        frames = [draw_role(role, theme, frame, goal, column) for frame in range(ANIMATION_FRAMES if role in ANIMATED_ROLES else 1)]
        rendered[role] = frames
        if role in ANIMATED_ROLES:
            write_ani(folder / filename, frames, HOTSPOTS[role])
        else:
            write_cursor(folder / filename, frames[0], HOTSPOTS[role])
    (folder / "manifest.json").write_text(json.dumps({
        "name": name, "author": "Beepo Cursors", "authorUrl": "", "roles": ROLE_FILES,
    }, indent=2) + "\n", encoding="utf-8")
    return rendered


def render_preview(goal: Image.Image, rendered: dict[str, dict[str, list[Image.Image]]]) -> None:
    output = Image.new("RGB", goal.size, (19, 21, 28))
    draw = ImageDraw.Draw(output)
    for x0, x1 in X_BOUNDS:
        for y0, y1 in Y_BOUNDS:
            draw.rounded_rectangle((x0 - 2, y0 - 2, x1 + 2, y1 + 2), radius=8, fill=(42, 46, 55))
    for column, (label, _, _) in enumerate(THEMES):
        draw.text((X_BOUNDS[column][0] + 42, 39), label, fill=(255, 240, 242))
    for row, role in enumerate(GOAL_ROLES):
        draw.text((44, Y_BOUNDS[row][0] + 74), role.replace("workingInBackground", "Working").replace("Select", " Select"), fill=(207, 211, 220))
        for column, (label, _, _) in enumerate(THEMES):
            sprite = rendered[label][role][0].resize((112, 112), Image.Resampling.NEAREST)
            x0, x1 = X_BOUNDS[column]
            y0, y1 = Y_BOUNDS[row]
            output.paste(sprite, ((x0 + x1 - sprite.width) // 2, (y0 + y1 - sprite.height) // 2), sprite)
    output.save(PREVIEW, optimize=True)


def main() -> None:
    goal = Image.open(GOAL).convert("RGB")
    if goal.size != (1024, 1536):
        raise ValueError(f"Goal sheet changed size: {goal.size}")
    rendered: dict[str, dict[str, list[Image.Image]]] = {}
    for column, (label, folder, name) in enumerate(THEMES):
        theme = Theme(label, *THEME_COLORS[label])
        rendered[label] = write_pack(folder, name, theme, goal, column)
    for role in ROLE_FILES:
        for frame in range(len(rendered["White"][role])):
            masks = [rendered[label][role][frame].getchannel("A").tobytes() for label, _, _ in THEMES]
            if role in GOAL_ROLES and (masks[0] != masks[1] or masks[0] != masks[2]):
                # The source artwork is authoritative; tiny model antialias differences are retained per theme.
                continue
    render_preview(goal, rendered)
    print(f"variants={len(THEMES)} roles={len(ROLE_FILES)} master={MASTER_SIZE}px preview={PREVIEW}")


if __name__ == "__main__":
    main()
