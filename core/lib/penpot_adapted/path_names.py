"""Manipulate slash-separated hierarchical entity names (e.g. "Group / Subgroup / Name").

Origin:  penpot/penpot, common/src/app/common/path_names.cljc
         (MPL-2.0) -- https://github.com/penpot/penpot. Provided as a
         source zip snapshot (docs/penpot-develop.zip), not a pinned git
         fetch -- no exact commit SHA available; zip extraction timestamp
         2026-06-19 cited instead.
Ported:  2026-06-20. Direct translation of the path-string utilities
         (split/join/compact/inside-path/etc). The source file's tree-building
         section (`sort-by-children`, `group-by-first-segment`,
         `sort-and-group-segments`, `build-tree-node`, `build-tree-root`) was
         deliberately NOT ported: its grouping recursion relies on subtle
         Clojure-specific behavior (segments whose `:name` is mutated in
         place as they're grouped, leaf/branch disambiguation by whether a
         name-rewrite happened) that is high-risk to mistranslate silently,
         and it exists specifically to feed Penpot's assets-panel tree
         widget -- not a generically reusable algorithm independent of that
         UI. The string utilities below have no such coupling.
License: MPL-2.0 (see vendor/penpot/_upstream/LICENSE)

Purpose: parsing/recombining/truncating "Group / Subgroup / Name"-style paths
is a recurring need for any tree-like naming scheme (file paths, breadcrumb
UI, namespaced skill/rule IDs) -- this is a dependency-free building block
for that, independent of Penpot's specific assets-panel use of it.
"""
from __future__ import annotations


def split_path(path_str: str, separator: str = "/") -> list[str]:
    """Decompose 'one / two / three' into ['one', 'two', 'three'], trimming spaces."""
    return [part.strip() for part in path_str.split(separator) if part.strip() != ""]


def join_path(path: list[str], separator: str = "/", with_spaces: bool = True) -> str:
    """Regenerate a path as a string, from a list. Inverse of `split_path`."""
    joiner = f" {separator} " if with_spaces else separator
    return joiner.join(path)


def split_group_name(
    path_str: str, separator: str = "/", with_spaces: bool = True
) -> tuple[str, str]:
    """Parse a path string into (group_str, name), e.g. 'group / subgroup / name' -> ('group / subgroup', 'name')."""
    path = split_path(path_str, separator)
    group_str = join_path(path[:-1], separator, with_spaces)
    name = path[-1] if path else ""
    return group_str, name


def join_path_with_dot(path: list[str]) -> str:
    return " • ".join(path)


def clean_path(path: str) -> str:
    """Remove empty items from the path."""
    return join_path(split_path(path))


def merge_path_item(path: str, name: str) -> str:
    """Put `name` at the end of `path`."""
    if path:
        return f"{path} / {name}" if name else path
    return name


def merge_path_item_with_dot(path: str, name: str) -> str:
    if path:
        return f"{path} • {name}" if name else path
    return name


def compact_path(path: str, max_length: int, dot: bool) -> tuple[str, str, bool]:
    """Separate the last path item, truncating the rest with '...' if too long.

        'one'                          -> ('', 'one', False)
        'one / two / three'            -> ('one / two', 'three', False)
        'one / two / three / four'     -> ('one / two / ...', 'four', True)
    """
    path_split = split_path(path)
    last_item = path_split[-1] if path_split else None
    merge = merge_path_item_with_dot if dot else merge_path_item

    other_items = path_split[:-1]
    other_path = ""
    for index in range(len(other_items)):
        item = other_items[index]
        full_path = merge(merge(other_path, item), last_item)
        if len(full_path) > max_length:
            return merge(other_path, "..."), last_item, True
        other_path = merge(other_path, item)
    return other_path, last_item, False


def butlast_path(path: str) -> str:
    """Remove the last item of the path."""
    split = split_path(path)
    if len(split) == 1:
        return ""
    return join_path(split[:-1])


def butlast_path_with_dots(path: str) -> str:
    split = split_path(path)
    if len(split) == 1:
        return ""
    return join_path_with_dot(split[:-1])


def last_path(path: str) -> str:
    split = split_path(path)
    return split[-1] if split else None


def inside_path(child: str, parent: str) -> bool:
    child_path = split_path(child)
    parent_path = split_path(parent)
    return len(parent_path) <= len(child_path) and parent_path == child_path[: len(parent_path)]


def split_by_last_period(s: str) -> tuple[str, str]:
    """Split a string at the last '.', keeping the '.' on the first half."""
    last_period = s.rfind(".")
    if last_period == -1:
        return s, ""
    return s[: last_period + 1], s[last_period + 1 :]
