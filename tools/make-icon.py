"""Generates the launcher icon layers (a dotted clock face with a Nothing-red dot at 12) as Android vector drawables.
Run from the repo root:  python3 tools/make-icon.py"""
import math

RED, WHITE = "#D71921", "#F4F3F0"
CX = CY = 54          # centre of the 108dp canvas
HOUR_RADIUS = 25      # distance of the hour dots from the centre (safe zone limit is 33)


def fmt(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


def dot(cx, cy, r):
    # A circle as two arcs. Radii are multiples of 0.25 so the maths stays exact.
    return f"M{fmt(cx - r)},{fmt(cy)}a{fmt(r)},{fmt(r)} 0 1,0 {fmt(2 * r)},0a{fmt(r)},{fmt(r)} 0 1,0 -{fmt(2 * r)},0"


hours = [(CX + HOUR_RADIUS * math.sin(math.radians(30 * k)), CY - HOUR_RADIUS * math.cos(math.radians(30 * k))) for k in range(12)]
red = dot(hours[0][0], hours[0][1], 4.5)                       # the 12 o'clock dot
white = "".join(dot(x, y, 3.25) for x, y in hours[1:])          # the other eleven hours
colon = dot(CX, CY - 6, 2.75) + dot(CX, CY + 6, 2.75)           # a small dot colon in the middle

HEAD = '<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="108dp"\n    android:height="108dp"\n    android:viewportWidth="108"\n    android:viewportHeight="108">\n'


def layer(color, d):
    return f'    <path\n        android:fillColor="{color}"\n        android:pathData="{d}" />\n'


base = "app/src/main/res/drawable/"
open(base + "ic_launcher_foreground.xml", "w").write(HEAD + layer(RED, red) + layer(WHITE, white + colon) + "</vector>\n")
# Themed icon: one colour, Android tints it to match the wallpaper.
open(base + "ic_launcher_monochrome.xml", "w").write(HEAD + layer("#FFFFFF", red + white + colon) + "</vector>\n")
print("wrote foreground and monochrome")
