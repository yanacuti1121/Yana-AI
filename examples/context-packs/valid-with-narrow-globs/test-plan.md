# Test Plan

- Run command: `python3 tests/test_context_pack_check.py`
- Run command: `bash bin/yamtam check-context examples/context-packs/valid-with-narrow-globs`
- Expected evidence: valid fixture exits 0 and no invalid findings are printed.
