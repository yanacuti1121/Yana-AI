"""HEX/RGB/HSV/HSL color conversion, parsing, and CSS color-name lookup.

Origin:  penpot/penpot, common/src/app/common/colors.cljc
         (MPL-2.0) -- https://github.com/penpot/penpot. Provided as a
         source zip snapshot (docs/penpot-develop.zip), not a pinned git
         fetch -- no exact commit SHA available; zip extraction timestamp
         2026-06-19 cited instead.
Ported:  2026-06-20. Direct translation of every pure function in the
         source file. `rgb->hsv`/`hsv->rgb` deliberately keep the original's
         convention of an *unnormalized* (0-255) value/brightness channel
         (not 0-1) -- callers in the original codebase (e.g. `sort-colors`)
         divide by 255 themselves, so this port preserves that rather than
         "fixing" it into a different, more conventional HSV range.
         `format_hsla`/`format_rgba` reproduce `app.common.data/format-number`
         (round to N decimals, then strip trailing zeros) since both
         depend on it for their exact string output.
License: MPL-2.0 (see vendor/penpot/_upstream/LICENSE)

Purpose: a complete, dependency-free color-conversion toolkit (hex/rgb/hsv/hsl
round-tripping, CSS named-color parsing/validation, "next distinct color"
generation) -- reusable wherever Yana AI renders or generates UI color tokens
(e.g. color-rules.md's semantic token system) without pulling in a third-party
color library.
"""
from __future__ import annotations

import math
import re
from typing import Optional

NAMES: dict[str, str] = {
    "aliceblue": "#f0f8ff", "antiquewhite": "#faebd7", "aqua": "#00ffff",
    "aquamarine": "#7fffd4", "azure": "#f0ffff", "beige": "#f5f5dc",
    "bisque": "#ffe4c4", "black": "#000000", "blanchedalmond": "#ffebcd",
    "blue": "#0000ff", "blueviolet": "#8a2be2", "brown": "#a52a2a",
    "burlywood": "#deb887", "cadetblue": "#5f9ea0", "chartreuse": "#7fff00",
    "chocolate": "#d2691e", "coral": "#ff7f50", "cornflowerblue": "#6495ed",
    "cornsilk": "#fff8dc", "crimson": "#dc143c", "cyan": "#00ffff",
    "darkblue": "#00008b", "darkcyan": "#008b8b", "darkgoldenrod": "#b8860b",
    "darkgray": "#a9a9a9", "darkgreen": "#006400", "darkgrey": "#a9a9a9",
    "darkkhaki": "#bdb76b", "darkmagenta": "#8b008b", "darkolivegreen": "#556b2f",
    "darkorange": "#ff8c00", "darkorchid": "#9932cc", "darkred": "#8b0000",
    "darksalmon": "#e9967a", "darkseagreen": "#8fbc8f", "darkslateblue": "#483d8b",
    "darkslategray": "#2f4f4f", "darkslategrey": "#2f4f4f", "darkturquoise": "#00ced1",
    "darkviolet": "#9400d3", "deeppink": "#ff1493", "deepskyblue": "#00bfff",
    "dimgray": "#696969", "dimgrey": "#696969", "dodgerblue": "#1e90ff",
    "firebrick": "#b22222", "floralwhite": "#fffaf0", "forestgreen": "#228b22",
    "fuchsia": "#ff00ff", "gainsboro": "#dcdcdc", "ghostwhite": "#f8f8ff",
    "gold": "#ffd700", "goldenrod": "#daa520", "gray": "#808080",
    "green": "#008000", "greenyellow": "#adff2f", "grey": "#808080",
    "honeydew": "#f0fff0", "hotpink": "#ff69b4", "indianred": "#cd5c5c",
    "indigo": "#4b0082", "ivory": "#fffff0", "khaki": "#f0e68c",
    "lavender": "#e6e6fa", "lavenderblush": "#fff0f5", "lawngreen": "#7cfc00",
    "lemonchiffon": "#fffacd", "lightblue": "#add8e6", "lightcoral": "#f08080",
    "lightcyan": "#e0ffff", "lightgoldenrodyellow": "#fafad2", "lightgray": "#d3d3d3",
    "lightgreen": "#90ee90", "lightgrey": "#d3d3d3", "lightpink": "#ffb6c1",
    "lightsalmon": "#ffa07a", "lightseagreen": "#20b2aa", "lightskyblue": "#87cefa",
    "lightslategray": "#778899", "lightslategrey": "#778899", "lightsteelblue": "#b0c4de",
    "lightyellow": "#ffffe0", "lime": "#00ff00", "limegreen": "#32cd32",
    "linen": "#faf0e6", "magenta": "#ff00ff", "maroon": "#800000",
    "mediumaquamarine": "#66cdaa", "mediumblue": "#0000cd", "mediumorchid": "#ba55d3",
    "mediumpurple": "#9370db", "mediumseagreen": "#3cb371", "mediumslateblue": "#7b68ee",
    "mediumspringgreen": "#00fa9a", "mediumturquoise": "#48d1cc", "mediumvioletred": "#c71585",
    "midnightblue": "#191970", "mintcream": "#f5fffa", "mistyrose": "#ffe4e1",
    "moccasin": "#ffe4b5", "navajowhite": "#ffdead", "navy": "#000080",
    "oldlace": "#fdf5e6", "olive": "#808000", "olivedrab": "#6b8e23",
    "orange": "#ffa500", "orangered": "#ff4500", "orchid": "#da70d6",
    "palegoldenrod": "#eee8aa", "palegreen": "#98fb98", "paleturquoise": "#afeeee",
    "palevioletred": "#db7093", "papayawhip": "#ffefd5", "peachpuff": "#ffdab9",
    "peru": "#cd853f", "pink": "#ffc0cb", "plum": "#dda0dd",
    "powderblue": "#b0e0e6", "purple": "#800080", "red": "#ff0000",
    "rosybrown": "#bc8f8f", "royalblue": "#4169e1", "saddlebrown": "#8b4513",
    "salmon": "#fa8072", "sandybrown": "#f4a460", "seagreen": "#2e8b57",
    "seashell": "#fff5ee", "sienna": "#a0522d", "silver": "#c0c0c0",
    "skyblue": "#87ceeb", "slateblue": "#6a5acd", "slategray": "#708090",
    "slategrey": "#708090", "snow": "#fffafa", "springgreen": "#00ff7f",
    "steelblue": "#4682b4", "tan": "#d2b48c", "teal": "#008080",
    "thistle": "#d8bfd8", "tomato": "#ff6347", "turquoise": "#40e0d0",
    "violet": "#ee82ee", "wheat": "#f5deb3", "white": "#ffffff",
    "whitesmoke": "#f5f5f5", "yellow": "#ffff00", "yellowgreen": "#9acd32",
}

COLOR_NAMES: list[str] = list(NAMES.keys())

BLACK = "#000000"
WHITE = "#ffffff"

_HEX_COLOR_RE = re.compile(r"^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$")
_RGB_COLOR_RE = re.compile(r"^(?:|rgb)\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\)$")

_TRAIL_ZEROS_1 = re.compile(r"\.0+$")
_TRAIL_ZEROS_2 = re.compile(r"(\.\d*[^0])0+$")


def _format_number(value: float, precision: int = 2) -> str:
    """Port of `app.common.data/format-number` (fixed precision, trailing zeros stripped)."""
    s = f"{float(value):.{precision}f}"
    s = _TRAIL_ZEROS_1.sub("", s)
    s = _TRAIL_ZEROS_2.sub(r"\1", s)
    return s


def valid_hex_color(color: object) -> bool:
    return isinstance(color, str) and _HEX_COLOR_RE.match(color) is not None


def parse_rgb(color: str) -> Optional[list[int]]:
    match = _RGB_COLOR_RE.match(color)
    if match is None:
        return None
    r, g, b = (int(match.group(i)) for i in (1, 2, 3))
    if 0 <= r <= 255 and 0 <= g <= 255 and 0 <= b <= 255:
        return [r, g, b]
    return None


def valid_rgb_color(color: object) -> bool:
    return isinstance(color, str) and parse_rgb(color) is not None


def _normalize_hex(color: str) -> str:
    if len(color) == 4:  # of the form #RGB
        color = re.sub(r"^#(.)(.)(.)$", r"#\1\1\2\2\3\3", color)
    return color.lower()


def rgb_to_str(rgb: tuple[int, int, int] | tuple[int, int, int, float]) -> str:
    if len(rgb) == 4:
        r, g, b, a = rgb
        return f"rgba({r},{g},{b},{a})"
    r, g, b = rgb
    return f"rgb({r},{g},{b})"


def rgb_to_hsv(rgb: tuple[float, float, float]) -> list[float]:
    """Note: `val` (the 3rd return element) is the raw 0-255 channel value, not normalized."""
    red, green, blue = rgb
    mx = max(red, green, blue)
    mn = min(red, green, blue)
    val = mx
    if mn == mx:
        return [0, 0, val]
    delta = mx - mn
    sat = delta / mx
    if red == mx:
        hue = (green - blue) / delta
    elif green == mx:
        hue = 2 + (blue - red) / delta
    else:
        hue = 4 + (red - green) / delta
    hue *= 60
    if hue < 0:
        hue += 360
    if hue > 360:
        hue -= 360
    return [hue, sat, val]


def hsv_to_rgb(hsv: tuple[float, float, float]) -> list[int]:
    h, s, brightness = hsv
    if s == 0:
        return [int(brightness), int(brightness), int(brightness)]
    sextant = int(math.floor(h / 60))
    remainder = (h / 60) - sextant
    brightness = brightness if brightness is not None else 0
    val1 = int(brightness * (1 - s))
    val2 = int(brightness * (1 - (s * remainder)))
    val3 = int(brightness * (1 - (s * (1 - remainder))))
    b = int(brightness)
    if sextant == 1:
        return [val2, b, val1]
    if sextant == 2:
        return [val1, b, val3]
    if sextant == 3:
        return [val1, val2, b]
    if sextant == 4:
        return [val3, val1, b]
    if sextant == 5:
        return [b, val1, val2]
    if sextant == 6:
        return [b, val3, val1]
    return [b, val3, val1]  # sextant == 0 (and any other fallthrough, as upstream)


def hex_to_rgb(color: str) -> list[int]:
    try:
        rgb = int(color[1:], 16)
        r = rgb >> 16
        g = (rgb >> 8) & 255
        b = rgb & 255
        return [r, g, b]
    except (ValueError, IndexError):
        return [0, 0, 0]


def hex_to_lum(color: str) -> float:
    r, g, b = hex_to_rgb(color)
    return math.sqrt((0.241 * r) + (0.691 * g) + (0.068 * b))


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    r, g, b = (int(c) for c in rgb)
    if r != (r & 255) or g != (g & 255) or b != (b & 255):
        raise ValueError(f"not valid rgb: r={r} g={g} b={b}")
    rgb_int = (r << 16) | (g << 8) | b
    if r < 16:
        # force a leading-zero digit that plain hex formatting would drop
        return "#" + format(rgb_int | 0x1000000, "x")[1:]
    return "#" + format(rgb_int, "x")


def rgb_to_hsl(rgb: tuple[int, int, int]) -> list[float]:
    r, g, b = rgb
    norm_r, norm_g, norm_b = r / 255.0, g / 255.0, b / 255.0
    mx = max(norm_r, norm_g, norm_b)
    mn = min(norm_r, norm_g, norm_b)
    l = (mx + mn) / 2.0
    if mx == mn:
        h = 0.0
    elif mx == norm_r:
        h = 60 * ((norm_g - norm_b) / (mx - mn))
    elif mx == norm_g:
        h = 120 + 60 * ((norm_b - norm_r) / (mx - mn))
    else:
        h = 240 + 60 * ((norm_r - norm_g) / (mx - mn))
    if l > 0 and l <= 0.5:
        s = (mx - mn) / (2 * l) if l != 0 else 0.0
    else:
        s = (mx - mn) / (2 - (2 * l)) if (2 - 2 * l) != 0 else 0.0
    return [(h + 360) % 360, s, l]


def hex_to_hsv(color: str) -> list[float]:
    return rgb_to_hsv(tuple(hex_to_rgb(color)))


def hex_to_rgba(color: str, opacity: float) -> list[float]:
    return [*hex_to_rgb(color), opacity]


def hex_to_hsl(color: str) -> list[float]:
    return rgb_to_hsl(tuple(hex_to_rgb(color)))


def hex_to_hsla(color: str, opacity: float) -> list[float]:
    return [*hex_to_hsl(color), opacity]


def format_hsla(hsla: tuple[float, float, float, float]) -> str:
    h, s, l, a = hsla
    rounded_h = int(h)
    rounded_s = _format_number(100 * s, 2)
    rounded_l = _format_number(100 * l, 2)
    rounded_a = _format_number(a, 2)
    return f"{rounded_h} {rounded_s}% {rounded_l}% / {rounded_a}"


def format_rgba(rgba: tuple[int, int, int, float]) -> str:
    r, g, b, a = rgba
    rounded_a = _format_number(a, 2)
    return f"{r}, {g}, {b}, {rounded_a}"


def _hue_to_rgb(v1: float, v2: float, vh: float) -> float:
    if vh < 0:
        vh += 1
    elif vh > 1:
        vh -= 1
    if 6 * vh < 1:
        return v1 + (v2 - v1) * 6 * vh
    if 2 * vh < 1:
        return v2
    if 3 * vh < 2:
        return v1 + (v2 - v1) * ((2 / 3) - vh) * 6
    return v1


def hsl_to_rgb(hsl: tuple[float, float, float]) -> list[int]:
    h, s, l = hsl
    if s == 0:
        o = l * 255
        return [round(o), round(o), round(o)]
    norm_h = h / 360.0
    temp2 = l * (1 + s) if l < 0.5 else (l + s) - (s * l)
    temp1 = (l * 2) - temp2
    return [
        round(255 * _hue_to_rgb(temp1, temp2, norm_h + (1 / 3))),
        round(255 * _hue_to_rgb(temp1, temp2, norm_h)),
        round(255 * _hue_to_rgb(temp1, temp2, norm_h - (1 / 3))),
    ]


def hsl_to_hex(hsl: tuple[float, float, float]) -> str:
    return rgb_to_hex(tuple(hsl_to_rgb(hsl)))


def hsl_to_hsv(hsl: tuple[float, float, float]) -> list[float]:
    return rgb_to_hsv(tuple(hsl_to_rgb(hsl)))


def hsv_to_hex(hsv: tuple[float, float, float]) -> str:
    return rgb_to_hex(tuple(hsv_to_rgb(hsv)))


def hsv_to_hsl(hsv: tuple[float, float, float]) -> list[float]:
    return hex_to_hsl(hsv_to_hex(hsv))


def expand_hex(v: str) -> str:
    if re.fullmatch(r"[0-9A-Fa-f]", v):
        return v * 6
    if re.fullmatch(r"[0-9A-Fa-f]{2}", v):
        return v * 3
    if re.fullmatch(r"[0-9A-Fa-f]{3}", v):
        a, b, c = v[0], v[1], v[2]
        return a + a + b + b + c + c
    return v


def prepend_hash(color: str) -> str:
    return color if color.startswith("#") else "#" + color


def remove_hash(color: str) -> str:
    return color[1:] if color.startswith("#") else color


def color_string(color: object) -> bool:
    return isinstance(color, str) and (
        valid_hex_color(color) or valid_rgb_color(color) or color in NAMES
    )


def parse(color: object) -> Optional[str]:
    if not isinstance(color, str):
        return None
    if valid_hex_color(color) or valid_hex_color("#" + color):
        return _normalize_hex(color if color.startswith("#") else "#" + color)
    rgb = parse_rgb(color)
    if rgb is not None:
        return rgb_to_hex(tuple(rgb))
    return NAMES.get(color.lower())


EMPTY_COLOR: dict[str, None] = {
    "color": None, "id": None, "file-id": None, "gradient": None, "opacity": None,
}


def next_rgb(rgb: tuple[int, int, int]) -> list[int]:
    """Given an rgb triple, returns the next color in (r,g,b) increment order."""
    r, g, b = rgb
    if r == 255 and g == 255 and b == 255:
        raise ValueError(f"cannot get next color: r={r} g={g} b={b}")
    if g == 255 and b == 255:
        return [r + 1, 0, 0]
    if b == 255:
        return [r, g + 1, 0]
    return [r, g, b + 1]


def reduce_range(value: float, value_range: float) -> float:
    return math.floor(value * value_range) / value_range


def sort_key(color_record: dict) -> float:
    """Sort key equivalent to the original `sort-colors` comparator.

    `color_record` is a dict with a `"color"` key (a hex string), matching the
    shape `sort-colors` expected -- use as `sorted(records, key=sort_key)`.
    """
    h, _s, v = hex_to_hsv(color_record["color"])
    reduced_h = reduce_range(h / 60, 8)
    norm_v = v / 255
    return (reduced_h * 100) + (norm_v * 10)
