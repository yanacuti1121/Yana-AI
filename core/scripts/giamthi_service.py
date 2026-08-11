#!/usr/bin/env python3
"""Manage the OS-level Yana Giám thị supervisor for one project."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import plistlib
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path


INTERVAL_SECONDS = 21_600


def canonical_target(value: str | os.PathLike[str]) -> Path:
    return Path(value).expanduser().resolve()


def target_id(target: Path) -> str:
    return hashlib.sha256(os.fsencode(str(target))).hexdigest()[:8]


def service_id(target: Path) -> str:
    return f"com.yanaai.giamthi-watch.{target_id(target)}"


def watch_script(target: Path) -> Path:
    return target / ".claude" / "scripts" / "giamthi-watch.sh"


def state_dir(target: Path) -> Path:
    return target / ".claude" / "state"


def macos_protected_path(target: Path, home: Path) -> bool:
    protected_roots = (home / "Desktop", home / "Documents", home / "Downloads")
    return any(target == root or root in target.parents for root in protected_roots)


def bash_executable() -> str | None:
    candidates = [
        shutil.which("bash"),
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files\Git\usr\bin\bash.exe",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return str(Path(candidate).resolve())
    return None


def run_command(command: list[str], *, dry_run: bool) -> subprocess.CompletedProcess[str]:
    if dry_run:
        print("would run:", subprocess.list2cmdline(command))
        return subprocess.CompletedProcess(command, 0, "", "")
    try:
        return subprocess.run(command, capture_output=True, text=True, check=False)
    except OSError as error:
        return subprocess.CompletedProcess(command, 127, "", str(error))


def command_state(command: list[str], ready: str, unavailable: str) -> str:
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=False)
    except OSError:
        return "service-manager-unavailable"
    return ready if result.returncode == 0 else unavailable


def launchd_result(output: str) -> tuple[bool, int | None]:
    stopped = "state = not running" in output or "job state = exited" in output
    exit_code = None
    for line in output.splitlines():
        stripped = line.strip()
        if stripped.startswith("last exit code ="):
            try:
                exit_code = int(stripped.split("=", 1)[1].strip())
            except ValueError:
                exit_code = None
    return stopped, exit_code


def launchd_state(identifier: str) -> str:
    try:
        result = subprocess.run(
            ["launchctl", "print", f"gui/{os.getuid()}/{identifier}"],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return "service-manager-unavailable"
    if result.returncode != 0:
        return "not-loaded"
    _stopped, exit_code = launchd_result(result.stdout)
    if exit_code not in (None, 0):
        return f"failed:{exit_code}"
    return "loaded"


def wait_for_launchd_run(identifier: str, log: Path, timeout: float = 15.0) -> None:
    deadline = time.monotonic() + timeout
    domain = f"gui/{os.getuid()}"
    last_output = ""
    while time.monotonic() < deadline:
        result = run_command(["launchctl", "print", f"{domain}/{identifier}"], dry_run=False)
        last_output = result.stdout
        stopped, exit_code = launchd_result(last_output)
        if stopped and exit_code is not None:
            if exit_code == 0:
                return
            detail = log.read_text(encoding="utf-8", errors="replace").strip() if log.is_file() else ""
            if exit_code == 126 and "Operation not permitted" in detail:
                raise RuntimeError(
                    "macOS denied LaunchAgent access to this project (exit 126). "
                    "Desktop/Documents are TCC-protected for background jobs. Move the checkout to "
                    "an unprotected path such as ~/Projects, or grant the supervisor executable Full Disk Access."
                )
            raise RuntimeError(f"LaunchAgent watcher exited {exit_code}: {detail or 'no log output'}")
        time.sleep(0.25)
    raise RuntimeError(f"timed out waiting for LaunchAgent run: {last_output[-500:]}")


def require_success(result: subprocess.CompletedProcess[str], action: str) -> None:
    if result.returncode == 0:
        return
    detail = (result.stderr or result.stdout or "no diagnostic output").strip()
    raise RuntimeError(f"{action} failed (exit {result.returncode}): {detail}")


@dataclass(frozen=True)
class ServicePaths:
    platform: str
    service_id: str
    primary: Path
    secondary: Path | None = None


def service_paths(target: Path, home: Path, platform: str) -> ServicePaths:
    identifier = service_id(target)
    if platform == "darwin":
        return ServicePaths(platform, identifier, home / "Library" / "LaunchAgents" / f"{identifier}.plist")
    if platform.startswith("linux"):
        unit = f"yana-giamthi-{target_id(target)}"
        directory = home / ".config" / "systemd" / "user"
        return ServicePaths(platform, unit, directory / f"{unit}.timer", directory / f"{unit}.service")
    if platform == "win32":
        return ServicePaths(platform, f"YanaAI-GiamThi-{target_id(target)}", home / ".yana-ai" / "giamthi" / f"{target_id(target)}.json")
    raise RuntimeError(f"unsupported platform: {platform}")


def launchd_payload(target: Path, bash: str) -> dict[str, object]:
    log = state_dir(target) / "giamthi-runner.log"
    return {
        "Label": service_id(target),
        "ProgramArguments": [bash, str(watch_script(target))],
        "RunAtLoad": True,
        "StartInterval": INTERVAL_SECONDS,
        "StandardOutPath": str(log),
        "StandardErrorPath": str(log),
        "WorkingDirectory": str(target),
    }


def _systemd_quote(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def systemd_service(target: Path, bash: str) -> str:
    return "\n".join(
        [
            "[Unit]",
            f"Description=Yana Giám thị supervisor for {target}",
            "After=default.target",
            "",
            "[Service]",
            "Type=oneshot",
            f"WorkingDirectory={_systemd_quote(str(target))}",
            f"ExecStart={_systemd_quote(bash)} {_systemd_quote(str(watch_script(target)))}",
            "NoNewPrivileges=true",
            "PrivateTmp=true",
            "ProtectSystem=strict",
            f"ReadWritePaths={_systemd_quote(str(state_dir(target)))}",
            "",
        ]
    )


def systemd_timer(identifier: str) -> str:
    return "\n".join(
        [
            "[Unit]",
            "Description=Schedule Yana Giám thị supervisor",
            "",
            "[Timer]",
            "OnBootSec=2min",
            "OnUnitActiveSec=6h",
            "Persistent=true",
            f"Unit={identifier}.service",
            "",
            "[Install]",
            "WantedBy=timers.target",
            "",
        ]
    )


def windows_action(target: Path, bash: str) -> str:
    return subprocess.list2cmdline([bash, str(watch_script(target))])


def validate_target(target: Path) -> str:
    script = watch_script(target)
    if not script.is_file():
        raise RuntimeError(
            f"watcher missing: {script}. Run `yana-ai install {target}` before installing the supervisor."
        )
    bash = bash_executable()
    if not bash:
        raise RuntimeError(
            "bash is required by giamthi-watch.sh. Install bash (Git for Windows on Windows) and retry."
        )
    return bash


def install(
    target: Path,
    home: Path,
    platform: str,
    *,
    dry_run: bool,
    allow_protected_path: bool = False,
) -> ServicePaths:
    if platform == "darwin" and macos_protected_path(target, home) and not allow_protected_path:
        raise RuntimeError(
            "macOS background access is restricted for Desktop/Documents/Downloads. "
            "Move the checkout under ~/Projects, or grant Full Disk Access and retry with "
            "--allow-protected-path."
        )
    bash = validate_target(target)
    paths = service_paths(target, home, platform)
    if not dry_run:
        state_dir(target).mkdir(parents=True, exist_ok=True)

    if platform == "darwin":
        if not dry_run:
            paths.primary.parent.mkdir(parents=True, exist_ok=True)
        if not dry_run:
            paths.primary.write_bytes(plistlib.dumps(launchd_payload(target, bash), sort_keys=False))
        domain = f"gui/{os.getuid()}"
        run_command(["launchctl", "bootout", domain, str(paths.primary)], dry_run=dry_run)
        result = run_command(["launchctl", "bootstrap", domain, str(paths.primary)], dry_run=dry_run)
        require_success(result, "launchctl bootstrap")
        result = run_command(["launchctl", "kickstart", "-k", f"{domain}/{paths.service_id}"], dry_run=dry_run)
        require_success(result, "launchctl kickstart")
        if not dry_run:
            try:
                wait_for_launchd_run(paths.service_id, state_dir(target) / "giamthi-runner.log")
            except RuntimeError:
                run_command(["launchctl", "bootout", domain, str(paths.primary)], dry_run=False)
                raise
    elif platform.startswith("linux"):
        assert paths.secondary is not None
        if not dry_run:
            paths.primary.parent.mkdir(parents=True, exist_ok=True)
        if not dry_run:
            paths.secondary.write_text(systemd_service(target, bash), encoding="utf-8")
            paths.primary.write_text(systemd_timer(paths.service_id), encoding="utf-8")
        require_success(run_command(["systemctl", "--user", "daemon-reload"], dry_run=dry_run), "systemd daemon-reload")
        require_success(
            run_command(["systemctl", "--user", "enable", "--now", paths.primary.name], dry_run=dry_run),
            "systemd timer enable",
        )
    elif platform == "win32":
        if not dry_run:
            paths.primary.parent.mkdir(parents=True, exist_ok=True)
        metadata = {"target": str(target), "task": paths.service_id, "action": windows_action(target, bash)}
        if not dry_run:
            paths.primary.write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        command = [
            "schtasks", "/Create", "/F", "/SC", "HOURLY", "/MO", "6",
            "/TN", paths.service_id, "/TR", metadata["action"],
        ]
        require_success(run_command(command, dry_run=dry_run), "Scheduled Task creation")
        require_success(run_command(["schtasks", "/Run", "/TN", paths.service_id], dry_run=dry_run), "Scheduled Task start")
    return paths


def uninstall(target: Path, home: Path, platform: str, *, dry_run: bool) -> ServicePaths:
    paths = service_paths(target, home, platform)
    if platform == "darwin":
        domain = f"gui/{os.getuid()}"
        run_command(["launchctl", "bootout", domain, str(paths.primary)], dry_run=dry_run)
    elif platform.startswith("linux"):
        run_command(["systemctl", "--user", "disable", "--now", paths.primary.name], dry_run=dry_run)
        run_command(["systemctl", "--user", "daemon-reload"], dry_run=dry_run)
    elif platform == "win32":
        run_command(["schtasks", "/Delete", "/F", "/TN", paths.service_id], dry_run=dry_run)
    if not dry_run:
        paths.primary.unlink(missing_ok=True)
        if paths.secondary:
            paths.secondary.unlink(missing_ok=True)
    return paths


def _launchd_targets(home: Path) -> list[dict[str, str]]:
    directory = home / "Library" / "LaunchAgents"
    records = []
    for candidate in sorted(directory.glob("com.yanaai.giamthi-watch*.plist")):
        try:
            data = plistlib.loads(candidate.read_bytes())
            args = data.get("ProgramArguments", [])
            script = Path(args[1]) if len(args) > 1 else Path("")
            records.append({"path": str(candidate), "label": str(data.get("Label", "")), "target": str(script.parent.parent.parent)})
        except (OSError, plistlib.InvalidFileException, TypeError, ValueError):
            records.append({"path": str(candidate), "label": "", "target": "invalid plist"})
    return records


def status(target: Path, home: Path, platform: str) -> dict[str, object]:
    paths = service_paths(target, home, platform)
    installed = paths.primary.is_file() and (paths.secondary is None or paths.secondary.is_file())
    result: dict[str, object] = {
        "platform": platform,
        "target": str(target),
        "service_id": paths.service_id,
        "installed": installed,
        "definition": str(paths.primary),
        "watcher_exists": watch_script(target).is_file(),
        "lock_exists": (state_dir(target) / "GIAMTHI_HALT.lock").is_file(),
        "protected_path": platform == "darwin" and macos_protected_path(target, home),
    }
    heartbeat = state_dir(target) / "giamthi-heartbeat.log"
    if heartbeat.is_file():
        result["heartbeat"] = str(heartbeat)
        result["heartbeat_age_seconds"] = max(0, int(time.time() - heartbeat.stat().st_mtime))
    else:
        result["heartbeat"] = None
        result["heartbeat_age_seconds"] = None
    if platform == "darwin":
        services = _launchd_targets(home)
        result["discovered_services"] = services
        result["stale_services"] = [item for item in services if item["target"] != str(target)]
        result["runtime_state"] = launchd_state(paths.service_id)
    elif platform.startswith("linux"):
        result["runtime_state"] = command_state(
            ["systemctl", "--user", "is-enabled", paths.primary.name],
            "enabled",
            "not-enabled",
        )
    elif platform == "win32":
        result["runtime_state"] = command_state(
            ["schtasks", "/Query", "/TN", paths.service_id],
            "registered",
            "not-registered",
        )
    return result


def run_once(target: Path) -> int:
    bash = validate_target(target)
    return subprocess.run([bash, str(watch_script(target))], cwd=target, check=False).returncode


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="yana-ai giamthi", description=__doc__)
    parser.add_argument("command", choices=("install", "status", "repair", "uninstall", "run"))
    parser.add_argument("target", nargs="?", default=".")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true", dest="json_output")
    parser.add_argument(
        "--allow-protected-path",
        action="store_true",
        help="Attempt macOS install after Full Disk Access was granted",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    target = canonical_target(args.target)
    home = Path.home()
    platform = sys.platform
    try:
        if args.command in ("install", "repair"):
            paths = install(
                target,
                home,
                platform,
                dry_run=args.dry_run,
                allow_protected_path=args.allow_protected_path,
            )
            print(f"Giám thị supervisor ready: {paths.service_id}")
            print(f"Definition: {paths.primary}")
            return 0
        if args.command == "uninstall":
            paths = uninstall(target, home, platform, dry_run=args.dry_run)
            print(f"Giám thị supervisor removed: {paths.service_id}")
            print("GIAMTHI_HALT.lock and audit evidence were preserved.")
            return 0
        if args.command == "run":
            return run_once(target)
        report = status(target, home, platform)
        if args.json_output:
            print(json.dumps(report, indent=2, ensure_ascii=False))
        else:
            print(f"Target: {report['target']}")
            print(f"Supervisor: {'installed' if report['installed'] else 'not installed'}")
            print(f"Runtime: {report['runtime_state']}")
            print(f"Watcher: {'present' if report['watcher_exists'] else 'missing'}")
            print(f"HALT: {'active' if report['lock_exists'] else 'clear'}")
            if report["heartbeat_age_seconds"] is not None:
                print(f"Heartbeat age: {report['heartbeat_age_seconds']}s")
            for stale in report.get("stale_services", []):
                print(f"Warning: another Giám thị service points to {stale['target']} ({stale['path']})")
        runtime_ready = report["runtime_state"] in {"loaded", "enabled", "registered"}
        return 0 if report["installed"] and report["watcher_exists"] and runtime_ready else 1
    except RuntimeError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
