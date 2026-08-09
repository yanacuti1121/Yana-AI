//! Resource management (Program K, area 3 of 3 — see
//! `PROGRAM-K-YANA-OS-SKELETON.md`).
//!
//! Deliberately a thin wrapper, not new tracking logic: `crate::cost`
//! already logs token/cost usage per call (`yana-rt cost log/show`). This
//! just surfaces it under the `os` namespace. Real quota *enforcement*
//! (governing what an agent is *allowed* to spend, not just reporting what
//! it *did* spend — CPU/RAM/process limits included) is still `_(TODO)_`.

pub fn status() {
    crate::cost::cmd_cost_show();
}
