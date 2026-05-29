#!/usr/bin/env python3
"""yamtam config <subcommand> — manage .yamtam/config.yml

Subcommands:
  list               Show all config keys and current values
  get <key>          Print value of a key
  set <key> <value>  Set a key (persists to .yamtam/config.yml)
  reset [key]        Reset one key (or all) to defaults
  show               Pretty-print current effective config
"""

import argparse
import os
import sys

try:
    import yaml
    _HAS_YAML = True
except ImportError:
    _HAS_YAML = False

BOLD  = "\033[1m"; GREEN = "\033[32m"; RED = "\033[31m"
CYAN  = "\033[36m"; DIM  = "\033[2m";  YELLOW = "\033[33m"; RESET = "\033[0m"

DEFAULTS: dict = {
    "fail_on":     None,          # None | low | medium | high | critical
    "ignore":      [],            # list of suppressed finding IDs
    "no_color":    False,
    "quiet":       False,
    "scanner_dir": None,          # override scanner YAML directory
    "since":       None,          # default --since filter
    "open_report": False,         # auto-open HTML/PDF after report
}

DESCRIPTIONS: dict[str, str] = {
    "fail_on":     "Exit non-zero on findings at this severity or above (low/medium/high/critical)",
    "ignore":      "List of finding IDs to always suppress (e.g. [AC001, CI003])",
    "no_color":    "Disable ANSI color output (true/false)",
    "quiet":       "Only print score + risk level (true/false)",
    "scanner_dir": "Override scanner YAML directory (path string or null)",
    "since":       "Only scan files modified since this date/period (e.g. 2026-05-01, '7 days ago')",
    "open_report": "Auto-open report in browser after generating (true/false)",
}

VALID_VALUES: dict[str, list] = {
    "fail_on": [None, "low", "medium", "high", "critical"],
    "no_color": [True, False, "true", "false"],
    "quiet":    [True, False, "true", "false"],
    "open_report": [True, False, "true", "false"],
}


def no_color_env():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color_env() else f"{code}{text}{RESET}"


def config_path(target: str) -> str:
    return os.path.join(os.path.abspath(target), ".yamtam", "config.yml")


def load_config(target: str) -> dict:
    path = config_path(target)
    if not os.path.exists(path):
        return dict(DEFAULTS)
    if not _HAS_YAML:
        print(c(RED, "  ✗ PyYAML not installed — pip install PyYAML"), file=sys.stderr)
        sys.exit(3)
    with open(path) as f:
        data = yaml.safe_load(f) or {}
    merged = dict(DEFAULTS)
    merged.update({k: v for k, v in data.items() if k in DEFAULTS})
    return merged


def save_config(target: str, cfg: dict) -> None:
    path = config_path(target)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not _HAS_YAML:
        print(c(RED, "  ✗ PyYAML not installed — pip install PyYAML"), file=sys.stderr)
        sys.exit(3)
    # Only save keys that differ from defaults
    to_save = {k: v for k, v in cfg.items() if v != DEFAULTS.get(k)}
    with open(path, "w") as f:
        yaml.safe_dump(to_save, f, default_flow_style=False, sort_keys=True)


def coerce(key: str, raw: str):
    """Coerce string CLI value to appropriate Python type."""
    if key in ("no_color", "quiet", "open_report"):
        if raw.lower() in ("true", "1", "yes"):
            return True
        if raw.lower() in ("false", "0", "no"):
            return False
        raise ValueError(f"Expected true/false, got {raw!r}")
    if key == "fail_on":
        if raw.lower() == "null" or raw == "":
            return None
        if raw.lower() not in ("low", "medium", "high", "critical"):
            raise ValueError(f"Expected low/medium/high/critical or null, got {raw!r}")
        return raw.lower()
    if key == "ignore":
        # Accept comma-separated IDs or JSON array
        if raw.startswith("["):
            import json
            return json.loads(raw)
        return [x.strip() for x in raw.split(",") if x.strip()]
    return raw  # scanner_dir, since → string as-is


def cmd_list(cfg: dict, path: str) -> None:
    print()
    print(c(BOLD, "  yamtam config"))
    print(c(DIM, f"  {path}"))
    print()
    for key, default in DEFAULTS.items():
        val = cfg.get(key, default)
        is_default = val == default
        val_str = c(DIM, str(val)) if is_default else c(CYAN, str(val))
        suffix = c(DIM, "  (default)") if is_default else ""
        print(f"  {c(BOLD, key):<22} {val_str}{suffix}")
    print()


def cmd_get(cfg: dict, key: str) -> None:
    if key not in DEFAULTS:
        print(c(RED, f"  ✗ Unknown key: {key!r}. Run 'yamtam config list' to see all keys."),
              file=sys.stderr)
        sys.exit(1)
    val = cfg.get(key, DEFAULTS[key])
    print(val if val is not None else "null")


def cmd_set(cfg: dict, key: str, raw: str, target: str) -> None:
    if key not in DEFAULTS:
        print(c(RED, f"  ✗ Unknown key: {key!r}"), file=sys.stderr)
        sys.exit(1)
    try:
        val = coerce(key, raw)
    except ValueError as e:
        print(c(RED, f"  ✗ Invalid value: {e}"), file=sys.stderr)
        sys.exit(1)
    old = cfg.get(key, DEFAULTS[key])
    cfg[key] = val
    save_config(target, cfg)
    print(c(GREEN, f"  ✓ {key}: {old!r} → {val!r}"))


def cmd_reset(cfg: dict, key_or_all: str | None, target: str) -> None:
    if key_or_all is None:
        cfg.update(dict(DEFAULTS))
        save_config(target, cfg)
        print(c(GREEN, "  ✓ All config keys reset to defaults."))
    else:
        if key_or_all not in DEFAULTS:
            print(c(RED, f"  ✗ Unknown key: {key_or_all!r}"), file=sys.stderr)
            sys.exit(1)
        cfg[key_or_all] = DEFAULTS[key_or_all]
        save_config(target, cfg)
        print(c(GREEN, f"  ✓ {key_or_all} reset to default: {DEFAULTS[key_or_all]!r}"))


def cmd_show(cfg: dict, path: str) -> None:
    print()
    print(c(BOLD, "  Effective config"))
    print(c(DIM, f"  Source: {path if os.path.exists(path) else 'defaults only'}"))
    print()
    for key in DEFAULTS:
        val = cfg.get(key, DEFAULTS[key])
        desc = DESCRIPTIONS.get(key, "")
        print(f"  {c(BOLD, key)}")
        print(f"    value : {c(CYAN, str(val))}")
        print(f"    desc  : {c(DIM, desc)}")
    print()


def main():
    parser = argparse.ArgumentParser(
        prog="yamtam config",
        description="Manage .yamtam/config.yml project configuration",
    )
    parser.add_argument("subcommand", nargs="?", default="list",
                        choices=["list", "get", "set", "reset", "show"],
                        help="Subcommand (default: list)")
    parser.add_argument("args", nargs="*", help="Subcommand arguments")
    parser.add_argument("--target", default=".",
                        help="Project directory (default: .)")
    opts = parser.parse_args()

    target = opts.target
    path   = config_path(target)
    cfg    = load_config(target)

    sub = opts.subcommand
    rest = opts.args

    if sub == "list":
        cmd_list(cfg, path)

    elif sub == "show":
        cmd_show(cfg, path)

    elif sub == "get":
        if not rest:
            parser.error("'get' requires a key argument")
        cmd_get(cfg, rest[0])

    elif sub == "set":
        if len(rest) < 2:
            parser.error("'set' requires <key> <value>")
        cmd_set(cfg, rest[0], rest[1], target)

    elif sub == "reset":
        cmd_reset(cfg, rest[0] if rest else None, target)


if __name__ == "__main__":
    main()
