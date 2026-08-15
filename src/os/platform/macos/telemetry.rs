//! macOS host telemetry mechanisms — extracted from `os::monitor` (Phase
//! 2 of the host-native-os program) with zero behavior change. Every
//! function here is a straight move: same shell-outs (`sysctl`, `ps`,
//! `vm_stat`, `df`, `system_profiler`), same parsing, same fallback
//! semantics (unavailable telemetry stays `None` + a warning, never a
//! fabricated value).

#[cfg(target_os = "macos")]
use super::super::{nvidia_gpus, run};
#[cfg(any(test, target_os = "macos"))]
use crate::os::monitor::GpuSnapshot;
#[cfg(target_os = "macos")]
use crate::os::monitor::{CpuSnapshot, DiskSnapshot, MemorySnapshot};
#[cfg(any(test, target_os = "macos"))]
use serde_json::Value;
#[cfg(target_os = "macos")]
use std::path::Path;

#[cfg(target_os = "macos")]
pub fn collect_cpu(warnings: &mut Vec<String>) -> CpuSnapshot {
    let logical_cores = run("sysctl", &["-n", "hw.logicalcpu"])
        .ok()
        .filter(|output| output.success)
        .and_then(|output| output.stdout.trim().parse().ok())
        .unwrap_or_else(|| std::thread::available_parallelism().map_or(1, usize::from));
    let utilization_percent = run("ps", &["-A", "-o", "%cpu="])
        .ok()
        .filter(|output| output.success)
        .map(|output| {
            output
                .stdout
                .lines()
                .filter_map(|line| line.trim().parse::<f64>().ok())
                .sum::<f64>()
                / logical_cores.max(1) as f64
        })
        .map(|value| value.clamp(0.0, 100.0));
    if utilization_percent.is_none() {
        warnings.push("macOS CPU utilization unavailable from ps".into());
    }
    let load_average_1m = run("sysctl", &["-n", "vm.loadavg"])
        .ok()
        .and_then(|output| {
            output
                .stdout
                .trim_matches(|character| character == '{' || character == '}')
                .split_whitespace()
                .next()?
                .parse()
                .ok()
        });
    CpuSnapshot {
        logical_cores,
        utilization_percent,
        load_average_1m,
        source: "sysctl+ps".into(),
    }
}

#[cfg(target_os = "macos")]
pub fn collect_memory(warnings: &mut Vec<String>) -> MemorySnapshot {
    let total = run("sysctl", &["-n", "hw.memsize"])
        .ok()
        .filter(|o| o.success)
        .and_then(|o| o.stdout.trim().parse::<u64>().ok());
    let vm = run("vm_stat", &[])
        .ok()
        .filter(|o| o.success)
        .and_then(|o| parse_vm_stat(&o.stdout));
    let total = total.or_else(|| vm.map(|value| value.0));
    let used = vm.map(|value| value.1);
    if total.is_none() || used.is_none() {
        warnings.push("macOS memory telemetry is incomplete".into());
    }
    MemorySnapshot {
        total_bytes: total,
        used_bytes: used,
        source: "sysctl+vm_stat".into(),
    }
}

#[cfg(target_os = "macos")]
pub fn collect_disk(root: &Path, warnings: &mut Vec<String>) -> DiskSnapshot {
    let root_text = root.to_string_lossy();
    if let Ok(output) = run("df", &["-kP", &root_text]) {
        if output.success {
            if let Some((total, available)) = parse_df(&output.stdout) {
                return DiskSnapshot {
                    total_bytes: Some(total),
                    available_bytes: Some(available),
                    source: "df".into(),
                };
            }
        }
    }
    warnings.push("disk telemetry unavailable from df".into());
    DiskSnapshot {
        total_bytes: None,
        available_bytes: None,
        source: "df".into(),
    }
}

#[cfg(target_os = "macos")]
pub fn collect_gpus(warnings: &mut Vec<String>) -> Vec<GpuSnapshot> {
    if let Some(gpus) = nvidia_gpus() {
        return gpus;
    }
    let gpus = platform_gpus();
    if gpus.is_empty() {
        warnings.push("GPU inventory unavailable; no supported native adapter was detected".into());
    }
    gpus
}

#[cfg(target_os = "macos")]
fn platform_gpus() -> Vec<GpuSnapshot> {
    let output = match run("system_profiler", &["SPDisplaysDataType", "-json"]) {
        Ok(o) if o.success => o,
        _ => return Vec::new(),
    };
    parse_macos_gpus(&output.stdout)
}

#[cfg(any(test, target_os = "macos"))]
fn parse_vm_stat(text: &str) -> Option<(u64, u64)> {
    let page_size = text
        .lines()
        .next()?
        .split_whitespace()
        .find_map(|word| word.trim_end_matches('.').parse::<u64>().ok())?;
    let pages = |name: &str| {
        text.lines()
            .find(|line| line.starts_with(name))?
            .split(':')
            .nth(1)?
            .trim()
            .trim_end_matches('.')
            .parse::<u64>()
            .ok()
    };
    let free = pages("Pages free")?;
    let speculative = pages("Pages speculative").unwrap_or(0);
    let active = pages("Pages active")?;
    let inactive = pages("Pages inactive").unwrap_or(0);
    let wired = pages("Pages wired down")?;
    let compressed = pages("Pages occupied by compressor").unwrap_or(0);
    let total_pages = free + speculative + active + inactive + wired + compressed;
    let used_pages = total_pages.saturating_sub(free + speculative);
    Some((total_pages * page_size, used_pages * page_size))
}

#[cfg(any(test, target_os = "macos"))]
fn parse_df(text: &str) -> Option<(u64, u64)> {
    let fields: Vec<_> = text.lines().last()?.split_whitespace().collect();
    if fields.len() < 6 {
        return None;
    }
    Some((
        fields[1].parse::<u64>().ok()? * 1024,
        fields[3].parse::<u64>().ok()? * 1024,
    ))
}

#[cfg(any(test, target_os = "macos"))]
fn parse_macos_gpus(text: &str) -> Vec<GpuSnapshot> {
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return Vec::new();
    };
    value
        .get("SPDisplaysDataType")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let name = item.get("sppci_model")?.as_str()?.to_string();
            let memory = item
                .get("spdisplays_vram")
                .and_then(Value::as_str)
                .and_then(parse_human_bytes);
            Some(GpuSnapshot {
                name,
                vendor: item
                    .get("spdisplays_vendor")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                utilization_percent: None,
                memory_total_bytes: memory,
                memory_used_bytes: None,
                source: "system_profiler".into(),
                status: "inventory-only".into(),
            })
        })
        .collect()
}

#[cfg(any(test, target_os = "macos"))]
fn parse_human_bytes(text: &str) -> Option<u64> {
    let mut fields = text.split_whitespace();
    let value = fields.next()?.parse::<f64>().ok()?;
    let multiplier = match fields.next()?.to_ascii_uppercase().as_str() {
        "MB" => 1024u64.pow(2),
        "GB" => 1024u64.pow(3),
        _ => return None,
    };
    Some((value * multiplier as f64) as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_disk_and_gpu_without_fake_usage() {
        assert_eq!(
            parse_df("Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/x 100 40 60 40% /\n"),
            Some((102_400, 61_440))
        );
        let gpus = parse_macos_gpus(
            r#"{"SPDisplaysDataType":[{"sppci_model":"Apple M4","spdisplays_vendor":"Apple","spdisplays_vram":"16 GB"}]}"#,
        );
        assert_eq!(gpus.len(), 1);
        assert_eq!(gpus[0].memory_total_bytes, Some(16 * 1024u64.pow(3)));
        assert_eq!(gpus[0].utilization_percent, None);
    }

    #[test]
    fn vm_stat_provides_a_sandbox_safe_total_memory_fallback() {
        let value = parse_vm_stat(
            "Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free: 10.\nPages active: 20.\nPages inactive: 30.\nPages speculative: 5.\nPages wired down: 10.\nPages occupied by compressor: 5.\n",
        )
        .unwrap();
        assert_eq!(value, (80 * 16_384, 65 * 16_384));
    }
}
