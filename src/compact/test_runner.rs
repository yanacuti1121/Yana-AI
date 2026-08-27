//! `cargo test` / `pytest` compaction.
//!
//! Safety rule that shapes this whole module: compact ONLY a fully clean
//! run (zero failures, zero errors). Any failure means decline entirely and
//! let the raw output — including whatever backtrace/traceback detail the
//! failure produced — reach the agent untouched. This sidesteps an entire
//! class of risk this MVP does not take on: deciding which parts of a
//! failure's diagnostic detail are "safe" to elide. A clean run has no such
//! detail to lose, so it's the only case compacted here.

use super::{CompactedBody, ExactStats, RawCommandOutput};
use regex::Regex;

const MIN_PASSING_WORTH_COMPACTING: usize = 15;

pub fn recognizes(command_text: &str) -> bool {
    is_cargo_test(command_text) || is_pytest(command_text)
}

fn is_cargo_test(command_text: &str) -> bool {
    let tokens: Vec<&str> = command_text.split_whitespace().collect();
    tokens.first() == Some(&"cargo") && tokens.get(1) == Some(&"test")
}

fn is_pytest(command_text: &str) -> bool {
    command_text.split_whitespace().any(|token| token == "pytest")
}

pub fn compact(raw: &RawCommandOutput) -> Option<CompactedBody> {
    if is_cargo_test(raw.command_text) {
        return compact_cargo(raw);
    }
    if is_pytest(raw.command_text) {
        return compact_pytest(raw);
    }
    None
}

fn compact_cargo(raw: &RawCommandOutput) -> Option<CompactedBody> {
    // The test name is `(.+)`, not `(\S+)`: a doctest result line looks like
    // `test src/lib.rs - MyStruct::foo (line 10) ... ok` — the name itself
    // contains spaces. `\S+` silently never matched those lines at all,
    // undercounting `pass` while the header still claimed "exact counts
    // from full output" (code-auditor review, 2026-08-27). Anchored on both
    // ends, so the greedy `.+` still correctly backtracks to find the
    // literal " ... ok/FAILED/ignored" at the true end of the line.
    let test_line = Regex::new(r"(?m)^test (.+) \.\.\. (ok|FAILED|ignored)$").ok()?;
    let result_line = Regex::new(r"(?m)^test result: .*$").ok()?;

    let mut pass = 0usize;
    let mut fail = 0usize;
    let mut skip = 0usize;
    for caps in test_line.captures_iter(raw.stdout) {
        match &caps[2] {
            "ok" => pass += 1,
            "FAILED" => fail += 1,
            "ignored" => skip += 1,
            _ => {}
        }
    }
    if pass + fail + skip == 0 {
        return None; // format not recognized at all
    }
    if fail > 0 {
        return None; // any failure — raw output must reach the agent intact
    }
    let result_lines: Vec<&str> = result_line.find_iter(raw.stdout).map(|m| m.as_str()).collect();
    if result_lines.is_empty() {
        return None; // no trustworthy summary line present — decline
    }
    if pass < MIN_PASSING_WORTH_COMPACTING {
        return None;
    }

    let mut text = String::new();
    text.push_str(&format!(
        "# cargo test: {pass} passed, 0 failed, {skip} ignored (exact counts from full output)\n"
    ));
    text.push_str(&format!(
        "# {pass} passing test name(s) elided — all \"ok\", no failures to show\n"
    ));
    for line in &result_lines {
        text.push_str(line);
        text.push('\n');
    }

    Some(CompactedBody {
        text,
        pattern: "test.cargo.allpass",
        stats: ExactStats {
            pass_count: Some(pass),
            fail_count: Some(0),
            skip_count: Some(skip),
            ..Default::default()
        },
    })
}

/// Matches pytest's default final summary line, e.g.
/// `"===== 47 passed in 12.34s ====="` or
/// `"== 3 skipped, 44 passed in 5.01s =="`. Declines on anything else —
/// pytest's non-default verbosity output shapes are not handled by this
/// MVP module.
fn compact_pytest(raw: &RawCommandOutput) -> Option<CompactedBody> {
    let summary = Regex::new(r"(?m)^=+ (.+) in [\d.]+s(?: \([^)]*\))? =+\s*$").ok()?;
    let caps = summary.captures_iter(raw.stdout).last()?; // the LAST match is the final summary
    let body = caps.get(1)?.as_str();

    let mut passed = 0usize;
    let mut failed = 0usize;
    let mut skipped = 0usize;
    let mut errors = 0usize;
    for part in body.split(',') {
        let part = part.trim();
        let Some(n) = part.split_whitespace().next().and_then(|w| w.parse::<usize>().ok()) else {
            continue;
        };
        if part.contains("passed") {
            passed = n;
        } else if part.contains("failed") {
            failed = n;
        } else if part.contains("skipped") {
            skipped = n;
        } else if part.contains("error") {
            errors = n;
        }
    }
    if passed + failed + skipped + errors == 0 {
        return None;
    }
    if failed > 0 || errors > 0 {
        return None; // any failure/error — raw output must reach the agent intact
    }
    if passed < MIN_PASSING_WORTH_COMPACTING {
        return None;
    }

    let summary_line = caps.get(0)?.as_str();
    let mut text = String::new();
    text.push_str(&format!(
        "# pytest: {passed} passed, {skipped} skipped, 0 failed (exact counts from full output)\n"
    ));
    text.push_str(&format!(
        "# {passed} passing test line(s) elided — all clean, no failures to show\n"
    ));
    text.push_str(summary_line);
    text.push('\n');

    Some(CompactedBody {
        text,
        pattern: "test.pytest.allpass",
        stats: ExactStats {
            pass_count: Some(passed),
            fail_count: Some(0),
            skip_count: Some(skipped),
            error_count: Some(0),
            ..Default::default()
        },
    })
}
