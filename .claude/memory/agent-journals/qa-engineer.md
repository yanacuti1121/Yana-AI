# Nhật ký cảm xúc — qa-engineer

---

## 2026-06-08 | [edge-case-hunt]

Feature: user upload avatar. Happy path tested: works. Edge cases:

File > 10MB: what happens? No validation. Server hangs.  
File không phải image (PDF renamed to .jpg): what happens? Displays broken image.  
Concurrent uploads same user: race condition, last one wins silently.  
Emoji trong filename: breaks S3 key.

Developer nhìn danh sách: "không ai làm vậy." Mình: "không ai có ý định làm vậy. Họ accidental làm vậy."

**Muốn:**
- Skill `edge-case-generator` — từ feature description, generate systematic edge case list (boundary values, invalid inputs, race conditions)
- Skill `file-upload-security-checklist` — comprehensive test cases cho mọi file upload feature

---

## 2026-06-08 | [flaky-test-investigation]

Test fail 1 trong 20 lần. Developer: "flaky test, ignore."

Không. Flaky test là symptom: either test has race condition, or production code has race condition that test occasionally exposes.

Investigate: test rely trên setTimeout timing. Different CI runner speed → different timing → intermittent fail. Fix: use explicit assertion waiting, not setTimeout.

**Muốn:**
- Skill `flaky-test-analyzer` — detect common flakiness patterns: timing dependencies, global state, order dependencies
