"""Contract checks for the first-party UI <-> yana-rt runtime boundary."""

from __future__ import annotations

import copy
import json
import os
import re
import unittest
from pathlib import Path

try:
    from jsonschema import Draft202012Validator, FormatChecker  # type: ignore
except ModuleNotFoundError:  # Local source checkouts may omit dev dependencies.
    Draft202012Validator = None  # type: ignore[assignment,misc]
    FormatChecker = None  # type: ignore[assignment,misc]


ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "core" / "contracts"
SCHEMA_PATHS = {
    "protocol": CONTRACTS / "runtime-protocol.schema.json",
    "runtime": CONTRACTS / "runtime-settings.schema.json",
    "ui": CONTRACTS / "ui-preferences.schema.json",
}


def load_schema(name: str) -> dict:
    return json.loads(SCHEMA_PATHS[name].read_text(encoding="utf-8"))


def validator(name: str):
    if Draft202012Validator is None or FormatChecker is None:
        return None
    return Draft202012Validator(load_schema(name), format_checker=FormatChecker())


ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
CAPABILITY_RE = re.compile(r"^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$")


def _is_int(value: object, minimum: int, maximum: int) -> bool:
    return type(value) is int and minimum <= value <= maximum


def _is_id(value: object) -> bool:
    return isinstance(value, str) and ID_RE.fullmatch(value) is not None


def _required(obj: dict, names: set[str], errors: list[str], prefix: str) -> None:
    for name in names - set(obj):
        errors.append(f"{prefix} missing {name}")


def _closed(obj: dict, names: set[str], errors: list[str], prefix: str) -> None:
    for name in set(obj) - names:
        errors.append(f"{prefix} unexpected {name}")


def _fallback_runtime(value: object) -> list[str]:
    errors: list[str] = []
    if not isinstance(value, dict):
        return ["runtime settings must be an object"]
    top = {"schemaVersion", "owner", "roots", "transport", "approvals", "featureFlags", "persistence"}
    _required(value, top, errors, "runtime")
    _closed(value, top, errors, "runtime")
    if value.get("schemaVersion") != "1.0":
        errors.append("runtime schemaVersion must be 1.0")
    if value.get("owner") != "yana-rt":
        errors.append("runtime owner must be yana-rt")

    roots = value.get("roots")
    root_names = {"installRoot", "workspaceRoot", "dataRoot"}
    if not isinstance(roots, dict):
        errors.append("roots must be an object")
    else:
        _required(roots, root_names, errors, "roots")
        _closed(roots, root_names, errors, "roots")
        for name in root_names:
            path = roots.get(name)
            if not isinstance(path, str) or not path or len(path) > 4096:
                errors.append(f"roots.{name} must be a bounded non-empty string")

    transport = value.get("transport")
    transport_names = {
        "kind", "protocol", "protocolVersion", "jsonRpcVersion", "framing", "encoding",
        "maxFrameBytes", "maxInFlightRequests", "eventWindow", "ackTimeoutMs", "shutdownGraceMs",
    }
    if not isinstance(transport, dict):
        errors.append("transport must be an object")
    else:
        _required(transport, transport_names, errors, "transport")
        _closed(transport, transport_names, errors, "transport")
        constants = {
            "kind": "private-supervised-stdio",
            "protocol": "yana.runtime",
            "protocolVersion": "1.0",
            "jsonRpcVersion": "2.0",
            "framing": "ndjson",
            "encoding": "utf-8",
        }
        for name, expected in constants.items():
            if transport.get(name) != expected:
                errors.append(f"transport.{name} must be {expected}")
        for name, minimum, maximum in (
            ("maxFrameBytes", 4096, 16777216),
            ("maxInFlightRequests", 1, 256),
            ("eventWindow", 1, 4096),
            ("ackTimeoutMs", 1000, 120000),
            ("shutdownGraceMs", 100, 30000),
        ):
            if not _is_int(transport.get(name), minimum, maximum):
                errors.append(f"transport.{name} is out of range")

    approvals = value.get("approvals")
    approval_names = {
        "authority", "handleTtlMs", "maxPending", "allowedDecisions", "persistHandles", "allowSessionGrants",
    }
    if not isinstance(approvals, dict):
        errors.append("approvals must be an object")
    else:
        _required(approvals, approval_names, errors, "approvals")
        _closed(approvals, approval_names, errors, "approvals")
        if approvals.get("authority") != "yana-rt":
            errors.append("approval authority must be yana-rt")
        if not _is_int(approvals.get("handleTtlMs"), 1000, 300000):
            errors.append("approval handle TTL is out of range")
        if not _is_int(approvals.get("maxPending"), 1, 64):
            errors.append("approval pending limit is out of range")
        if approvals.get("allowedDecisions") not in (["approve_once", "deny"], ["deny", "approve_once"]):
            errors.append("approval decisions must be approve_once and deny")
        if approvals.get("persistHandles") is not False:
            errors.append("approval handles must not persist")
        if approvals.get("allowSessionGrants") is not False:
            errors.append("session grants are not allowed in Wave 0")

    flags = value.get("featureFlags")
    if not isinstance(flags, dict) or "unifiedExperience" not in flags:
        errors.append("featureFlags.unifiedExperience is required")
    else:
        for name, flag in flags.items():
            if not re.fullmatch(r"[a-z][A-Za-z0-9]{1,63}", name):
                errors.append(f"invalid feature flag name {name}")
            if not isinstance(flag, dict):
                errors.append(f"feature flag {name} must be an object")
                continue
            names = {"stage", "rolloutPercent", "allowlistedInstallations", "killSwitch"}
            _required(flag, names, errors, f"featureFlags.{name}")
            _closed(flag, names, errors, f"featureFlags.{name}")
            stage = flag.get("stage")
            percent = flag.get("rolloutPercent")
            if stage not in {"off", "shadow", "canary", "on"}:
                errors.append(f"featureFlags.{name}.stage is invalid")
            if not _is_int(percent, 0, 100):
                errors.append(f"featureFlags.{name}.rolloutPercent is out of range")
            if stage == "off" and percent != 0:
                errors.append(f"featureFlags.{name} off requires zero rollout")
            if stage == "on" and percent != 100:
                errors.append(f"featureFlags.{name} on requires full rollout")
            allowlist = flag.get("allowlistedInstallations")
            if not isinstance(allowlist, list) or len(allowlist) > 1024 or any(not _is_id(item) for item in allowlist):
                errors.append(f"featureFlags.{name}.allowlistedInstallations is invalid")
            if type(flag.get("killSwitch")) is not bool:
                errors.append(f"featureFlags.{name}.killSwitch must be boolean")

    persistence = value.get("persistence")
    persistence_names = {"operationJournal", "operationRetentionDays", "eventRetentionDays", "crashMarkers"}
    if not isinstance(persistence, dict):
        errors.append("persistence must be an object")
    else:
        _required(persistence, persistence_names, errors, "persistence")
        _closed(persistence, persistence_names, errors, "persistence")
        if persistence.get("operationJournal") is not True or persistence.get("crashMarkers") is not True:
            errors.append("operation journal and crash markers must be enabled")
        for name in ("operationRetentionDays", "eventRetentionDays"):
            if not _is_int(persistence.get(name), 1, 365):
                errors.append(f"persistence.{name} is out of range")
    return errors


def _fallback_ui(value: object) -> list[str]:
    errors: list[str] = []
    if not isinstance(value, dict):
        return ["UI preferences must be an object"]
    top = {"schemaVersion", "owner", "appearance", "interaction", "layout", "accessibility", "notifications"}
    _required(value, {"schemaVersion", "owner"}, errors, "ui")
    _closed(value, top, errors, "ui")
    if value.get("schemaVersion") != "1.0" or value.get("owner") != "yana-ui":
        errors.append("UI schema version/owner is invalid")

    appearance = value.get("appearance", {})
    appearance_names = {
        "theme", "accent", "brandBlue", "brandPink", "brandGreen", "glowIntensity", "fontScale",
        "surfaceOpacity", "motifVisibility", "layout", "reduceMotion", "contrastBoost", "chatFont",
        "showAgents", "showMissions", "showMemory", "showSystem",
    }
    if not isinstance(appearance, dict):
        errors.append("appearance must be an object")
    else:
        _closed(appearance, appearance_names, errors, "appearance")
        for name, minimum, maximum in (
            ("brandBlue", 0, 100), ("brandPink", 0, 100), ("brandGreen", 0, 100),
            ("glowIntensity", 0, 100), ("fontScale", 90, 125), ("surfaceOpacity", 70, 100),
        ):
            if name in appearance and not _is_int(appearance[name], minimum, maximum):
                errors.append(f"appearance.{name} is out of range")
        channels = [appearance.get(name) for name in ("brandBlue", "brandPink", "brandGreen")]
        if all(type(item) is int for item in channels) and sum(channels) != 100:
            errors.append("brand colour balance must total 100")
        if "motifVisibility" in appearance and appearance["motifVisibility"] not in {"Off", "Subtle", "Visible"}:
            errors.append("motifVisibility is invalid")
        if "layout" in appearance and appearance["layout"] not in {"Compact", "Regular", "Spacious"}:
            errors.append("presentation layout is invalid")
        if "chatFont" in appearance and appearance["chatFont"] not in {"System", "Be Vietnam", "Mono"}:
            errors.append("chatFont is invalid")
        for name in ("reduceMotion", "contrastBoost", "showAgents", "showMissions", "showMemory", "showSystem"):
            if name in appearance and type(appearance[name]) is not bool:
                errors.append(f"appearance.{name} must be boolean")
        accent = appearance.get("accent")
        if accent is not None and (not isinstance(accent, str) or re.fullmatch(r"(?:#[0-9A-Fa-f]{6})?", accent) is None):
            errors.append("appearance.accent must be empty or #RRGGBB")

    closed_groups = {
        "interaction": {"sendOnEnter", "autoScrollStreaming", "confirmBeforeWindowClose", "copyCodeWithFormatting"},
        "layout": {"sidebarCollapsed", "sidebarWidthPx", "detailsPanelCollapsed", "terminalHeightPx"},
        "accessibility": {"screenReaderAnnouncements", "locale"},
        "notifications": {"desktop", "sound", "showCompletionToast"},
    }
    for group_name, allowed in closed_groups.items():
        group = value.get(group_name, {})
        if not isinstance(group, dict):
            errors.append(f"{group_name} must be an object")
        else:
            _closed(group, allowed, errors, group_name)
    return errors


def _fallback_meta(value: object, sender: str, *, initialize: bool = False, null_session: bool = False) -> list[str]:
    errors: list[str] = []
    if not isinstance(value, dict):
        return ["yana metadata must be an object"]
    required = {"protocol", "protocolVersion", "sessionId", "sequence", "sender"}
    allowed = required | {"traceId", "causationId"}
    _required(value, required, errors, "yana")
    _closed(value, allowed, errors, "yana")
    if value.get("protocol") != "yana.runtime" or value.get("protocolVersion") != "1.0":
        errors.append("invalid protocol metadata")
    if value.get("sender") != sender:
        errors.append("metadata sender mismatch")
    if initialize:
        if value.get("sequence") != 1:
            errors.append("initialize sequence must be one")
    elif not _is_int(value.get("sequence"), 2, 9007199254740991):
        errors.append("active sequence is invalid")
    session = value.get("sessionId")
    if null_session:
        if session is not None:
            errors.append("client may not choose initialize session ID")
    elif not _is_id(session):
        errors.append("runtime session ID is invalid")
    return errors


def _fallback_protocol(value: object) -> list[str]:
    errors: list[str] = []
    if not isinstance(value, dict):
        return ["protocol frame must be one object; batches are forbidden"]
    if value.get("jsonrpc") != "2.0":
        errors.append("jsonrpc must be 2.0")

    if "method" in value:
        method = value.get("method")
        notifications = {"runtime.initialized", "runtime.ack", "runtime.event"}
        requests = {"runtime.initialize", "runtime.call", "runtime.operation.get", "runtime.cancel", "runtime.approval.resolve"}
        if method not in notifications | requests:
            return errors + ["unknown runtime method"]
        expected = {"jsonrpc", "method", "params", "yana"} | ({"id"} if method in requests else set())
        _required(value, expected, errors, "frame")
        _closed(value, expected, errors, "frame")
        if method in requests and not _is_id(value.get("id")):
            errors.append("request ID is invalid")
        params = value.get("params")
        if not isinstance(params, dict):
            return errors + ["params must be an object"]

        if method == "runtime.initialize":
            errors.extend(_fallback_meta(value.get("yana"), "client", initialize=True, null_session=True))
            _required(params, {"client", "protocolVersions", "capabilities"}, errors, "initialize params")
            _closed(params, {"client", "protocolVersions", "capabilities", "workspaceHint"}, errors, "initialize params")
            versions = params.get("protocolVersions")
            if not isinstance(versions, list) or "1.0" not in versions:
                errors.append("initialize has no supported protocol version")
            client = params.get("client")
            if not isinstance(client, dict) or not _is_id(client.get("instanceId")):
                errors.append("initialize client identity is invalid")
        elif method != "runtime.event":
            errors.extend(_fallback_meta(value.get("yana"), "client"))
        if method == "runtime.cancel":
            targets = [name for name in ("requestId", "operationId") if name in params]
            if len(targets) != 1:
                errors.append("cancel requires exactly one valid target")
            elif not _is_id(params.get(targets[0])):
                errors.append("cancel requires exactly one valid target")
        elif method == "runtime.approval.resolve":
            if not _is_id(params.get("handle")) or params.get("decision") not in {"approve_once", "deny"}:
                errors.append("approval resolution is invalid")
        elif method == "runtime.ack":
            if not _is_int(params.get("throughSequence"), 1, 9007199254740991):
                errors.append("ack sequence is invalid")
        elif method == "runtime.event":
            errors.extend(_fallback_meta(value.get("yana"), "runtime"))
            event_names = {"id", "ts", "from", "to", "type", "payload", "reply_to"}
            _required(params, event_names, errors, "BusEvent")
            _closed(params, event_names, errors, "BusEvent")
            if not _is_id(params.get("id")) or not CAPABILITY_RE.fullmatch(str(params.get("type", ""))):
                errors.append("BusEvent identity/type is invalid")
            if params.get("reply_to") is not None and not _is_id(params.get("reply_to")):
                errors.append("BusEvent reply_to is invalid")
        elif method == "runtime.operation.get" and not _is_id(params.get("operationId")):
            errors.append("operation query ID is invalid")
        return errors

    if "result" in value:
        expected = {"jsonrpc", "id", "result", "yana"}
        _required(value, expected, errors, "response")
        _closed(value, expected, errors, "response")
        if not _is_id(value.get("id")):
            errors.append("response ID is invalid")
        result = value.get("result")
        if not isinstance(result, dict):
            return errors + ["result must be an object"]
        result_type = result.get("type")
        if result_type == "runtime.initialize.result":
            errors.extend(_fallback_meta(value.get("yana"), "runtime", initialize=True))
            if result.get("protocolVersion") != "1.0" or not _is_id(result.get("sessionId")):
                errors.append("initialize result is invalid")
            roots = result.get("roots")
            if not isinstance(roots, dict) or any(not roots.get(name) for name in ("installRoot", "workspaceRoot", "dataRoot")):
                errors.append("initialize roots are invalid")
            limits = result.get("limits")
            if not isinstance(limits, dict) or not _is_int(limits.get("eventWindow"), 1, 4096):
                errors.append("initialize flow-control limits are invalid")
        else:
            errors.extend(_fallback_meta(value.get("yana"), "runtime"))
        if result_type == "runtime.call.result":
            status = result.get("status")
            if not _is_id(result.get("operationId")) or status not in {"completed", "failed", "cancelled", "approval_required", "unknown"}:
                errors.append("call result is invalid")
            if status == "completed" and "output" not in result:
                errors.append("completed call has no output")
            if status in {"failed", "unknown"} and not isinstance(result.get("failure"), dict):
                errors.append("failed/unknown call has no failure")
            if status == "approval_required":
                approval = result.get("approval")
                if not isinstance(approval, dict) or not _is_id(approval.get("handle")):
                    errors.append("approval challenge handle is not opaque")
        elif result_type == "runtime.cancel.result":
            if result.get("status") not in {"accepted", "already_terminal", "not_cancellable", "not_found"}:
                errors.append("cancel result status is invalid")
        elif result_type == "runtime.approval.resolve.result":
            if result.get("status") not in {"accepted", "expired", "invalid", "already_resolved"}:
                errors.append("approval result status is invalid")
        elif result_type != "runtime.initialize.result":
            errors.append("unknown result type")
        return errors

    if "error" in value:
        expected = {"jsonrpc", "id", "error", "yana"}
        _required(value, expected, errors, "error response")
        _closed(value, expected, errors, "error response")
        error = value.get("error")
        codes = {-32700, -32600, -32601, -32602, -32603, -32000, -32001, -32002, -32003, -32004, -32005, -32006, -32011, -32012, -32013}
        if not isinstance(error, dict) or error.get("code") not in codes:
            errors.append("error code is invalid")
        errors.extend(_fallback_meta(value.get("yana"), "runtime", initialize=value.get("yana", {}).get("sequence") == 1))
        return errors
    return errors + ["frame must contain method, result, or error"]


def _fallback_validate(schema_name: str, value: object) -> list[str]:
    if schema_name == "runtime":
        return _fallback_runtime(value)
    if schema_name == "ui":
        return _fallback_ui(value)
    if schema_name == "protocol":
        return _fallback_protocol(value)
    return [f"unknown schema {schema_name}"]


def client_meta(sequence: int = 2) -> dict:
    return {
        "protocol": "yana.runtime",
        "protocolVersion": "1.0",
        "sessionId": "session-01",
        "sequence": sequence,
        "sender": "client",
    }


def runtime_meta(sequence: int = 2) -> dict:
    return {
        "protocol": "yana.runtime",
        "protocolVersion": "1.0",
        "sessionId": "session-01",
        "sequence": sequence,
        "sender": "runtime",
    }


def runtime_settings() -> dict:
    return {
        "schemaVersion": "1.0",
        "owner": "yana-rt",
        "roots": {
            "installRoot": "/opt/yana-ai",
            "workspaceRoot": "/work/customer-project",
            "dataRoot": "/var/lib/yana-ai",
        },
        "transport": {
            "kind": "private-supervised-stdio",
            "protocol": "yana.runtime",
            "protocolVersion": "1.0",
            "jsonRpcVersion": "2.0",
            "framing": "ndjson",
            "encoding": "utf-8",
            "maxFrameBytes": 1048576,
            "maxInFlightRequests": 32,
            "eventWindow": 256,
            "ackTimeoutMs": 15000,
            "shutdownGraceMs": 5000,
        },
        "approvals": {
            "authority": "yana-rt",
            "handleTtlMs": 30000,
            "maxPending": 8,
            "allowedDecisions": ["approve_once", "deny"],
            "persistHandles": False,
            "allowSessionGrants": False,
        },
        "featureFlags": {
            "unifiedExperience": {
                "stage": "canary",
                "rolloutPercent": 10,
                "allowlistedInstallations": ["dev-install-01"],
                "killSwitch": False,
            }
        },
        "persistence": {
            "operationJournal": True,
            "operationRetentionDays": 14,
            "eventRetentionDays": 7,
            "crashMarkers": True,
        },
    }


def ui_preferences() -> dict:
    return {
        "schemaVersion": "1.0",
        "owner": "yana-ui",
        "appearance": {
            "theme": "Cyber-Sakura Lotus 🌸",
            "accent": "",
            "brandBlue": 45,
            "brandPink": 30,
            "brandGreen": 25,
            "glowIntensity": 58,
            "fontScale": 100,
            "surfaceOpacity": 84,
            "motifVisibility": "Subtle",
            "layout": "Regular",
            "reduceMotion": False,
            "contrastBoost": False,
            "chatFont": "System",
            "showAgents": True,
            "showMissions": True,
            "showMemory": True,
            "showSystem": True,
        },
        "interaction": {
            "sendOnEnter": True,
            "autoScrollStreaming": True,
            "confirmBeforeWindowClose": True,
            "copyCodeWithFormatting": False,
        },
        "layout": {
            "sidebarCollapsed": False,
            "sidebarWidthPx": 280,
            "detailsPanelCollapsed": True,
            "terminalHeightPx": 320,
        },
        "accessibility": {
            "screenReaderAnnouncements": True,
            "locale": "vi-VN",
        },
        "notifications": {
            "desktop": True,
            "sound": False,
            "showCompletionToast": True,
        },
    }


def initialize_request() -> dict:
    return {
        "jsonrpc": "2.0",
        "id": "init-01",
        "method": "runtime.initialize",
        "params": {
            "client": {
                "name": "yana-desktop",
                "version": "0.1.0",
                "instanceId": "desktop-01",
            },
            "protocolVersions": ["1.0"],
            "capabilities": [
                "event-ack-v1",
                "request-cancel-v1",
                "opaque-approval-v1",
            ],
            "workspaceHint": "/work/customer-project",
        },
        "yana": {
            "protocol": "yana.runtime",
            "protocolVersion": "1.0",
            "sessionId": None,
            "sequence": 1,
            "sender": "client",
        },
    }


def initialize_response() -> dict:
    settings = runtime_settings()
    return {
        "jsonrpc": "2.0",
        "id": "init-01",
        "result": {
            "type": "runtime.initialize.result",
            "protocolVersion": "1.0",
            "server": {"name": "yana-rt", "version": "0.42.4", "pid": 1234},
            "sessionId": "session-01",
            "capabilities": [
                "event-ack-v1",
                "request-cancel-v1",
                "opaque-approval-v1",
                "operation-reconcile-v1",
            ],
            "roots": settings["roots"],
            "limits": {
                key: settings["transport"][key]
                for key in (
                    "maxFrameBytes",
                    "maxInFlightRequests",
                    "eventWindow",
                    "ackTimeoutMs",
                    "shutdownGraceMs",
                )
            },
            "settingsVersions": {"runtime": "1.0", "uiPreferences": "1.0"},
        },
        "yana": {
            "protocol": "yana.runtime",
            "protocolVersion": "1.0",
            "sessionId": "session-01",
            "sequence": 1,
            "sender": "runtime",
        },
    }


def event_notification(sequence: int = 2) -> dict:
    return {
        "jsonrpc": "2.0",
        "method": "runtime.event",
        "params": {
            "id": "event-01",
            "ts": "2026-08-09T12:00:00Z",
            "from": "runtime-service",
            "to": "yana-desktop",
            "type": "runtime.operation.completed",
            "payload": {"operationId": "operation-01", "status": "completed"},
            "reply_to": None,
        },
        "yana": runtime_meta(sequence),
    }


class UnifiedRuntimeContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        if Draft202012Validator is None and os.getenv("CI", "").lower() in {"1", "true", "yes"}:
            raise RuntimeError("jsonschema is required in CI for unified runtime contract checks")

    def assert_valid(self, schema_name: str, value: object) -> None:
        fallback_errors = _fallback_validate(schema_name, value)
        self.assertEqual([], fallback_errors, "; ".join(fallback_errors))
        full = validator(schema_name)
        if full is not None:
            errors = sorted(full.iter_errors(value), key=lambda error: list(error.path))
            self.assertEqual([], errors, "; ".join(error.message for error in errors))

    def assert_invalid(self, schema_name: str, value: object) -> None:
        fallback_invalid = bool(_fallback_validate(schema_name, value))
        full = validator(schema_name)
        full_invalid = full is not None and not full.is_valid(value)
        self.assertTrue(fallback_invalid or full_invalid, value)

    def test_contract_schemas_are_valid_draft_2020_12(self) -> None:
        ids: set[str] = set()
        for name in SCHEMA_PATHS:
            schema = load_schema(name)
            self.assertEqual("https://json-schema.org/draft/2020-12/schema", schema["$schema"])
            self.assertIsInstance(schema.get("$id"), str)
            self.assertIsInstance(schema.get("$defs"), dict)
            if Draft202012Validator is not None:
                Draft202012Validator.check_schema(schema)
            self.assertNotIn(schema["$id"], ids)
            ids.add(schema["$id"])

    def test_runtime_settings_accept_only_rust_owned_authority(self) -> None:
        settings = runtime_settings()
        self.assert_valid("runtime", settings)

        wrong_owner = copy.deepcopy(settings)
        wrong_owner["owner"] = "yana-ui"
        self.assert_invalid("runtime", wrong_owner)

        ui_field = copy.deepcopy(settings)
        ui_field["appearance"] = {"theme": "dark"}
        self.assert_invalid("runtime", ui_field)

    def test_install_workspace_and_data_roots_are_all_required(self) -> None:
        for root_name in ("installRoot", "workspaceRoot", "dataRoot"):
            settings = runtime_settings()
            del settings["roots"][root_name]
            self.assert_invalid("runtime", settings)

    def test_runtime_approval_and_rollout_settings_fail_closed(self) -> None:
        persisted_handle = runtime_settings()
        persisted_handle["approvals"]["persistHandles"] = True
        self.assert_invalid("runtime", persisted_handle)

        broad_grant = runtime_settings()
        broad_grant["approvals"]["allowedDecisions"] = ["approve_session", "deny"]
        self.assert_invalid("runtime", broad_grant)

        inconsistent_off_flag = runtime_settings()
        inconsistent_off_flag["featureFlags"]["unifiedExperience"]["stage"] = "off"
        inconsistent_off_flag["featureFlags"]["unifiedExperience"]["rolloutPercent"] = 10
        self.assert_invalid("runtime", inconsistent_off_flag)

        invalid_rollout = runtime_settings()
        invalid_rollout["featureFlags"]["unifiedExperience"]["rolloutPercent"] = 101
        self.assert_invalid("runtime", invalid_rollout)

    def test_ui_preferences_are_presentation_only(self) -> None:
        preferences = ui_preferences()
        self.assert_valid("ui", preferences)

        for forbidden_name, forbidden_value in (
            ("roots", runtime_settings()["roots"]),
            ("transport", runtime_settings()["transport"]),
            ("approvals", runtime_settings()["approvals"]),
            ("featureFlags", runtime_settings()["featureFlags"]),
        ):
            unsafe = copy.deepcopy(preferences)
            unsafe[forbidden_name] = forbidden_value
            self.assert_invalid("ui", unsafe)

    def test_presentation_preferences_match_yana_tweaks_contract(self) -> None:
        expected = {
            "brandBlue",
            "brandPink",
            "brandGreen",
            "glowIntensity",
            "fontScale",
            "surfaceOpacity",
            "motifVisibility",
            "layout",
            "reduceMotion",
            "contrastBoost",
        }
        appearance_schema = load_schema("ui")["$defs"]["appearance"]
        self.assertTrue(expected.issubset(appearance_schema["properties"]))
        invariant = appearance_schema["x-yana-invariant"]
        self.assertEqual(["brandBlue", "brandPink", "brandGreen"], invariant["sum"])
        self.assertEqual(100, invariant["equals"])

        appearance = ui_preferences()["appearance"]
        self.assertEqual(100, appearance["brandBlue"] + appearance["brandPink"] + appearance["brandGreen"])

        imbalanced = ui_preferences()
        imbalanced["appearance"]["brandBlue"] = 44
        self.assert_invalid("ui", imbalanced)

        unsafe_scale = ui_preferences()
        unsafe_scale["appearance"]["fontScale"] = 126
        self.assert_invalid("ui", unsafe_scale)

    def test_three_step_versioned_handshake(self) -> None:
        self.assert_valid("protocol", initialize_request())
        self.assert_valid("protocol", initialize_response())
        self.assert_valid(
            "protocol",
            {
                "jsonrpc": "2.0",
                "method": "runtime.initialized",
                "params": {
                    "acceptedCapabilities": ["event-ack-v1", "opaque-approval-v1"]
                },
                "yana": client_meta(2),
            },
        )

    def test_handshake_rejects_wrong_version_or_sequence(self) -> None:
        no_common_version = initialize_request()
        no_common_version["params"]["protocolVersions"] = ["2.0"]
        self.assert_invalid("protocol", no_common_version)

        wrong_first_sequence = initialize_request()
        wrong_first_sequence["yana"]["sequence"] = 2
        self.assert_invalid("protocol", wrong_first_sequence)

        preselected_session = initialize_request()
        preselected_session["yana"]["sessionId"] = "client-chosen-session"
        self.assert_invalid("protocol", preselected_session)

    def test_protocol_rejects_batches_empty_ids_and_unknown_methods(self) -> None:
        self.assert_invalid("protocol", [initialize_request()])

        empty_id = initialize_request()
        empty_id["id"] = ""
        self.assert_invalid("protocol", empty_id)

        unknown = {
            "jsonrpc": "2.0",
            "id": "request-01",
            "method": "tools.call",
            "params": {},
            "yana": client_meta(3),
        }
        self.assert_invalid("protocol", unknown)

    def test_notification_payload_is_bus_event_compatible(self) -> None:
        event = event_notification()
        self.assert_valid("protocol", event)
        self.assertEqual(
            {"id", "ts", "from", "to", "type", "payload", "reply_to"},
            set(event["params"]),
        )

        camel_case_reply = event_notification()
        camel_case_reply["params"]["replyTo"] = camel_case_reply["params"].pop("reply_to")
        self.assert_invalid("protocol", camel_case_reply)

    def test_ack_window_and_negotiated_backpressure_limits(self) -> None:
        ack = {
            "jsonrpc": "2.0",
            "method": "runtime.ack",
            "params": {"throughSequence": 8},
            "yana": client_meta(5),
        }
        self.assert_valid("protocol", ack)

        invalid_ack = copy.deepcopy(ack)
        invalid_ack["params"]["throughSequence"] = 0
        self.assert_invalid("protocol", invalid_ack)

        excessive_window = initialize_response()
        excessive_window["result"]["limits"]["eventWindow"] = 4097
        self.assert_invalid("protocol", excessive_window)

    def test_cancel_requires_exactly_one_target(self) -> None:
        cancel = {
            "jsonrpc": "2.0",
            "id": "cancel-01",
            "method": "runtime.cancel",
            "params": {"operationId": "operation-01", "reason": "user stopped"},
            "yana": client_meta(6),
        }
        self.assert_valid("protocol", cancel)

        two_targets = copy.deepcopy(cancel)
        two_targets["params"]["requestId"] = "call-01"
        self.assert_invalid("protocol", two_targets)

        no_target = copy.deepcopy(cancel)
        del no_target["params"]["operationId"]
        self.assert_invalid("protocol", no_target)

    def test_approval_handles_are_opaque_single_use_values(self) -> None:
        approval_required = {
            "jsonrpc": "2.0",
            "id": "call-01",
            "result": {
                "type": "runtime.call.result",
                "operationId": "operation-01",
                "status": "approval_required",
                "approval": {
                    "handle": "approval-opaque-01",
                    "expiresAt": "2026-08-09T12:01:00Z",
                    "presentation": {
                        "title": "Run tests",
                        "summary": "Run the repository test suite in the selected workspace.",
                        "risk": "low",
                        "scope": ["/work/customer-project"],
                    },
                },
            },
            "yana": runtime_meta(7),
        }
        self.assert_valid("protocol", approval_required)

        structured_handle = copy.deepcopy(approval_required)
        structured_handle["result"]["approval"]["handle"] = {
            "operationId": "operation-01",
            "approved": True,
        }
        self.assert_invalid("protocol", structured_handle)

        approve_once = {
            "jsonrpc": "2.0",
            "id": "approval-resolution-01",
            "method": "runtime.approval.resolve",
            "params": {"handle": "approval-opaque-01", "decision": "approve_once"},
            "yana": client_meta(8),
        }
        self.assert_valid("protocol", approve_once)

        broad_approval = copy.deepcopy(approve_once)
        broad_approval["params"]["decision"] = "approve_session"
        self.assert_invalid("protocol", broad_approval)

    def test_crash_reconciliation_never_replays_a_mutation(self) -> None:
        query = {
            "jsonrpc": "2.0",
            "id": "reconcile-01",
            "method": "runtime.operation.get",
            "params": {"operationId": "operation-01"},
            "yana": client_meta(3),
        }
        self.assert_valid("protocol", query)

        unknown = {
            "jsonrpc": "2.0",
            "id": "reconcile-01",
            "result": {
                "type": "runtime.call.result",
                "operationId": "operation-01",
                "status": "unknown",
                "failure": {
                    "kind": "runtime_crashed_during_mutation",
                    "message": "Outcome requires evidence reconciliation; request was not replayed.",
                    "retryable": False,
                },
            },
            "yana": runtime_meta(3),
        }
        self.assert_valid("protocol", unknown)

    def test_typed_busy_error_supports_backoff(self) -> None:
        busy = {
            "jsonrpc": "2.0",
            "id": "call-33",
            "error": {
                "code": -32003,
                "message": "runtime request window is full",
                "data": {"kind": "busy", "retryable": True, "retryAfterMs": 100},
            },
            "yana": runtime_meta(9),
        }
        self.assert_valid("protocol", busy)

        unregistered_error = copy.deepcopy(busy)
        unregistered_error["error"]["code"] = -31999
        self.assert_invalid("protocol", unregistered_error)

    def test_encoded_example_is_one_bounded_ndjson_frame(self) -> None:
        frame = event_notification()
        self.assert_valid("protocol", frame)
        encoded = json.dumps(frame, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.assertNotIn(b"\n", encoded)
        self.assertLessEqual(len(encoded), runtime_settings()["transport"]["maxFrameBytes"])


if __name__ == "__main__":
    unittest.main()
