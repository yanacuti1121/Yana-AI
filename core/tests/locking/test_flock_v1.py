#!/usr/bin/env python3
"""Hermetic unit tests for the production flock-v1 Python primitive."""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from core.lib.py.flock_v1 import (
    FlockV1,
    LockIdentityError,
    LockTimeoutError,
    MAINTENANCE_FILE,
    PROTOCOL_FILE,
    PROTOCOL_VERSION,
    canonical_identity,
    lock_name,
    lock_path,
)


class FlockV1Tests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="yana-flock-v1-python-")
        self.root = Path(self.temporary.name)
        marker = self.root / PROTOCOL_FILE
        marker.parent.mkdir(parents=True)
        marker.write_text(f"{PROTOCOL_VERSION}\n", encoding="utf-8")

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def test_identity_normalizes_keys_and_paths_without_existing_resource(self) -> None:
        expected = "key/state/token-budget.json"
        self.assertEqual(
            canonical_identity("key:state/./nested/../token-budget.json", self.root),
            expected,
        )
        relative = "core/memory/./L2_session/../L2_session/missing.json"
        absolute = self.root / "core/memory/L2_session/missing.json"
        self.assertFalse(absolute.exists())
        self.assertEqual(
            canonical_identity(relative, self.root),
            canonical_identity(os.fspath(absolute), self.root),
        )

    def test_identity_rejects_escape(self) -> None:
        with self.assertRaises(LockIdentityError):
            canonical_identity("key:../../outside", self.root)
        with self.assertRaises(LockIdentityError):
            canonical_identity("../outside", self.root)

    def test_unicode_case_and_collision_fixtures_are_deterministic(self) -> None:
        unicode_identity = canonical_identity("key:state/nhật-ký.json", self.root)
        self.assertEqual(lock_name(unicode_identity), lock_name(unicode_identity))
        self.assertNotEqual(
            lock_name(unicode_identity),
            lock_name(canonical_identity("key:state/NHẬT-KÝ.json", self.root)),
        )
        self.assertNotEqual(
            lock_name(canonical_identity("key:a/b_c", self.root)),
            lock_name(canonical_identity("key:a_b/c", self.root)),
        )

    def test_exception_releases_and_inode_stays_stable(self) -> None:
        resource = "key:state/stable.json"
        identity = canonical_identity(resource, self.root)
        expected_path = lock_path(self.root, identity)
        with self.assertRaisesRegex(RuntimeError, "intentional"):
            with FlockV1(resource, timeout=1, project_root=self.root):
                raise RuntimeError("intentional")
        inode_before = expected_path.stat().st_ino
        with FlockV1(resource, timeout=1, project_root=self.root):
            pass
        self.assertEqual(inode_before, expected_path.stat().st_ino)

    def test_timeout_fails_closed(self) -> None:
        resource = "key:state/timeout.json"
        with FlockV1(resource, timeout=1, project_root=self.root):
            with self.assertRaises(LockTimeoutError):
                with FlockV1(resource, timeout=0, project_root=self.root):
                    self.fail("contender entered critical section")

    def test_double_enter_is_rejected_without_losing_original_lock(self) -> None:
        resource = "key:state/double-enter.json"
        lock = FlockV1(resource, timeout=1, project_root=self.root)
        with lock:
            with self.assertRaisesRegex(RuntimeError, "already held"):
                lock.__enter__()
            with self.assertRaises(LockTimeoutError):
                with FlockV1(resource, timeout=0, project_root=self.root):
                    self.fail("double-enter released the original lock")

    def test_marker_and_maintenance_gate_fail_closed(self) -> None:
        resource = "key:state/gate.json"
        (self.root / PROTOCOL_FILE).unlink()
        with self.assertRaisesRegex(RuntimeError, "marker missing"):
            with FlockV1(resource, timeout=0, project_root=self.root):
                pass
        (self.root / PROTOCOL_FILE).write_text("mkdir-v1\n", encoding="utf-8")
        with self.assertRaisesRegex(RuntimeError, "marker mismatch"):
            with FlockV1(resource, timeout=0, project_root=self.root):
                pass
        (self.root / PROTOCOL_FILE).write_text(
            f"{PROTOCOL_VERSION}\n", encoding="utf-8"
        )
        (self.root / MAINTENANCE_FILE).write_text("maintenance\n", encoding="utf-8")
        with self.assertRaisesRegex(RuntimeError, "maintenance gate"):
            with FlockV1(resource, timeout=0, project_root=self.root):
                pass

    def test_directory_lock_path_fails_loud(self) -> None:
        resource = "key:state/directory.json"
        identity = canonical_identity(resource, self.root)
        lock_path(self.root, identity).mkdir(parents=True)
        with self.assertRaisesRegex(RuntimeError, "regular file"):
            with FlockV1(resource, timeout=0, project_root=self.root):
                pass

    def test_symlinked_lock_root_fails_loud(self) -> None:
        outside = self.root / "outside"
        outside.mkdir()
        (self.root / ".claude/state/locks").symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(RuntimeError, "real directory"):
            with FlockV1("key:state/symlink.json", timeout=0, project_root=self.root):
                pass
        self.assertEqual(list(outside.iterdir()), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
