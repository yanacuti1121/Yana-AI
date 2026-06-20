"""Constant-time token/secret comparison.

Origin:  EvanBacon/serve-sim, packages/serve-sim/src/exec-ws.ts (`tokensMatch`)
         (Apache-2.0) -- https://github.com/EvanBacon/serve-sim, npm package
         "serve-sim" v0.1.34. Provided as a source zip snapshot (no pinned
         commit SHA available).
Ported:  2026-06-20. Only `tokensMatch` was extracted from exec-ws.ts -- the
         rest of that file (a WebSocket channel that runs arbitrary shell
         commands sent by the client) was deliberately NOT ported: that is
         exactly the `os.system()`/raw-exec pattern Yana AI's execution-
         environment.md bans outright, auth token or not.
License: Apache-2.0 (see vendor/serve-sim/_upstream/LICENSE)

Purpose: a plain `a == b` string comparison on a secret/token leaks timing
information proportional to the matching prefix length. Hash both sides
first so the comparison is constant-time even when the two inputs differ in
length -- relevant to any Yana AI auth/token check (52-secrets-vault-law.md
OTT validation, webhook signature verification, etc).
"""
from __future__ import annotations

import hashlib
import hmac


def tokens_match(a: str, b: str) -> bool:
    """Constant-time comparison: hashes both sides, then compares digests with hmac.compare_digest."""
    ha = hashlib.sha256(a.encode("utf-8")).digest()
    hb = hashlib.sha256(b.encode("utf-8")).digest()
    return hmac.compare_digest(ha, hb)
