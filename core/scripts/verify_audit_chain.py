#!/usr/bin/env python3
"""Single-process audit chain verifier.

Called by verify-audit-chain.sh. The shell version spawns about eleven
processes per entry (jq x8, shasum, awk), roughly 27 ms each, so a log with
16,000 entries took over seven minutes and grew with every tool call. That
made the Giam Thi watcher run for minutes and the installer's first-run check
time out. This module walks the same chain in one process.

It keeps the shell version's behaviour on purpose, including its quirks:
  * blank lines are skipped and do not count as entries;
  * a final line without a trailing newline is ignored, as `while read` does;
  * a line that is not a JSON object gets empty fields, so it fails the chain
    checks instead of being skipped;
  * each field loses trailing newlines, as `$(...)` does;
  * the known-breaks allowlist needs ts, hash and the really computed
    expected_prev to match, never ts and hash alone.

Usage: verify_audit_chain.py LOG_FILE [KNOWN_BREAKS_FILE]
Exit 0: chain intact. Exit 1: first broken entry printed. Exit 2: bad usage.
"""
import hashlib
import json
import sys

ENCODING = "utf-8"
ERRORS = "surrogateescape"  # keep invalid bytes distinct instead of crashing
KNOWN_BREAKS_DOC = "core/config/audit-chain-known-breaks.json"
USAGE_EXIT = 2
UNREADABLE_EXIT = 2
BROKEN_EXIT = 1


def sha256_hex(text):
    try:
        raw = text.encode(ENCODING, ERRORS)
    except UnicodeEncodeError:
        # A lone surrogate (for example an escaped \ud800 in a field) cannot be
        # encoded losslessly. Hash a replaced copy so the entry fails the chain
        # check with a normal message instead of crashing the verifier.
        raw = text.encode(ENCODING, "replace")
    return hashlib.sha256(raw).hexdigest()


def field(entry, key):
    """Mirror `jq -r '.key // ""'` followed by `$(...)` newline stripping."""
    if not isinstance(entry, dict):
        return ""
    value = entry.get(key)
    if value is None or value is False:
        return ""
    if isinstance(value, str):
        text = value
    elif value is True:
        text = "true"
    else:
        text = json.dumps(value, separators=(",", ":"))
    return text.rstrip("\n")


def parse_entry(line):
    try:
        return json.loads(line)
    except (ValueError, RecursionError):
        return None


def load_known_breaks(path):
    """Return the allowlist as a set of (ts, hash, expected_prev) triples."""
    if not path:
        return set()
    try:
        with open(path, "r", encoding=ENCODING, errors=ERRORS) as handle:
            document = json.load(handle)
    except (OSError, ValueError):
        return set()
    items = document.get("known_breaks") if isinstance(document, dict) else None
    if not isinstance(items, list):
        return set()
    triples = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        triple = (item.get("ts"), item.get("hash"), item.get("expected_prev"))
        # Entries are compared against strings, so a non-string value can never
        # match; skipping it also avoids an unhashable-type crash on a list.
        if all(isinstance(value, str) for value in triple):
            triples.add(triple)
    return triples


def read_lines(path):
    with open(path, "rb") as handle:
        data = handle.read()
    parts = data.split(b"\n")
    # `while read` never runs the body for a last line missing its newline.
    parts.pop()
    return [part.decode(ENCODING, ERRORS) for part in parts]


def verify(log_path, known_breaks_path):
    known = load_known_breaks(known_breaks_path)
    expected_prev = sha256_hex("YANA_GENESIS")
    count = 0
    for line in read_lines(log_path):
        if not line:
            continue
        count += 1
        entry = parse_entry(line)
        ts, hook, tool = field(entry, "ts"), field(entry, "hook"), field(entry, "tool")
        agent, text = field(entry, "agent"), field(entry, "input")
        decision = field(entry, "decision")
        stored_prev, stored_hash = field(entry, "prev_hash"), field(entry, "hash")

        if stored_prev != expected_prev:
            if (ts, stored_hash, expected_prev) in known:
                print("NOTE: entry %d (%s | %s | %s) is a documented, reviewed break "
                      "— see %s. Its own hash is still verified below; "
                      "continuing the chain from it." % (count, ts, tool, agent, KNOWN_BREAKS_DOC))
            else:
                print("CHAIN BROKEN at entry %d — prev_hash mismatch" % count)
                print("  expected prev : %s" % expected_prev)
                print("  stored   prev : %s" % stored_prev)
                print("  entry         : %s | %s | %s" % (ts, tool, agent))
                return BROKEN_EXIT

        content = "|".join((ts, hook, tool, agent, text, decision))
        expected_hash = sha256_hex(content + "|" + stored_prev)
        if stored_hash != expected_hash:
            print("CHAIN BROKEN at entry %d — hash mismatch (entry may be tampered)" % count)
            print("  expected hash : %s" % expected_hash)
            print("  stored   hash : %s" % stored_hash)
            print("  entry         : %s | %s | %s" % (ts, tool, agent))
            return BROKEN_EXIT
        expected_prev = stored_hash

    print("OK: audit chain intact (%d entries verified)" % count)
    return 0


def main(argv):
    if len(argv) < 2 or len(argv) > 3:
        print("usage: verify_audit_chain.py LOG_FILE [KNOWN_BREAKS_FILE]", file=sys.stderr)
        return USAGE_EXIT
    known_path = argv[2] if len(argv) == 3 else None
    # Keep an unprintable byte in a field from crashing the report itself.
    sys.stdout.reconfigure(errors="backslashreplace")
    try:
        return verify(argv[1], known_path)
    except OSError as error:
        # The shell loop reported "OK (0 entries)" for an unreadable log. Failing
        # here is deliberate: a log that cannot be read is not a verified log.
        print("ERROR: cannot read audit log: %s" % error, file=sys.stderr)
        return UNREADABLE_EXIT


if __name__ == "__main__":
    sys.exit(main(sys.argv))
