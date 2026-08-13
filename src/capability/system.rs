//! Host/process observation capabilities. Moved as-is from the original
//! single-file `capability/mod.rs` — bodies unchanged, error type changed
//! from `String` to `CapabilityError`.

use super::error::CapabilityError;
use super::{encode, run};
use std::{fs, path::Path};

pub fn host_summary(root: &Path) -> Result<String, CapabilityError> {
    let uptime = run("uptime", &[]).ok().map(|s| s.trim().to_owned());
    let disk = run("df", &["-k", &root.to_string_lossy()]).ok();
    let memory = if cfg!(target_os = "macos") {
        serde_json::json!({"total_bytes": run("sysctl", &["-n", "hw.memsize"]).ok().map(|s| s.trim().to_owned()), "vm_stat": run("vm_stat", &[]).ok()})
    } else if cfg!(target_os = "linux") {
        serde_json::json!({"proc_meminfo": fs::read_to_string("/proc/meminfo").ok()})
    } else {
        serde_json::json!({"available": false})
    };
    encode(
        "host.summary",
        serde_json::json!({"os": std::env::consts::OS, "arch": std::env::consts::ARCH, "cpu_parallelism": std::thread::available_parallelism().ok().map(|n| n.get()), "uptime": uptime, "memory": memory, "disk": disk}),
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
