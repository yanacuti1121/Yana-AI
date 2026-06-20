"""Tests for the penpot_adapted batch (color conversion + path-name utils).

Origin: core/lib/penpot_adapted/*.py
        (ported from penpot/penpot, MPL-2.0)
"""
import pytest

from core.lib.penpot_adapted import colors as c
from core.lib.penpot_adapted import path_names as p


# -- colors: hex/rgb round trips --


def test_hex_to_rgb_and_back():
    assert c.hex_to_rgb("#ff0000") == [255, 0, 0]
    assert c.rgb_to_hex((255, 0, 0)) == "#ff0000"


def test_rgb_to_hex_leading_zero_quirk():
    # r < 16 needs the leading-zero padding trick to keep 6 hex digits
    assert c.rgb_to_hex((5, 0, 0)) == "#050000"


def test_rgb_to_hex_rejects_out_of_range():
    with pytest.raises(ValueError):
        c.rgb_to_hex((256, 0, 0))


def test_hex_to_rgb_invalid_input_returns_black():
    assert c.hex_to_rgb("#zzzzzz") == [0, 0, 0]
    assert c.hex_to_rgb("") == [0, 0, 0]


# -- colors: hsv/hsl round trips --


def test_rgb_hsv_round_trip_for_red():
    hsv = c.rgb_to_hsv((255, 0, 0))
    assert hsv == [0.0, 1.0, 255]
    assert c.hsv_to_rgb(hsv) == [255, 0, 0]


def test_rgb_hsl_round_trip_for_red():
    hsl = c.rgb_to_hsl((255, 0, 0))
    assert hsl == pytest.approx([0.0, 1.0, 0.5])
    assert c.hsl_to_rgb(hsl) == [255, 0, 0]


def test_hsv_to_rgb_grey_when_saturation_zero():
    assert c.hsv_to_rgb((0, 0, 128)) == [128, 128, 128]


# -- colors: parsing / validation --


def test_valid_hex_color():
    assert c.valid_hex_color("#fff") is True
    assert c.valid_hex_color("#ffffff") is True
    assert c.valid_hex_color("not-a-color") is False
    assert c.valid_hex_color(None) is False


def test_valid_rgb_color():
    assert c.valid_rgb_color("rgb(1,2,3)") is True
    assert c.valid_rgb_color("(1, 2, 3)") is True
    assert c.valid_rgb_color("rgb(1,2,300)") is False


def test_parse_named_color():
    assert c.parse("red") == "#ff0000"


def test_parse_short_hex_expands_and_normalizes():
    assert c.parse("#ABC") == "#aabbcc"


def test_parse_rgb_string():
    assert c.parse("rgb(255, 0, 0)") == "#ff0000"


def test_parse_unrecognized_returns_none():
    assert c.parse("not a color") is None
    assert c.parse(123) is None


def test_color_string_predicate():
    assert c.color_string("#fff") is True
    assert c.color_string("red") is True
    assert c.color_string("nonsense") is False


# -- colors: misc utilities --


def test_expand_hex():
    assert c.expand_hex("a") == "aaaaaa"
    assert c.expand_hex("ab") == "ababab"
    assert c.expand_hex("abc") == "aabbcc"
    assert c.expand_hex("already-six-chars") == "already-six-chars"


def test_prepend_and_remove_hash():
    assert c.prepend_hash("fff") == "#fff"
    assert c.prepend_hash("#fff") == "#fff"
    assert c.remove_hash("#fff") == "fff"
    assert c.remove_hash("fff") == "fff"


def test_next_rgb_increments_blue_then_green_then_red():
    assert c.next_rgb((0, 0, 0)) == [0, 0, 1]
    assert c.next_rgb((0, 0, 255)) == [0, 1, 0]
    assert c.next_rgb((0, 255, 255)) == [1, 0, 0]


def test_next_rgb_raises_at_white():
    with pytest.raises(ValueError):
        c.next_rgb((255, 255, 255))


def test_format_hsla_strips_trailing_zeros():
    assert c.format_hsla([12.0123, 0.5, 0.5, 1]) == "12 50% 50% / 1"


def test_format_rgba():
    assert c.format_rgba([255, 0, 0, 0.5]) == "255, 0, 0, 0.5"


def test_hex_to_lum_white_is_max():
    import math

    assert c.hex_to_lum("#ffffff") == pytest.approx(math.sqrt(255))


def test_sort_key_orders_by_hue_then_value():
    records = [{"color": "#0000ff"}, {"color": "#ff0000"}, {"color": "#00ff00"}]
    ordered = sorted(records, key=c.sort_key)
    assert [r["color"] for r in ordered] == ["#ff0000", "#00ff00", "#0000ff"]


# -- path_names --


def test_split_and_join_path_round_trip():
    parts = p.split_path("one / two / three")
    assert parts == ["one", "two", "three"]
    assert p.join_path(parts) == "one / two / three"


def test_split_group_name():
    assert p.split_group_name("group / subgroup / name") == ("group / subgroup", "name")


def test_split_group_name_single_segment():
    assert p.split_group_name("name") == ("", "name")


def test_clean_path_removes_empty_segments():
    assert p.clean_path("one //  / two") == "one / two"


def test_merge_path_item():
    assert p.merge_path_item("one", "two") == "one / two"
    assert p.merge_path_item("", "two") == "two"
    assert p.merge_path_item("one", "") == "one"


def test_compact_path_short_path_untruncated():
    assert p.compact_path("one / two / three", 100, False) == ("one / two", "three", False)


def test_compact_path_truncates_when_too_long():
    other, last, truncated = p.compact_path("one-item-but-very-long / two", 10, False)
    assert truncated is True
    assert last == "two"
    assert other == "..."


def test_butlast_path():
    assert p.butlast_path("one / two / three") == "one / two"
    assert p.butlast_path("one") == ""


def test_last_path():
    assert p.last_path("one / two / three") == "three"


def test_inside_path():
    assert p.inside_path("one / two / three", "one / two") is True
    assert p.inside_path("one / two", "one / two / three") is False
    assert p.inside_path("one / two", "one / two") is True


def test_split_by_last_period():
    assert p.split_by_last_period("file.name.txt") == ("file.name.", "txt")
    assert p.split_by_last_period("noext") == ("noext", "")
