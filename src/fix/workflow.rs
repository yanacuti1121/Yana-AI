//! Indentation-aware line edits for GitHub workflow files.
//!
//! A job is located by its `runs-on:` line. Its block runs from the job header
//! (exclusive) to the next line indented less than `runs-on:`. New job-level
//! keys are written at the indentation of `runs-on:` itself, right after its
//! value (which may span several lines), so they land at job level whatever
//! indent style the file uses. Original line endings and a missing final
//! newline are preserved. Nothing here parses YAML; the acceptance tests check
//! the result with a real YAML parser.

use std::collections::BTreeMap;

/// A job found through its `runs-on:` line; all fields are line indices.
struct Job {
    indent: usize,
    runs_on: usize,
    start: usize,
    end: usize,
}

fn body(line: &str) -> &str {
    line.trim_end_matches(['\r', '\n'])
}

fn indent_of(line: &str) -> usize {
    body(line).len() - body(line).trim_start_matches(' ').len()
}

fn is_blank_or_comment(line: &str) -> bool {
    let t = body(line).trim();
    t.is_empty() || t.starts_with('#')
}

fn find_jobs(lines: &[&str]) -> Vec<Job> {
    let mut jobs = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        if !body(line).trim_start().starts_with("runs-on:") {
            continue;
        }
        let indent = indent_of(line);
        let mut start = i;
        while start > 0 && (is_blank_or_comment(lines[start - 1]) || indent_of(lines[start - 1]) >= indent) {
            start -= 1;
        }
        let mut end = i + 1;
        while end < lines.len() && (is_blank_or_comment(lines[end]) || indent_of(lines[end]) >= indent) {
            end += 1;
        }
        jobs.push(Job { indent, runs_on: i, start, end });
    }
    jobs
}

/// True when the job has `key` (e.g. `timeout-minutes:`) at job level.
fn has_key(lines: &[&str], job: &Job, key: &str) -> bool {
    lines[job.start..job.end]
        .iter()
        .any(|l| indent_of(l) == job.indent && body(l).trim_start().starts_with(key))
}

/// Line index just after the value of `runs-on:` (a list value spans lines).
fn after_runs_on(lines: &[&str], job: &Job) -> usize {
    let mut p = job.runs_on + 1;
    while p < job.end && !is_blank_or_comment(lines[p]) && indent_of(lines[p]) > job.indent {
        p += 1;
    }
    p
}

/// Inserts `decide(..)`'s text after each job's `runs-on:`; returns the new
/// content and how many jobs changed.
fn insert_per_job(content: &str, decide: impl Fn(&[&str], &Job) -> Option<&'static str>) -> (String, usize) {
    let lines: Vec<&str> = content.split_inclusive('\n').collect();
    let mut inserts: BTreeMap<usize, Vec<String>> = BTreeMap::new();
    for job in find_jobs(&lines) {
        if let Some(text) = decide(&lines, &job) {
            let eol = if lines[job.runs_on].ends_with("\r\n") { "\r\n" } else { "\n" };
            let line = format!("{}{text}{eol}", " ".repeat(job.indent));
            inserts.entry(after_runs_on(&lines, &job)).or_default().push(line);
        }
    }
    let changed = inserts.values().map(Vec::len).sum();
    if changed == 0 {
        return (content.to_string(), 0);
    }
    let mut out = String::with_capacity(content.len() + changed * 32);
    for (i, line) in lines.iter().enumerate() {
        if let Some(new) = inserts.get(&i) {
            new.iter().for_each(|l| out.push_str(l));
        }
        out.push_str(line);
        if i + 1 == lines.len() && !line.ends_with('\n') && inserts.contains_key(&lines.len()) {
            out.push('\n');
        }
    }
    if let Some(new) = inserts.get(&lines.len()) {
        new.iter().for_each(|l| out.push_str(l));
    }
    if !content.ends_with('\n') && out.ends_with('\n') {
        out.pop();
        if out.ends_with('\r') {
            out.pop();
        }
    }
    (out, changed)
}

/// Adds `timeout-minutes: 30` to every job that has none.
pub fn add_job_timeouts(content: &str) -> (String, usize) {
    insert_per_job(content, |lines, job| {
        (!has_key(lines, job, "timeout-minutes:")).then_some("timeout-minutes: 30")
    })
}

/// Adds `environment: production` once to every job that runs a publish
/// command (in a non-comment line) and has no `environment:` of its own.
pub fn add_job_environment(content: &str, publish_patterns: &[&str]) -> (String, usize) {
    insert_per_job(content, |lines, job| {
        let publishes = lines[job.start..job.end]
            .iter()
            .any(|l| !is_blank_or_comment(l) && publish_patterns.iter().any(|p| l.contains(p)));
        (publishes && !has_key(lines, job, "environment:")).then_some("environment: production")
    })
}

#[cfg(test)]
mod tests;
