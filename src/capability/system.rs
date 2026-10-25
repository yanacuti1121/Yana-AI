//! Host/process observation capabilities. Moved as-is from the original
//! single-file `capability/mod.rs` — bodies unchanged, error type changed
//! from `String` to `CapabilityError`.
//!
//! Phase 16 of the host-native-os program (Client Boundary): `host_summary`
//! used to re-derive os/arch/cpu/memory itself via raw, macOS/Linux-only
//! shell-outs (`sysctl -n hw.memsize`, `/proc/meminfo`, with no Windows
//! path at all — just `{"available": false}`). That duplicated exactly
//! what `os::resource::topology::collect()` (Phase 5) already does
//! correctly and cross-platform, including real Windows telemetry. Now
//! sourced from there — this file's own module doc already states the
//! rule this violated: "AD-11: no per-client duplicate logic." `uptime`
//! and `disk` stay as direct shell-outs — `os::` has no equivalent for
//! either, so there is nothing to migrate them to.

use super::error::CapabilityError;
use super::{encode, run};
use std::path::Path;

pub fn host_summary(root: &Path) -> Result<String, CapabilityError> {
    let uptime = run("uptime", &[]).ok().map(|s| s.trim().to_owned());
    let disk = run("df", &["-k", &root.to_string_lossy()]).ok();
    let (os, arch, cpu_parallelism, memory) = match crate::os::resource::topology::collect() {
        Ok(topology) => (
            topology.os,
            topology.arch,
            Some(topology.cpu_logical_cores),
            serde_json::json!({
                "total_bytes": topology.memory_total_bytes,
                "model": topology.memory_model,
            }),
        ),
        Err(_) => (
            std::env::consts::OS.to_string(),
            std::env::consts::ARCH.to_string(),
            std::thread::available_parallelism().ok().map(|n| n.get()),
            serde_json::json!({"available": false}),
        ),
    };
    encode(
        "host.summary",
        serde_json::json!({"os": os, "arch": arch, "cpu_parallelism": cpu_parallelism, "uptime": uptime, "memory": memory, "disk": disk}),
        false,
    )
}

pub fn list_processes(sort: &str, limit: usize) -> Result<String, CapabilityError> {
    if !cfg!(unix) {
        return Err(CapabilityError::Unsupported {
            detail: "process listing supports macOS/Linux only".into(),
        });
    }
    // Column index of the sort key in the row `ps` prints (pid ppid pcpu pmem etime comm).
    // Sorting happens here, not through a `ps` flag: `-pcpu` is Linux syntax and BSD/macOS `ps`
    // reads it as a pid list ("ps: Invalid process id: mem").
    let key_column = match sort {
        "cpu" => 2,
        "memory" => 3,
        _ => {
            return Err(CapabilityError::InvalidInput {
                detail: "sort must be cpu or memory".into(),
            })
        }
    };
    let text = run("ps", &["-axo", "pid=,ppid=,pcpu=,pmem=,etime=,comm="])?;
    let all = sort_rows_descending(text.lines(), key_column);
    let limit = limit.clamp(1, 100);
    let truncated = all.len() > limit;
    encode(
        "process.list",
        serde_json::json!({"sort": sort, "rows": all.into_iter().take(limit).collect::<Vec<_>>()}),
        truncated,
    )
}

/// Rows ordered by the numeric value of `column` (largest first); rows whose value cannot be
/// parsed sort last. The sort is stable, so equal values keep the order `ps` printed them in.
fn sort_rows_descending<'a>(rows: impl Iterator<Item = &'a str>, column: usize) -> Vec<String> {
    let mut keyed: Vec<(f64, String)> = rows
        .filter(|row| !row.trim().is_empty())
        .map(|row| {
            let value = row
                .split_whitespace()
                .nth(column)
                .and_then(|field| field.parse::<f64>().ok())
                .unwrap_or(f64::NEG_INFINITY);
            (value, row.to_owned())
        })
        .collect();
    keyed.sort_by(|a, b| b.0.total_cmp(&a.0));
    keyed.into_iter().map(|(_, row)| row).collect()
}

pub fn process_details(pid: u32) -> Result<String, CapabilityError> {
    if pid == 0 {
        return Err(CapabilityError::InvalidInput {
            detail: "pid must be greater than zero".into(),
        });
    }
    let output = run(
        "ps",
        &[
            "-p",
            &pid.to_string(),
            "-o",
            "pid=,ppid=,user=,pcpu=,pmem=,etime=,command=",
        ],
    )?;
    if output.trim().is_empty() {
        return Err(CapabilityError::NotFound {
            requested: format!("pid {pid}"),
        });
    }
    encode(
        "process.inspect",
        serde_json::json!({"pid": pid, "output": output.trim()}),
        false,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn host_summary_reports_real_memory_sourced_from_os_resource_topology_not_a_raw_reprobe() {
        // Live, on this real machine: proves host_summary's "memory" field
        // now genuinely comes from os::resource::topology::collect() --
        // matching the exact same total_bytes topology itself reports --
        // rather than a second, independent sysctl/proc_meminfo read that
        // could silently drift from it.
        let topology = crate::os::resource::topology::collect().unwrap();
        let summary_json = host_summary(std::path::Path::new(".")).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&summary_json).unwrap();
        let data = &parsed["data"];
        assert_eq!(data["os"], topology.os);
        assert_eq!(data["arch"], topology.arch);
        assert_eq!(
            data["cpu_parallelism"],
            serde_json::json!(topology.cpu_logical_cores)
        );
        assert_eq!(
            data["memory"]["total_bytes"],
            serde_json::json!(topology.memory_total_bytes)
        );
    }

    #[test]
    fn sort_rows_descending_orders_by_the_chosen_column_and_puts_unparsable_last() {
        let rows = [
            "10 1 0.5 9.0 00:10 alpha",
            "11 1 7.25 1.0 00:11 beta",
            "12 1 not-a-number 5.0 00:12 gamma",
            "13 1 3.0 20.0 00:13 delta",
        ];
        let by_cpu = sort_rows_descending(rows.iter().copied(), 2);
        assert_eq!(by_cpu[0], rows[1]);
        assert_eq!(by_cpu[1], rows[3]);
        assert_eq!(by_cpu[2], rows[0]);
        assert_eq!(by_cpu[3], rows[2]);
        let by_memory = sort_rows_descending(rows.iter().copied(), 3);
        assert_eq!(by_memory[0], rows[3]);
        assert_eq!(by_memory[1], rows[0]);
        assert!(sort_rows_descending(std::iter::empty(), 2).is_empty());
    }

    #[test]
    fn list_processes_works_on_this_host_for_both_sort_keys() {
        // Regression: passing `-pcpu` / `-pmem` to BSD `ps` (macOS) failed with "Invalid process id".
        for sort in ["cpu", "memory"] {
            let json =
                list_processes(sort, 5).expect("ps must accept the listing on macOS and Linux");
            let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
            let rows = parsed["data"]["rows"].as_array().unwrap();
            assert!(
                !rows.is_empty() && rows.len() <= 5,
                "{sort}: {} rows",
                rows.len()
            );
        }
        assert!(list_processes("bogus", 5).is_err());
    }
}
