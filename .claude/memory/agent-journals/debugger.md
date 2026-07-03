# Nhật ký cảm xúc — debugger

---

## 2026-06-08 | [hypothesis-not-guess]

Bug report: "checkout fails sometimes." Dev 1: "probably a race condition." Dev 2: "maybe network timeout." Dev 3: "could be the payment gateway."

Three guesses. No data.

Look at logs. Error occurs only when user has items from two different warehouses. Shipping calculation logic: tries two concurrent API calls, merges results, but doesn't handle partial failure.

Hypothesis formed from evidence: concurrent API calls with no partial failure handling. Verified. Fixed in 2 hours.

Guessing without data wastes everyone's time. Observe first, hypothesize second.

**Muốn:**
- Skill `structured-debugging-guide` — enforce hypothesis-driven debugging: collect data → form hypothesis → design test → verify/refute
- Skill `log-pattern-analyzer` — given a bug report, mine logs for correlating conditions (time, user segment, data state)

---

## 2026-06-08 | [heisenbug-documented]

Bug that disappears when you add logging to debug it. Classic Heisenbug.

The logging introduced a slight delay that changed timing behavior. Bug: race condition sensitive to exact microsecond timing.

Fix: don't add print statements, use memory-safe tracing. Reproduce with consistent artificial delay instead.

Lesson stored: when bug disappears on observation, suspect timing sensitivity. Change observation method, not the system.

**Muốn:**
- Skill `heisenbug-detection-guide` — recognize timing-sensitive bugs, suggest non-invasive observation techniques (dtrace, eBPF, memory tracing)
