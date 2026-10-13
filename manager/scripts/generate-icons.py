"""Render the rectangle-based SVG master to app and installer icons (requires Pillow).

Run with the bundled workspace Python from load_workspace_dependencies.
The bar proportions and colors follow website/styles.css.
"""

from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image, ImageDraw


root = Path(__file__).resolve().parents[1] / "build" / "icons"
svg = ET.parse(root / "logo.svg").getroot()
scale = 4
image = Image.new("RGBA", (1024 * scale, 1024 * scale))
draw = ImageDraw.Draw(image)
for rect in svg:
    x, y, width, height, radius = (
        float(rect.attrib[key]) * scale for key in ("x", "y", "width", "height", "rx")
    )
    draw.rounded_rectangle(
        (x, y, x + width - 1, y + height - 1), radius=radius, fill=rect.attrib["fill"]
    )
image = image.resize((1024, 1024), Image.Resampling.LANCZOS)
image.save(root / "icon.png")
image.save(root / "icon.ico", sizes=[(size, size) for size in (16, 24, 32, 48, 64, 128, 256)])
image.save(root / "icon.icns")
