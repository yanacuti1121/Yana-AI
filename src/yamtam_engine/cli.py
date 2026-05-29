"""yamtam-engine CLI entry point — delegates to core scripts."""

import os
import sys
import subprocess
from pathlib import Path

def _find_repo_root() -> Path:
    """Find yamtam-engine repo root — works both installed and dev mode."""
    # When installed via pip, data files are in the package dir
    pkg_dir = Path(__file__).parent
    # Dev mode: two levels up from src/yamtam_engine/
    candidates = [
        pkg_dir,
        pkg_dir.parent.parent,       # src/ → repo root
        Path(sys.prefix) / "lib" / f"python{sys.version_info.major}.{sys.version_info.minor}" / "site-packages" / "yamtam_engine",
    ]
    for c in candidates:
        if (c / "bin" / "yamtam").exists():
            return c
    return pkg_dir


def main():
    repo = _find_repo_root()
    yamtam_bin = repo / "bin" / "yamtam"

    if not yamtam_bin.exists():
        print(f"Error: yamtam not found at {yamtam_bin}", file=sys.stderr)
        print("Try: pip install --force-reinstall yamtam-engine", file=sys.stderr)
        sys.exit(3)

    env = os.environ.copy()
    env["YAMTAM_ROOT"] = str(repo)

    try:
        result = subprocess.run(
            ["bash", str(yamtam_bin)] + sys.argv[1:],
            env=env,
        )
        sys.exit(result.returncode)
    except KeyboardInterrupt:
        sys.exit(130)
