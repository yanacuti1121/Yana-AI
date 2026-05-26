#!/usr/bin/env python3
"""
YAMTAM Router Suggest — look up which model tier to use for a given task.
Usage: yamtam router suggest --task <task_type>
       yamtam router suggest --list
"""

import json
import os
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print("Error: PyYAML is required. Run: pip install pyyaml", file=sys.stderr)
    sys.exit(3)

# ── ANSI ─────────────────────────────────────────────────────────────────────

RESET  = "\033[0m"
BOLD   = "\033[1m"
DIM    = "\033[2m"
CYAN   = "\033[36m"
GREEN  = "\033[32m"
YELLOW = "\033[33m"
RED    = "\033[31m"

TIER_COLOR = {
    "offline":  DIM,
    "fast":     GREEN,
    "standard": CYAN,
    "strong":   YELLOW,
}


def c(color: str, text: str, no_color: bool = False) -> str:
    return text if no_color else f"{color}{text}{RESET}"


# ── Policy loader ─────────────────────────────────────────────────────────────

def load_policy(policy_path: str | None = None) -> dict:
    if policy_path is None:
        script_dir = Path(__file__).resolve().parent
        policy_path = str(script_dir.parent.parent / "router" / "model-routing-policy.yml")
    with open(policy_path) as f:
        return yaml.safe_load(f)


# ── Suggest ───────────────────────────────────────────────────────────────────

def suggest(task: str, policy: dict, no_color: bool = False, output_json: bool = False) -> int:
    tasks = policy.get("tasks", [])
    tiers = policy.get("tiers", {})
    fallback = policy.get("fallback", {})

    match = next((t for t in tasks if t["task"] == task), None)
    if not match:
        # fuzzy: find task names containing the query
        candidates = [t for t in tasks if task.lower() in t["task"].lower()]
        if not candidates:
            all_tasks = [t["task"] for t in tasks]
            if output_json:
                print(json.dumps({"error": f"unknown task: {task}", "available": all_tasks}))
            else:
                print(f"Unknown task: '{task}'", file=sys.stderr)
                print(f"Available: {', '.join(all_tasks)}", file=sys.stderr)
            return 1
        if len(candidates) == 1:
            match = candidates[0]
        else:
            names = [t["task"] for t in candidates]
            if output_json:
                print(json.dumps({"error": f"ambiguous task: {task}", "matches": names}))
            else:
                print(f"Ambiguous task '{task}' — did you mean: {', '.join(names)}?", file=sys.stderr)
            return 1

    tier_name = match["tier"]
    tier_info = tiers.get(tier_name, {})
    fallback_info = fallback.get(tier_name, {})

    result = {
        "task":               match["task"],
        "tier":               tier_name,
        "model":              tier_info.get("model"),
        "reason":             match.get("reason", ""),
        "require_human_gate": match.get("require_human_gate", False),
        "fallback_on_error":  fallback_info.get("on_error"),
        "max_retries":        fallback_info.get("max_retries", 0),
    }

    if output_json:
        print(json.dumps(result, indent=2))
        return 0

    nc = no_color
    tier_col = TIER_COLOR.get(tier_name, "")
    gate_note = c(RED, "  ⚠  require_human_gate: true", nc) if result["require_human_gate"] else ""

    print()
    print(c(CYAN + BOLD, f"  Task:     {result['task']}", nc))
    print(c(tier_col + BOLD, f"  Tier:     {tier_name}", nc), end="")
    model_str = f"  ({result['model']})" if result["model"] else ""
    print(c(DIM, model_str, nc))
    print(f"  Reason:   {result['reason']}")
    if result["fallback_on_error"]:
        print(c(DIM, f"  Fallback: {result['fallback_on_error']} on error (max {result['max_retries']} retries)", nc))
    if gate_note:
        print(gate_note)
    print()
    return 0


def list_tasks(policy: dict, no_color: bool = False, output_json: bool = False) -> int:
    tasks = policy.get("tasks", [])
    tiers = policy.get("tiers", {})

    if output_json:
        print(json.dumps(tasks, indent=2))
        return 0

    nc = no_color
    print()
    print(c(CYAN + BOLD, "  YAMTAM Model Routing — Task Table", nc))
    print(c(DIM, "  " + "─" * 60, nc))
    print(f"  {'TASK':<35} {'TIER':<10} {'MODEL'}", )
    print(c(DIM, "  " + "─" * 60, nc))

    for t in tasks:
        tier_name = t["tier"]
        tier_col = TIER_COLOR.get(tier_name, "")
        model = (tiers.get(tier_name) or {}).get("model") or "—"
        gate = " ⚠" if t.get("require_human_gate") else ""
        print(f"  {t['task']:<35} {c(tier_col + BOLD, tier_name, nc):<20} {c(DIM, model, nc)}{gate}")

    print()
    print(c(DIM, "  ⚠ = require_human_gate: true", nc))
    print()
    return 0


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        prog="yamtam router suggest",
        description="Look up the recommended model tier for a task type.",
    )
    parser.add_argument("--task", metavar="TASK",
                        help="Task type to look up (e.g. pr_review, security_audit)")
    parser.add_argument("--list", action="store_true",
                        help="List all tasks and their assigned tiers")
    parser.add_argument("--policy", metavar="FILE",
                        help="Path to model-routing-policy.yml (default: router/)")
    parser.add_argument("--no-color", action="store_true")
    parser.add_argument("--json", action="store_true", dest="output_json",
                        help="Output as JSON")
    args = parser.parse_args()

    if not args.task and not args.list:
        parser.print_help()
        sys.exit(0)

    try:
        policy = load_policy(args.policy)
    except FileNotFoundError:
        print("Error: model-routing-policy.yml not found. Expected at router/model-routing-policy.yml", file=sys.stderr)
        sys.exit(3)

    if args.list:
        sys.exit(list_tasks(policy, no_color=args.no_color, output_json=args.output_json))
    else:
        sys.exit(suggest(args.task, policy, no_color=args.no_color, output_json=args.output_json))


if __name__ == "__main__":
    main()
