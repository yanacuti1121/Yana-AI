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
    let key = match sort {
        "cpu" => "-pcpu",
        "memory" => "-pmem",
        _ => {
            return Err(CapabilityError::InvalidInput {
                detail: "sort must be cpu or memory".into(),
            })
        }
    };
    let text = run("ps", &["-axo", "pid=,ppid=,pcpu=,pmem=,etime=,comm=", key])?;
    let all = text.lines().map(str::to_owned).collect::<Vec<_>>();
    let limit = limit.clamp(1, 100);
    let truncated = all.len() > limit;
    encode(
        "process.list",
        serde_json::json!({"sort": sort, "rows": all.into_iter().take(limit).collect::<Vec<_>>()}),
        truncated,
    )
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
}
