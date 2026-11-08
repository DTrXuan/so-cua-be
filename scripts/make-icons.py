"""Render the app icons (split oval on walnut) to PNG with headless Chrome.
Usage: python3 scripts/make-icons.py  (run from the repo root)"""
import pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
OUT.mkdir(exist_ok=True)

def icon_svg(scale: float) -> str:
    # scale < 1 shrinks the mark so it stays inside the maskable safe zone
    r = 118 * scale
    gap = 7 * scale
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" fill="#1C1612"/>
  <path d="M{256 - gap} {256 - r} A{r * 0.92} {r} 0 0 0 {256 - gap} {256 + r} Z" fill="#F0A048"/>
  <path d="M{256 + gap} {256 - r} A{r * 0.92} {r} 0 0 1 {256 + gap} {256 + r} Z" fill="#FFD29C"/>
</svg>"""

TARGETS = [
    ("icon-192.png", 192, 1.0),
    ("icon-512.png", 512, 1.0),
    ("icon-maskable-512.png", 512, 0.8),
    ("apple-touch-icon.png", 180, 1.0),
]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    for name, size, scale in TARGETS:
        page = browser.new_page(viewport={"width": size, "height": size}, device_scale_factor=1)
        page.set_content(f'<html><body style="margin:0">{icon_svg(scale).replace(chr(10), "")}</body></html>')
        page.eval_on_selector("svg", f"s => {{ s.setAttribute('width', {size}); s.setAttribute('height', {size}); }}")
        page.screenshot(path=str(OUT / name), clip={"x": 0, "y": 0, "width": size, "height": size})
        page.close()
    browser.close()
print("icons:", ", ".join(t[0] for t in TARGETS))
