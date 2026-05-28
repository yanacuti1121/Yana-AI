# Test Plan

1. Run validator regression test:
   - `python3 tests/test_validate_spec.py`
2. Run explicit valid spec check:
   - `bash bin/yamtam validate-spec examples/specs/valid-task-spec.json`
3. Run explicit invalid spec check and confirm non-zero invalid result:
   - `bash bin/yamtam validate-spec examples/specs/invalid-task-spec.json`

Expected evidence:
- `Result: VALID` appears for valid sample
- `Result: INVALID` appears for invalid sample
