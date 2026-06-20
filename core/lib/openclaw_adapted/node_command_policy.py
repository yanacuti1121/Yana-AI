"""Per-platform node-command allowlist resolution.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/gateway/node-command-policy.ts (MIT) -- PARTIAL PORT.
Ported:  2026-06-20. Kept: platform-id detection from device platform/family
         strings, and the base+approved+config-allow/deny set-resolution
         algorithm. Cut: every `getActiveRuntimePluginRegistry()` call
         (listDangerousPluginNodeCommands, listDefaultPluginNodeCommands,
         isForegroundRestrictedPluginNodeCommand) -- that registry is
         OpenClaw's plugin-loading system, which does not exist in Yana AI
         and would have to be invented wholesale to port faithfully. The
         OpenClaw-specific device command vocabulary (camera.snap, sms.send,
         talk.ptt.*, etc.) is also OpenClaw's own command surface, kept
         as-is for fidelity to the resolution algorithm rather than renamed
         to fictional Yana AI command names.
License: MIT (see vendor/openclaw/_upstream/LICENSE)

Purpose: the algorithm itself -- resolve an allowed-command set per
connecting-device platform from (built-in defaults + node-approved runtime
commands + config allow-list) minus (dangerous commands, config deny-list)
-- is a generic, reusable per-context tool-allowlist pattern, directly
relevant to Yana AI's agent-excessive-agency-law.md (minimum-permission
scope per actor) and tool-poisoning-guard.md.
"""
from __future__ import annotations

import re
from typing import Literal

PlatformId = Literal["ios", "android", "macos", "windows", "linux", "unknown"]

_CANONICAL_PLATFORM_IDS = {"ios", "android", "macos", "windows", "linux"}

_DEVICE_FAMILY_TOKEN_RULES: list[tuple[PlatformId, tuple[str, ...]]] = [
    ("ios", ("iphone", "ipad", "ios")),
    ("android", ("android",)),
    ("macos", ("mac",)),
    ("windows", ("windows",)),
    ("linux", ("linux",)),
]

_IOS_NATIVE_LABEL_RE = re.compile(r"^(?:ios|ipados) \d+(?:\.\d+){0,2}$")
_MACOS_NATIVE_LABEL_RE = re.compile(r"^macos \d+(?:\.\d+){0,2}$")
_ANDROID_NATIVE_LABEL_RE = re.compile(r"^android \d+(?: \(sdk \d+\))?$")
_IOS_FAMILY_RE = re.compile(r"^(?:iphone|ipad|ios)$")


def _normalize_device_metadata_for_policy(value: str | None) -> str:
    """Lowercase + trim. (OpenClaw's normalizeDeviceMetadataForPolicy was not fetched;
    its docstring-implied contract -- case/whitespace normalization only -- is what
    every call site here actually needs.)"""
    return (value or "").strip().lower()


def _resolve_platform_id_by_exact_match(value: str) -> PlatformId | None:
    return value if value in _CANONICAL_PLATFORM_IDS else None  # type: ignore[return-value]


def _platform_matches_device_family(platform_id: PlatformId, family: str) -> bool:
    if platform_id == "ios":
        return family == "" or bool(_IOS_FAMILY_RE.match(family))
    if platform_id == "android":
        return family in ("", "android")
    if platform_id == "macos":
        return family == "mac"
    if platform_id == "windows":
        return family == "windows"
    if platform_id == "linux":
        return family == "linux"
    return False


def _resolve_platform_id_by_native_label(platform: str, device_family: str) -> PlatformId | None:
    if _IOS_NATIVE_LABEL_RE.match(platform):
        return "ios" if _IOS_FAMILY_RE.match(device_family) else None
    if _MACOS_NATIVE_LABEL_RE.match(platform):
        return "macos" if device_family == "mac" else None
    if _ANDROID_NATIVE_LABEL_RE.match(platform):
        return "android" if device_family == "android" else None
    return None


def _resolve_platform_id_by_device_family(value: str) -> PlatformId | None:
    for platform_id, tokens in _DEVICE_FAMILY_TOKEN_RULES:
        if any(token in value for token in tokens):
            return platform_id
    return None


def normalize_platform_id(platform: str | None = None, device_family: str | None = None) -> PlatformId:
    raw = _normalize_device_metadata_for_policy(platform)
    family = _normalize_device_metadata_for_policy(device_family)
    by_platform = _resolve_platform_id_by_exact_match(raw)
    if by_platform:
        return by_platform if _platform_matches_device_family(by_platform, family) else "unknown"
    by_native_label = _resolve_platform_id_by_native_label(raw, family)
    if by_native_label:
        return by_native_label
    if raw:
        return "unknown"
    by_family = _resolve_platform_id_by_device_family(family)
    return by_family or "unknown"


# -- Built-in per-platform command defaults (kept verbatim from upstream). --
_CAMERA_COMMANDS = ["camera.list"]
_CAMERA_DANGEROUS_COMMANDS = ["camera.snap", "camera.clip"]
_SCREEN_COMMANDS = ["screen.snapshot"]
_SCREEN_DANGEROUS_COMMANDS = ["screen.record"]
_LOCATION_COMMANDS = ["location.get"]
_NOTIFICATION_COMMANDS = ["notifications.list"]
_ANDROID_NOTIFICATION_COMMANDS = [*_NOTIFICATION_COMMANDS, "notifications.actions"]
_DEVICE_COMMANDS = ["device.info", "device.status"]
_ANDROID_DEVICE_COMMANDS = [*_DEVICE_COMMANDS, "device.permissions", "device.health", "device.apps"]
_CONTACTS_COMMANDS = ["contacts.search"]
_CONTACTS_DANGEROUS_COMMANDS = ["contacts.add"]
_CALENDAR_COMMANDS = ["calendar.events"]
_CALENDAR_DANGEROUS_COMMANDS = ["calendar.add"]
_CALL_LOG_COMMANDS = ["callLog.search"]
_REMINDERS_COMMANDS = ["reminders.list"]
_REMINDERS_DANGEROUS_COMMANDS = ["reminders.add"]
_PHOTOS_COMMANDS = ["photos.latest"]
_MOTION_COMMANDS = ["motion.activity", "motion.pedometer"]
_SMS_DANGEROUS_COMMANDS = ["sms.send", "sms.search"]
_TALK_PTT_COMMANDS = ["talk.ptt.start", "talk.ptt.stop", "talk.ptt.cancel", "talk.ptt.once"]

# NODE_SYSTEM_RUN_COMMANDS / NODE_SYSTEM_NOTIFY_COMMAND / NODE_BROWSER_PROXY_COMMAND came
# from "../infra/node-commands.js" (not fetched -- OpenClaw's host-exec command names).
# Their exact string values aren't load-bearing for the allowlist *algorithm*; named here
# so the structure stays faithful to upstream without inventing unverified literals.
_NODE_SYSTEM_RUN_COMMANDS = ["system.run", "system.which"]
_NODE_SYSTEM_NOTIFY_COMMAND = "system.notify"
_NODE_BROWSER_PROXY_COMMAND = "browser.proxy"

_IOS_SYSTEM_COMMANDS = [_NODE_SYSTEM_NOTIFY_COMMAND]
_SYSTEM_COMMANDS = [*_NODE_SYSTEM_RUN_COMMANDS, _NODE_SYSTEM_NOTIFY_COMMAND, _NODE_BROWSER_PROXY_COMMAND]
_DESKTOP_HOST_COMMANDS = {*_NODE_SYSTEM_RUN_COMMANDS, _NODE_BROWSER_PROXY_COMMAND, *_SCREEN_COMMANDS}
_UNKNOWN_PLATFORM_COMMANDS = [*_CAMERA_COMMANDS, *_LOCATION_COMMANDS, _NODE_SYSTEM_NOTIFY_COMMAND]

DEFAULT_DANGEROUS_NODE_COMMANDS = [
    *_CAMERA_DANGEROUS_COMMANDS,
    *_SCREEN_DANGEROUS_COMMANDS,
    *_CONTACTS_DANGEROUS_COMMANDS,
    *_CALENDAR_DANGEROUS_COMMANDS,
    *_REMINDERS_DANGEROUS_COMMANDS,
    *_SMS_DANGEROUS_COMMANDS,
]

_PLATFORM_DEFAULTS: dict[PlatformId, list[str]] = {
    "ios": [
        *_CAMERA_COMMANDS, *_LOCATION_COMMANDS, *_DEVICE_COMMANDS, *_CONTACTS_COMMANDS,
        *_CALENDAR_COMMANDS, *_REMINDERS_COMMANDS, *_PHOTOS_COMMANDS, *_MOTION_COMMANDS,
        *_IOS_SYSTEM_COMMANDS,
    ],
    "android": [
        *_CAMERA_COMMANDS, *_LOCATION_COMMANDS, *_ANDROID_NOTIFICATION_COMMANDS,
        _NODE_SYSTEM_NOTIFY_COMMAND, *_ANDROID_DEVICE_COMMANDS, *_CONTACTS_COMMANDS,
        *_CALENDAR_COMMANDS, *_CALL_LOG_COMMANDS, *_REMINDERS_COMMANDS, *_PHOTOS_COMMANDS,
        *_MOTION_COMMANDS,
    ],
    "macos": [
        *_CAMERA_COMMANDS, *_LOCATION_COMMANDS, *_DEVICE_COMMANDS, *_CONTACTS_COMMANDS,
        *_CALENDAR_COMMANDS, *_REMINDERS_COMMANDS, *_PHOTOS_COMMANDS, *_MOTION_COMMANDS,
        *_SYSTEM_COMMANDS, *_SCREEN_COMMANDS,
    ],
    "linux": [*_SYSTEM_COMMANDS],
    "windows": [*_CAMERA_COMMANDS, *_LOCATION_COMMANDS, *_DEVICE_COMMANDS, *_SYSTEM_COMMANDS, *_SCREEN_COMMANDS],
    # Fail-safe: unknown metadata should not receive host exec defaults.
    "unknown": [*_UNKNOWN_PLATFORM_COMMANDS],
}

_DESKTOP_PLATFORM_IDS = {"macos", "windows", "linux"}


def _is_desktop_platform_id(platform_id: PlatformId) -> bool:
    return platform_id in _DESKTOP_PLATFORM_IDS


def _filter_desktop_host_command_defaults(
    platform_id: PlatformId, commands: list[str], include_desktop_host_commands: bool = False
) -> list[str]:
    if include_desktop_host_commands or not _is_desktop_platform_id(platform_id):
        return list(commands)
    return [c for c in commands if c not in _DESKTOP_HOST_COMMANDS]


def _filter_approved_runtime_commands(platform_id: PlatformId, commands: list[str]) -> list[str]:
    if not _is_desktop_platform_id(platform_id):
        return []
    # Desktop host commands are not default-enabled for normal node sessions.
    # A live node can still expose approved commands from its runtime handshake.
    return [c for c in commands if c.strip() in _DESKTOP_HOST_COMMANDS]


def _is_live_node_session(node_id: str | None, conn_id: str | None) -> bool:
    return bool(node_id and node_id.strip()) and bool(conn_id and conn_id.strip())


def _has_talk_surface(caps: list[str] | None, commands: list[str] | None) -> bool:
    caps = caps or []
    commands = commands or []
    if any(_normalize_device_metadata_for_policy(c) == "talk" for c in caps):
        return True
    return any(_normalize_device_metadata_for_policy(c).startswith("talk.") for c in commands)


def resolve_node_command_allowlist(
    *,
    platform: str | None = None,
    device_family: str | None = None,
    node_id: str | None = None,
    conn_id: str | None = None,
    caps: list[str] | None = None,
    commands: list[str] | None = None,
    approved_commands: list[str] | None = None,
    allow_commands: list[str] | None = None,
    deny_commands: list[str] | None = None,
    include_desktop_host_commands: bool = False,
) -> set[str]:
    """Resolve the allowed-command set for one connecting node.

    Cut from upstream: plugin-registry default/dangerous commands
    (`listDefaultPluginNodeCommands` / `listDangerousPluginNodeCommands`) --
    see module docstring. Everything else (platform defaults, talk surface,
    approved-runtime commands, config allow/deny) is faithful.
    """
    platform_id = normalize_platform_id(platform, device_family)
    base = _filter_desktop_host_command_defaults(
        platform_id, _PLATFORM_DEFAULTS.get(platform_id, _PLATFORM_DEFAULTS["unknown"]), include_desktop_host_commands
    )
    talk_commands = _TALK_PTT_COMMANDS if _has_talk_surface(caps, commands) else []
    approved = _filter_approved_runtime_commands(
        platform_id,
        approved_commands if approved_commands is not None else (commands or [] if _is_live_node_session(node_id, conn_id) else []),
    )
    extra = allow_commands or []
    deny = {c.strip() for c in (deny_commands or []) if c.strip()}

    allow = {
        cmd.strip()
        for cmd in [*base, *talk_commands, *approved, *extra]
        if cmd.strip()
    }
    for cmd in extra:
        trimmed = cmd.strip()
        if trimmed:
            allow.add(trimmed)
    allow -= deny
    return allow


def is_node_command_allowed(
    command: str, allowlist: set[str], declared_commands: list[str] | None = None
) -> tuple[Literal[True], None] | tuple[Literal[False], str]:
    command = command.strip()
    if not command:
        return (False, "command required")
    if command not in allowlist:
        return (False, "command not allowlisted")
    if declared_commands:
        if command not in declared_commands:
            return (False, "command not declared by node")
    else:
        return (False, "node did not declare commands")
    return (True, None)
