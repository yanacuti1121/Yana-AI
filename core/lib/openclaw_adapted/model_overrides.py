"""Session model override helpers normalize per-session provider model choices.

Origin:  openclaw/openclaw @ e2c567538d8964ab594f63ea3121ee72149f273d
         src/sessions/model-overrides.ts (MIT)
Ported:  2026-06-22. Full direct translation. `entry` is a `MutableMapping`
         (not a frozen dataclass) and IS mutated in place -- this departs
         from this codebase's usual immutability default (golden-principles.md
         #1), but it is a faithful port of the upstream API's actual
         contract: both exported functions return only `{"updated": bool}`
         and communicate everything else via the mutated entry, matching how
         callers hold a live reference into a session store. Field names on
         `entry` keep the upstream camelCase (sessionId, modelProvider,
         providerOverride, ...) since this dict mirrors an external
         JSON-shaped session record, matching the convention used by other
         snapshot-shaped ports (e.g. channel_health_policy.py).
License: MIT (see vendor/openclaw/_upstream/LICENSE)
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Literal, MutableMapping

from core.lib.openclaw_adapted.string_coerce import normalize_optional_string

OverrideSource = Literal["auto", "user"]


@dataclass(frozen=True)
class ModelOverrideSelection:
    """User or automatic model/provider override selection for a session entry."""

    provider: str
    model: str
    is_default: bool = False


def _clear_fallback_origin(entry: MutableMapping[str, object]) -> bool:
    updated = False
    if "modelOverrideFallbackOriginProvider" in entry:
        del entry["modelOverrideFallbackOriginProvider"]
        updated = True
    if "modelOverrideFallbackOriginModel" in entry:
        del entry["modelOverrideFallbackOriginModel"]
        updated = True
    return updated


def apply_model_override_to_session_entry(
    *,
    entry: MutableMapping[str, object],
    selection: ModelOverrideSelection,
    profile_override: str | None = None,
    profile_override_source: OverrideSource = "user",
    preserve_auth_profile_override: bool = False,
    selection_source: OverrideSource = "user",
    mark_live_switch_pending: bool = False,
) -> dict[str, bool]:
    """Apply a model/auth-profile override to `entry`, clearing stale runtime fields."""
    updated = False
    selection_updated = False
    profile_updated = False

    if selection.is_default:
        if entry.get("providerOverride"):
            del entry["providerOverride"]
            updated = True
            selection_updated = True
        if entry.get("modelOverride"):
            del entry["modelOverride"]
            updated = True
            selection_updated = True
        if entry.get("modelOverrideSource"):
            del entry["modelOverrideSource"]
            updated = True
        updated = _clear_fallback_origin(entry) or updated
    else:
        if entry.get("providerOverride") != selection.provider:
            entry["providerOverride"] = selection.provider
            updated = True
            selection_updated = True
        if entry.get("modelOverride") != selection.model:
            entry["modelOverride"] = selection.model
            updated = True
            selection_updated = True
        if entry.get("modelOverrideSource") != selection_source:
            entry["modelOverrideSource"] = selection_source
            updated = True
        updated = _clear_fallback_origin(entry) or updated

    # Model overrides supersede previously recorded runtime model identity.
    # If runtime fields are stale (or the override changed), clear them so
    # status surfaces reflect the selected model immediately.
    runtime_model = normalize_optional_string(entry.get("model")) or ""
    runtime_provider = normalize_optional_string(entry.get("modelProvider")) or ""
    runtime_present = len(runtime_model) > 0 or len(runtime_provider) > 0
    runtime_aligned = runtime_model == selection.model and (
        len(runtime_provider) == 0 or runtime_provider == selection.provider
    )
    if runtime_present and (selection_updated or not runtime_aligned):
        if "model" in entry:
            del entry["model"]
            updated = True
        if "modelProvider" in entry:
            del entry["modelProvider"]
            updated = True

    # contextTokens are derived from the active session model. When the
    # selected model changes (or runtime model is already stale), the cached
    # window can pin the session to an older/smaller limit until another run
    # refreshes it.
    stale_context = selection_updated or (runtime_present and not runtime_aligned)
    if "contextTokens" in entry and stale_context:
        del entry["contextTokens"]
        updated = True
    if "contextBudgetStatus" in entry and stale_context:
        del entry["contextBudgetStatus"]
        updated = True

    if profile_override:
        if entry.get("authProfileOverride") != profile_override:
            entry["authProfileOverride"] = profile_override
            updated = True
            profile_updated = True
        if entry.get("authProfileOverrideSource") != profile_override_source:
            entry["authProfileOverrideSource"] = profile_override_source
            updated = True
            profile_updated = True
        if "authProfileOverrideCompactionCount" in entry:
            del entry["authProfileOverrideCompactionCount"]
            updated = True
    elif not preserve_auth_profile_override:
        if entry.get("authProfileOverride"):
            del entry["authProfileOverride"]
            updated = True
            profile_updated = True
        if entry.get("authProfileOverrideSource"):
            del entry["authProfileOverrideSource"]
            updated = True
            profile_updated = True
        if "authProfileOverrideCompactionCount" in entry:
            del entry["authProfileOverrideCompactionCount"]
            updated = True

    # Clear stale fallback notice when the user explicitly switches models.
    if updated:
        if (selection_updated or profile_updated) and mark_live_switch_pending:
            entry["liveModelSwitchPending"] = True
        entry.pop("fallbackNoticeSelectedModel", None)
        entry.pop("fallbackNoticeActiveModel", None)
        entry.pop("fallbackNoticeReason", None)
        entry["updatedAt"] = int(time.time() * 1000)

    return {"updated": updated}


def _wrapped_override_model(provider: str, model: str) -> str:
    return f"{provider}/{model}"


def repair_provider_wrapped_model_override(
    *,
    entry: MutableMapping[str, object],
    default_provider: str,
    default_model: str | None = None,
) -> dict[str, bool]:
    """Repair overrides where legacy provider/model fields were stored as provider/model strings."""
    override_provider = normalize_optional_string(entry.get("providerOverride"))
    override_model = normalize_optional_string(entry.get("modelOverride"))
    if not override_provider or not override_model:
        return {"updated": False}

    wrapped_model = _wrapped_override_model(override_provider, override_model)
    runtime_provider = normalize_optional_string(entry.get("modelProvider"))
    runtime_model = normalize_optional_string(entry.get("model"))
    if (
        runtime_provider
        and runtime_model == wrapped_model
        and runtime_provider != override_provider
    ):
        return apply_model_override_to_session_entry(
            entry=entry,
            selection=ModelOverrideSelection(
                provider=runtime_provider,
                model=runtime_model,
                is_default=runtime_provider == default_provider and runtime_model == default_model,
            ),
            selection_source="auto" if entry.get("modelOverrideSource") == "auto" else "user",
        )

    if default_provider != override_provider and default_model == wrapped_model:
        return apply_model_override_to_session_entry(
            entry=entry,
            selection=ModelOverrideSelection(
                provider=default_provider, model=default_model, is_default=True
            ),
        )

    return {"updated": False}
