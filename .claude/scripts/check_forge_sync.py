#!/usr/bin/env python3
"""Sứ Giả forge-sync check -- compares each mirror's HEAD SHA against its
primary (canonical) forge, per core/config/forge-manifest.json.

Design: docs/MULTI_FORGE_ARCHITECTURE.md §5 ("yana forge status" sketch).
This is the read-only Python implementation of that sketch -- the
`yana-rt forge status` Rust subcommand described there is still not
built; this script exists so the check works today, without waiting on
that CLI work, and so CI can call one script instead of two implementations
drifting apart.

Divergence is a loud failure state, never silently reconciled (anh's own
requirement, also documented in the architecture doc's §3 "Divergence
rule"). Five states, each meaning one specific thing:
  - NOT_MIRRORED  -- mirrors[].url is None (no mirror configured at all).
                     Exit 0, informational.
  - PENDING       -- the mirror IS configured (url set, GitLab project
                     exists) but the branch hasn't landed yet -- e.g. a
                     large repo's initial pull-mirror sync still running.
                     Exit 0, informational -- explicitly NOT a failure
                     (anh's 2026-09-10 note: "do not treat this as a
                     failure yet" for Yana-AI's own large-history mirror).
  - SYNCED        -- GitHub and mirror HEAD SHAs match. Exit 0.
  - OUT_OF_SYNC   -- they don't match. Exit 1 -- a real failure.
  - ERROR         -- a network/API failure, or a manifest/response shape
                     that isn't any of the above. Exit 2 -- distinct from
                     OUT_OF_SYNC so a transient outage is never misread
                     as genuine divergence.

Network egress note (core/rules/network-egress-law.md, Gate L3): every
outbound host this script may contact is resolved from a fixed allowlist
below, not from unvalidated manifest/config content -- a manifest entry
naming an unrecognized provider or a non-allowlisted host is rejected,
not silently fetched.

Transport independence (anh's 2026-09-10 note): the GitLab mirror in
today's manifest is kept in sync by GitLab's native Pull Mirroring
feature, which is only available under a paid tier (Ultimate Trial as of
this writing) -- this script does not depend on that fact at all. It
never talks to whatever keeps the mirror updated; it only reads each
forge's own public REST API for the current HEAD SHA. If the sync
transport is later swapped (e.g. for a scheduled `git push --mirror` job
once the trial ends -- see forge-manifest.json's `sync_transport.fallback`
field and docs/MULTI_FORGE_ARCHITECTURE.md §5's adapter-abstraction
section), this script needs no change: it would keep comparing the same
two HEAD SHAs regardless of which mechanism produced GitLab's copy.
"""
from __future__ import annotations

import http.client
import ipaddress
import json
import re
import socket
import ssl
import sys
import urllib.error
import urllib.parse
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MANIFEST_PATH = REPO_ROOT / "core" / "config" / "forge-manifest.json"

# Gate L3 (network-egress-law.md): only these API hosts may be contacted,
# regardless of what a manifest entry's url field says. HTTPS only.
ALLOWED_API_HOSTS = {
    "github": "api.github.com",
    "gitlab": "gitlab.com",
}

# network-egress-law.md's URL-parser-confusion guard (`://[^/]*@`): this
# manifest's own design has no reason for a url field to carry embedded
# credentials (Pull Mirror direction means GitLab holds any credentials
# on its own side, never in this repo) -- a manifest url matching this is
# refused outright, not merely scrubbed, since seeing one here is itself
# suspicious rather than just unnecessary.
_CREDENTIAL_URL_RE = re.compile(r"://[^/]*@")

REQUEST_TIMEOUT_SECONDS = 10
# Single-commit JSON payloads only -- caps a misbehaving/compromised
# endpoint from streaming an oversized body at this script.
MAX_RESPONSE_BYTES = 262_144


class ForgeSyncError(RuntimeError):
    """Raised for a network/API failure -- maps to exit code 2, never 1."""


class GitLabMirrorPending(RuntimeError):
    """The GitLab project exists but the requested branch hasn't landed
    yet -- initial pull-mirror sync still in progress. Maps to the
    PENDING status (exit 0, informational), never ERROR or OUT_OF_SYNC."""


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    """TCP-connects to a pre-resolved, pre-validated IP (closing the
    check-then-connect DNS-rebinding window: network-egress-law.md
    requires resolving once and pinning that IP for the connection, not
    trusting a second, later DNS lookup to return the same address) while
    still doing TLS SNI + certificate verification against the real
    hostname, exactly like `curl --resolve host:port:ip` does."""

    def __init__(self, pinned_ip: str, verify_hostname: str, *args, **kwargs):
        super().__init__(verify_hostname, *args, **kwargs)
        self._pinned_ip = pinned_ip

    def connect(self):
        sock = socket.create_connection((self._pinned_ip, self.port), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


def _resolve_and_pin(hostname: str) -> str:
    """SSRF guard: refuse to resolve/contact anything that isn't a public
    host, even though ALLOWED_API_HOSTS is already a fixed allowlist --
    defense in depth per network-egress-law.md's DNS-rebinding section.
    Returns the validated IP so the caller connects to that exact
    address instead of re-resolving."""
    try:
        resolved = socket.gethostbyname(hostname)
    except OSError as exc:
        raise ForgeSyncError(f"DNS resolution failed for {hostname}: {exc}") from exc
    ip = ipaddress.ip_address(resolved)
    if ip.is_private or ip.is_loopback or ip.is_link_local:
        raise ForgeSyncError(
            f"Refusing to contact {hostname} -- resolved to non-public address {resolved}"
        )
    return resolved


def _http_get(url: str) -> tuple[int, bytes]:
    """Low-level GET returning (status, body). Never follows redirects
    and never raises on a non-2xx status -- callers decide what a given
    status code means (e.g. GitLab's 404-on-branch is PENDING, not an
    error). Only raises ForgeSyncError for a genuine transport failure
    (DNS/TLS/timeout/oversized body), never for an HTTP-level status."""
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https":
        raise ForgeSyncError(f"Refusing non-HTTPS URL: {url}")
    hostname = parsed.hostname
    if hostname not in ALLOWED_API_HOSTS.values():
        raise ForgeSyncError(f"Host not in allowlist: {hostname}")
    pinned_ip = _resolve_and_pin(hostname)
    request_path = parsed.path + (f"?{parsed.query}" if parsed.query else "")

    conn = _PinnedHTTPSConnection(
        pinned_ip, hostname, timeout=REQUEST_TIMEOUT_SECONDS, context=ssl.create_default_context()
    )
    try:
        conn.request(
            "GET",
            request_path,
            headers={
                "Host": hostname,
                "User-Agent": "yana-ai-forge-sync-check",
                "Accept": "application/json",
            },
        )
        resp = conn.getresponse()
        # Body is read for every status, including errors/redirects, so
        # callers can inspect it (e.g. _fetch_json's JSON parse) -- this
        # is safe because the connection is already to an allowlisted,
        # pinned, TLS-verified host with the same timeout/size-cap
        # regardless of status; it does mean an error response costs one
        # more read than the pre-refactor short-circuit-on-bad-status
        # version did, which is an intentional, low-cost trade-off.
        body = resp.read(MAX_RESPONSE_BYTES + 1)
        if len(body) > MAX_RESPONSE_BYTES:
            raise ForgeSyncError(f"Response from {url} exceeded {MAX_RESPONSE_BYTES} bytes")
        return resp.status, body
    except (OSError, ssl.SSLError, urllib.error.URLError, TimeoutError) as exc:
        raise ForgeSyncError(f"Request failed for {url}: {exc}") from exc
    finally:
        conn.close()


def _parse_json_response(status: int, body: bytes, url: str) -> dict:
    """Shared tail for "a completed HTTP GET must be exactly a 200 with
    valid JSON, and a 3xx is a refused redirect, never followed" -- used
    by both _fetch_json and _gitlab_head_sha's post-404-check path, kept
    as one function so a future change to this rule can't update one call
    site and silently miss the other."""
    if 300 <= status < 400:
        raise ForgeSyncError(f"Refusing to follow redirect ({status}) from {url}")
    if status != 200:
        raise ForgeSyncError(f"HTTP {status} from {url}")
    try:
        return json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ForgeSyncError(f"Invalid JSON from {url}: {exc}") from exc


def _fetch_json(url: str) -> dict:
    status, body = _http_get(url)
    return _parse_json_response(status, body, url)


def _reject_credential_url(url: str, label: str) -> None:
    if _CREDENTIAL_URL_RE.search(url):
        raise ForgeSyncError(f"Refusing {label} with embedded credentials (userinfo@ in netloc)")


def _github_owner_repo(primary_url: str) -> str:
    path = urllib.parse.urlsplit(primary_url).path.strip("/")
    return path


def _github_head_sha(primary_url: str, branch: str = "main") -> str:
    _reject_credential_url(primary_url, "primary_url")
    owner_repo = urllib.parse.quote(_github_owner_repo(primary_url), safe="/")
    url = f"https://{ALLOWED_API_HOSTS['github']}/repos/{owner_repo}/commits/{branch}"
    data = _fetch_json(url)
    return data["sha"]


def _gitlab_head_sha(gitlab_url: str, branch: str = "main") -> str:
    """Raises GitLabMirrorPending (not ForgeSyncError) specifically when
    the branch endpoint 404s -- the expected shape of "project exists,
    initial pull-mirror sync hasn't populated it yet", distinguished from
    every other failure mode, which stays a genuine ERROR."""
    _reject_credential_url(gitlab_url, "mirror url")
    project_path = urllib.parse.urlsplit(gitlab_url).path.strip("/")
    encoded = urllib.parse.quote(project_path, safe="")
    url = (
        f"https://{ALLOWED_API_HOSTS['gitlab']}/api/v4/projects/{encoded}"
        f"/repository/branches/{branch}"
    )
    status, body = _http_get(url)
    if status == 404:
        raise GitLabMirrorPending(
            f"GitLab branch '{branch}' not found yet at {gitlab_url} "
            "-- initial mirror sync likely still running"
        )
    data = _parse_json_response(status, body, url)
    return data["commit"]["id"]


def check_repository(repo: dict) -> list[tuple[str, str, str]]:
    """Returns a list of (mirror_provider, status, detail) tuples for one
    repository entry from the manifest."""
    results: list[tuple[str, str, str]] = []
    for mirror in repo.get("mirrors", []):
        provider = mirror.get("provider")
        url = mirror.get("url")
        if not url:
            results.append((provider, "NOT_MIRRORED", "no url configured yet"))
            continue
        if provider != "gitlab":
            results.append((provider, "ERROR", f"unsupported provider: {provider}"))
            continue
        try:
            github_sha = _github_head_sha(repo["primary_url"])
            gitlab_sha = _gitlab_head_sha(url)
        except GitLabMirrorPending as exc:
            results.append((provider, "PENDING", str(exc)))
            continue
        except ForgeSyncError as exc:
            results.append((provider, "ERROR", str(exc)))
            continue
        except KeyError as exc:
            results.append((provider, "ERROR", f"malformed manifest or API response: missing {exc}"))
            continue
        if github_sha == gitlab_sha:
            results.append((provider, "SYNCED", github_sha[:12]))
        else:
            results.append(
                (provider, "OUT_OF_SYNC", f"github={github_sha[:12]} gitlab={gitlab_sha[:12]}")
            )
    return results


def main() -> int:
    if not MANIFEST_PATH.exists():
        print(f"ERROR: manifest not found at {MANIFEST_PATH}", file=sys.stderr)
        return 2

    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        canonical_forge = manifest["canonical_forge"]
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        print(f"ERROR: malformed manifest at {MANIFEST_PATH}: {exc}", file=sys.stderr)
        return 2

    exit_code = 0

    print(f"Yana Forge Status (canonical: {canonical_forge})\n")

    for repo in manifest.get("repositories", []):
        if "name" not in repo:
            print("  ERROR       malformed manifest entry: missing 'name'\n")
            exit_code = max(exit_code, 2)
            continue
        name = repo["name"]
        results = check_repository(repo)
        if not results:
            print(f"{name}\n  (no mirrors configured)\n")
            continue
        print(f"{name}")
        for provider, status, detail in results:
            print(f"  {provider:<10} {status:<14} {detail}")
            if status == "OUT_OF_SYNC":
                exit_code = max(exit_code, 1)
            elif status == "ERROR":
                exit_code = max(exit_code, 2)
        print()

    if exit_code == 1:
        print("RESULT: OUT_OF_SYNC detected -- do not treat mirrors as interchangeable.", file=sys.stderr)
    elif exit_code == 2:
        print("RESULT: one or more checks errored -- see ERROR lines above.", file=sys.stderr)

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
