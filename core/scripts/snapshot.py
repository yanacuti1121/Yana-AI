#!/usr/bin/env python3
"""yamtam snapshot — save or restore full audit state."""

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime

REPO_ROOT  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCANNER_PY = os.path.join(REPO_ROOT, "core/scripts/audit_scanner.py")

BOLD  = "\033[1m"; GREEN = "\033[32m"; YELLOW = "\033[33m"
RED   = "\033[31m"; CYAN  = "\033[36m"; DIM   = "\033[2m"; RESET = "\033[0m"
RISK_COLOR = {"CRITICAL": RED, "HIGH": RED, "MEDIUM": YELLOW, "LOW": GREEN}

def no_color():
    return os.environ.get("YAMTAM_NO_COLOR") or not sys.stdout.isatty()

def c(code, text):
    return text if no_color() else f"{code}{text}{RESET}"

def snapshots_dir(target: str) -> str:
    return os.path.join(target, ".yamtam", "snapshots")

def snapshot_path(target: str, name: str) -> str:
    if not name.endswith(".json"):
        name += ".json"
    return os.path.join(snapshots_dir(target), name)


def cmd_save(target: str, name: str, extra: list[str], note: str):
    r = subprocess.run([sys.executable, SCANNER_PY, target, "--json"] + extra,
                       capture_output=True, text=True)
    try:
        data = json.loads(r.stdout)
    except Exception:
        print(c(RED, "  ✗ Audit scan failed")); sys.exit(1)

    snap = {
        "yamtam_snapshot": True,
        "version": "1",
        "name": name,
        "note": note,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "target": os.path.abspath(target),
        "audit": data,
    }

    os.makedirs(snapshots_dir(target), exist_ok=True)
    path = snapshot_path(target, name)
    with open(path, "w") as f:
        json.dump(snap, f, indent=2)

    score = data.get("score", 0)
    risk  = data.get("risk_level", "?")
    rc    = RISK_COLOR.get(risk, "")
    print()
    print(c(GREEN, f"  ✓ Snapshot saved: {name}"))
    print(f"  Score: {c(BOLD+rc, f'{score}/100 {risk}')}  ·  {len(data.get('findings',[]))} findings")
    print(c(DIM, f"  Path: {path}"))
    print()


def cmd_list(target: str):
    sdir = snapshots_dir(target)
    print()
    print(c(BOLD, "  Snapshots"))
    print()
    if not os.path.exists(sdir):
        print(c(DIM, "  No snapshots yet. Run: yamtam snapshot save [name]"))
        print(); return

    files = sorted(f for f in os.listdir(sdir) if f.endswith(".json"))
    if not files:
        print(c(DIM, "  No snapshots yet.")); print(); return

    print(f"  {'NAME':<25} {'DATE':<20} {'SCORE':<8} {'RISK'}")
    print(f"  {'─'*60}")
    for fn in files:
        try:
            with open(os.path.join(sdir, fn)) as f:
                snap = json.load(f)
            name   = snap.get("name", fn.replace(".json",""))
            ts     = snap.get("created_at","")[:16].replace("T"," ")
            audit  = snap.get("audit", {})
            score  = audit.get("score", "?")
            risk   = audit.get("risk_level", "?")
            rc     = RISK_COLOR.get(risk, "")
            note   = snap.get("note","")
            print(f"  {c(CYAN, name):<34} {c(DIM, ts):<20} {c(BOLD+rc, str(score)):<17} {c(rc, risk)}"
                  + (f"  {c(DIM, note)}" if note else ""))
        except Exception:
            print(f"  {fn}  (unreadable)")
    print()


def cmd_show(target: str, name: str):
    path = snapshot_path(target, name)
    if not os.path.exists(path):
        print(c(RED, f"  ✗ Snapshot '{name}' not found")); sys.exit(1)
    with open(path) as f:
        snap = json.load(f)
    print(json.dumps(snap.get("audit", snap), indent=2))


def cmd_diff(target: str, name_a: str, name_b: str):
    """Compare two snapshots."""
    diff_py = os.path.join(REPO_ROOT, "core/scripts/diff_report.py")
    path_a  = snapshot_path(target, name_a)
    path_b  = snapshot_path(target, name_b)

    for name, path in [(name_a, path_a), (name_b, path_b)]:
        if not os.path.exists(path):
            print(c(RED, f"  ✗ Snapshot '{name}' not found")); sys.exit(1)

    # Extract audit JSON to temp files
    import tempfile
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as ta:
        with open(path_a) as f: snap_a = json.load(f)
        json.dump(snap_a.get("audit", snap_a), ta)
        ta_path = ta.name
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as tb:
        with open(path_b) as f: snap_b = json.load(f)
        json.dump(snap_b.get("audit", snap_b), tb)
        tb_path = tb.name

    r = subprocess.run([sys.executable, diff_py, ta_path, tb_path])
    os.unlink(ta_path); os.unlink(tb_path)
    sys.exit(r.returncode)


def cmd_delete(target: str, name: str):
    path = snapshot_path(target, name)
    if not os.path.exists(path):
        print(c(RED, f"  ✗ Snapshot '{name}' not found")); sys.exit(1)
    os.remove(path)
    print(c(GREEN, f"  ✓ Deleted snapshot: {name}"))


def main():
    parser = argparse.ArgumentParser(prog="yamtam snapshot",
                                     description="Save and manage audit snapshots")
    sub = parser.add_subparsers(dest="subcmd")

    # save
    p_save = sub.add_parser("save",   help="Save current audit as snapshot")
    p_save.add_argument("name",       nargs="?", default=None)
    p_save.add_argument("--target",   default=".")
    p_save.add_argument("--note",     default="")
    p_save.add_argument("--ignore",   metavar="ID", action="append", default=[])

    # list
    p_list = sub.add_parser("list",   help="List all snapshots")
    p_list.add_argument("--target",   default=".")

    # show
    p_show = sub.add_parser("show",   help="Print snapshot audit JSON")
    p_show.add_argument("name")
    p_show.add_argument("--target",   default=".")

    # diff
    p_diff = sub.add_parser("diff",   help="Compare two snapshots")
    p_diff.add_argument("name_a")
    p_diff.add_argument("name_b")
    p_diff.add_argument("--target",   default=".")

    # delete
    p_del = sub.add_parser("delete",  help="Delete a snapshot")
    p_del.add_argument("name")
    p_del.add_argument("--target",    default=".")

    # bare: yamtam snapshot [name] (= save)
    parser.add_argument("name_bare",  nargs="?", help=argparse.SUPPRESS)
    parser.add_argument("--target",   default=".")
    parser.add_argument("--note",     default="")
    parser.add_argument("--ignore",   metavar="ID", action="append", default=[])

    args = parser.parse_args()

    if args.subcmd == "save" or (not args.subcmd and args.name_bare):
        name   = (args.name if args.subcmd else args.name_bare) or \
                 datetime.now().strftime("%Y%m%d-%H%M%S")
        target = args.target if args.subcmd else args.target
        extra  = []
        for ig in (args.ignore if args.subcmd else args.ignore):
            extra += ["--ignore", ig]
        cmd_save(target, name, extra, args.note if args.subcmd else args.note)
    elif args.subcmd == "list"   or (not args.subcmd and not args.name_bare):
        cmd_list(args.target)
    elif args.subcmd == "show":   cmd_show(args.target,  args.name)
    elif args.subcmd == "diff":   cmd_diff(args.target,  args.name_a, args.name_b)
    elif args.subcmd == "delete": cmd_delete(args.target, args.name)
    else:
        cmd_list(args.target)


if __name__ == "__main__":
    main()
