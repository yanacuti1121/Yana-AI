//! Linux host telemetry mechanisms — extracted from `os::monitor` (Phase
//! 2 of the host-native-os program) with zero behavior change. Same
//! `/proc`, `/sys/class/drm`, and `df` reads, same parsing, same
//! fallback semantics (unavailable telemetry stays `None` + a warning,
//! never a fabricated value).

#[cfg(target_os = "linux")]
use super::super::{nvidia_gpus, run};
#[cfg(target_os = "linux")]
use crate::os::monitor::{CpuSnapshot, DiskSnapshot, GpuSnapshot, MemorySnapshot};
#[cfg(target_os = "linux")]
use std::fs;
#[cfg(target_os = "linux")]
use std::path::Path;
#[cfg(target_os = "linux")]
use std::thread;
#[cfg(target_os = "linux")]
use std::time::Duration;

#[cfg(target_os = "linux")]
pub fn collect_cpu(warnings: &mut Vec<String>) -> CpuSnapshot {
    let logical_cores = std::thread::available_parallelism().map_or(1, usize::from);
    let first = fs::read_to_string("/proc/stat")
        .ok()
        .and_then(|text| parse_proc_cpu(&text));
    thread::sleep(Duration::from_millis(100));
    let second = fs::read_to_string("/proc/stat")
        .ok()
        .and_then(|text| parse_proc_cpu(&text));
    let utilization_percent = first.zip(second).and_then(|(a, b)| cpu_delta(a, b));
    if utilization_percent.is_none() {
        warnings.push("Linux CPU utilization unavailable from /proc/stat".into());
    }
    let load_average_1m = fs::read_to_string("/proc/loadavg")
        .ok()
        .and_then(|text| text.split_whitespace().next()?.parse().ok());
    CpuSnapshot {
        logical_cores,
        utilization_percent,
        load_average_1m,
        source: "/proc".into(),
    }
}

#[cfg(target_os = "linux")]
pub fn collect_memory(warnings: &mut Vec<String>) -> MemorySnapshot {
    match fs::read_to_string("/proc/meminfo")
        .ok()
        .and_then(|text| parse_proc_meminfo(&text))
    {
        Some((total, available)) => MemorySnapshot {
            total_bytes: Some(total),
            used_bytes: Some(total.saturating_sub(available)),
            source: "/proc/meminfo".into(),
        },
        None => {
            warnings.push("Linux memory telemetry unavailable from /proc/meminfo".into());
            MemorySnapshot {
                total_bytes: None,
                used_bytes: None,
                source: "/proc/meminfo".into(),
            }
        }
    }
}

#[cfg(target_os = "linux")]
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

#[cfg(target_os = "linux")]
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

#[cfg(target_os = "linux")]
fn platform_gpus() -> Vec<GpuSnapshot> {
    let mut gpus = Vec::new();
    let Ok(entries) = fs::read_dir("/sys/class/drm") else {
        return gpus;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with("card") || name.contains('-') {
            continue;
        }
        let vendor = fs::read_to_string(entry.path().join("device/vendor"))
            .ok()
            .map(|v| pci_vendor(v.trim()).into());
        let device = fs::read_to_string(entry.path().join("device/device"))
            .ok()
            .map(|v| v.trim().to_string())
            .unwrap_or_else(|| "unknown".into());
        gpus.push(GpuSnapshot {
            name: format!("{name} ({device})"),
            vendor,
            utilization_percent: None,
            memory_total_bytes: None,
            memory_used_bytes: None,
            source: "sysfs-drm".into(),
            status: "inventory-only".into(),
        });
    }
    gpus
}

#[cfg(target_os = "linux")]
fn pci_vendor(id: &str) -> &'static str {
    match id.trim_start_matches("0x") {
        "10de" => "NVIDIA",
        "1002" => "AMD",
        "8086" => "Intel",
        _ => "Unknown",
    }
}

#[cfg(any(test, target_os = "linux"))]
fn parse_proc_cpu(text: &str) -> Option<(u64, u64)> {
    let line = text.lines().find(|line| line.starts_with("cpu "))?;
    let values: Vec<u64> = line
        .split_whitespace()
        .skip(1)
        .filter_map(|v| v.parse().ok())
        .collect();
    if values.len() < 4 {
        return None;
    }
    let idle = values[3] + values.get(4).copied().unwrap_or(0);
    Some((values.iter().sum(), idle))
}

#[cfg(any(test, target_os = "linux"))]
fn cpu_delta(first: (u64, u64), second: (u64, u64)) -> Option<f64> {
    let total = second.0.checked_sub(first.0)?;
    let idle = second.1.checked_sub(first.1)?;
    (total > 0).then(|| ((total - idle) as f64 / total as f64) * 100.0)
}

#[cfg(any(test, target_os = "linux"))]
fn parse_proc_meminfo(text: &str) -> Option<(u64, u64)> {
    let value = |key: &str| {
        text.lines()
            .find(|line| line.starts_with(key))?
            .split_whitespace()
            .nth(1)?
            .parse::<u64>()
            .ok()
            .map(|kb| kb * 1024)
    };
    Some((value("MemTotal:")?, value("MemAvailable:")?))
}

#[cfg(any(test, target_os = "linux"))]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_linux_cpu_and_memory() {
        let first = parse_proc_cpu("cpu  10 1 5 84 0 0 0 0\n").unwrap();
        let second = parse_proc_cpu("cpu  20 1 10 169 0 0 0 0\n").unwrap();
        assert!((cpu_delta(first, second).unwrap() - 15.0).abs() < f64::EPSILON);
        assert_eq!(
            parse_proc_meminfo("MemTotal: 1000 kB\nMemAvailable: 250 kB\n"),
            Some((1_024_000, 256_000))
        );
    }

    #[test]
    fn parses_disk() {
        assert_eq!(
            parse_df("Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/x 100 40 60 40% /\n"),
            Some((102_400, 61_440))
        );
    }
}
