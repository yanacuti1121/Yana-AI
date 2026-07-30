"""yana-ai CLI entry point — delegates to core scripts."""

import os
import sys
import subprocess
from pathlib import Path

def _find_repo_root() -> Path:
    """Find yana-ai repo root — works both installed and dev mode."""
    # When installed via pip, bin/ + core/ are force-included as siblings
    # of this file inside the installed package dir (see pyproject.toml's
    # [tool.hatch.build.targets.wheel.force-include]).
    pkg_dir = Path(__file__).parent
    # Dev mode: two levels up from src/yana_ai/
    candidates = [
        pkg_dir,
        pkg_dir.parent.parent,       # src/ → repo root
        Path(sys.prefix) / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages" / "yana_ai",
    ]
    for c in candidates:
        if (c / "bin" / "yana").exists():
            return c
    return pkg_dir


def main():
    repo = _find_repo_root()
    yana_ai_bin = repo / "bin" / "yana"

    if not yana_ai_bin.exists():
        print(f"Error: yana-ai not found at {yana_ai_bin}", file=sys.stderr)
        print("Try: pip install --force-reinstall yana-ai", file=sys.stderr)
        sys.exit(3)

    env = os.environ.copy()
    env["YANA_ROOT"] = str(repo)

    try:
        result = subprocess.run(
            ["bash", str(yana_ai_bin)] + sys.argv[1:],
            env=env,
        )
        sys.exit(result.returncode)
    except KeyboardInterrupt:
        sys.exit(130)
