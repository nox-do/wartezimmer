"""Render the DMG layout at 1x/2x with Pillow on macOS.

The icon positions in package.json use the same 640x360 coordinate space.
Run with the bundled workspace Python from load_workspace_dependencies.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


output = Path(__file__).resolve().parents[1] / "installer-assets"
output.mkdir(exist_ok=True)
scale = 4
image = Image.new("RGB", (640 * scale, 360 * scale), "#f7f8f4")
draw = ImageDraw.Draw(image)
font_path = "/System/Library/Fonts/Helvetica.ttc"


def text(label, y, size, color, bold=False):
    font = ImageFont.truetype(font_path, size * scale, index=1 if bold else 0)
    draw.text((320 * scale, y * scale), label, font=font, fill=color, anchor="mm")


text("Wartezimmer installieren", 50, 26, "#2d5941", bold=True)
text("Ziehen Sie die App in den Ordner Programme.", 91, 15, "#53635b")
draw.line(
    [(292 * scale, 195 * scale), (348 * scale, 195 * scale)],
    fill="#2d5941",
    width=3 * scale,
)
draw.line(
    [(334 * scale, 181 * scale), (348 * scale, 195 * scale), (334 * scale, 209 * scale)],
    fill="#2d5941",
    width=3 * scale,
    joint="curve",
)
text("Danach im Ordner Programme öffnen.", 316, 13, "#53635b")

for factor, suffix in [(1, ""), (2, "@2x")]:
    image.resize((640 * factor, 360 * factor), Image.Resampling.LANCZOS).save(
        output / f"dmg-background{suffix}.png", dpi=(72 * factor, 72 * factor)
    )
