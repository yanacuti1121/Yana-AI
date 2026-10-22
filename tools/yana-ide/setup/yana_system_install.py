#!/usr/bin/env python3
"""Lối vào của bộ cài hệ thống Yana: python3 tools/yana-ide/setup/yana_system_install.py --manifest"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from yana_install.cli import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
