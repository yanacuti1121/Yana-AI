//! On-demand malware/virus check for a single downloaded file.
//!
//! Scope, deliberately narrow: this is NOT real-time/background
//! protection (that needs a kernel-level endpoint-security daemon, a
//! different class of product than a Claude Code safety CLI). This is a
//! check the user runs by hand before opening a file they're unsure
//! about — `yana-rt filescan check <path>`.
//!
//! Detection: VirusTotal's hash-lookup API. Only the file's SHA-256 is
//! sent — the file's actual bytes never leave the machine, per
//! 68-principal-confidentiality-law.md (a downloaded file could contain
//! anything; hash-only lookup avoids exfiltrating content for a check
//! that doesn't need it). Requires a free VT_API_KEY the user gets
//! themselves from https://www.virustotal.com/gui/my-apikey — never
//! read, logged, or stored by this tool beyond the single request, per
//! 52-secrets-vault-law.md.

use anyhow::Result;
use clap::Subcommand;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::net::ToSocketAddrs;
use std::path::Path;

const VT_HOST: &str = "www.virustotal.com";
const VT_API_BASE: &str = "https://www.virustotal.com/api/v3/files";
// Hashing an arbitrarily large file blocks the CLI for a long time for no
// added safety value at that size — cap it and tell the user why.
const MAX_FILE_SIZE_BYTES: u64 = 500 * 1024 * 1024;

#[derive(Subcommand, Debug)]
pub enum FilescanAction {
    /// Check a downloaded file against VirusTotal by SHA-256 hash (file content is never uploaded)
    Check {
        /// Path to the file to check
        path: String,
    },
}

pub fn dispatch(action: FilescanAction) {
    let result = match action {
        FilescanAction::Check { path } => cmd_check(&path),
    };
    if let Err(e) = result {
        eprintln!("[filescan] error: {e}");
        std::process::exit(1);
    }
}

fn is_private_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => {
            v4.is_loopback() || v4.is_private() || v4.is_link_local() || v4.is_unspecified()
        }
        std::net::IpAddr::V6(v6) => v6.is_loopback() || v6.is_unspecified(),
    }
}

// Defense in depth per network-egress-law.md: even though VT_HOST is a
// fixed constant (not user input, so classic SSRF doesn't apply the same
// way it does to design::fetch_source's user-supplied URL), a DNS
// hijack/poisoning attack could still redirect a hardcoded hostname
// somewhere unexpected — resolve and reject private/internal targets
// before connecting, matching the pattern already used in src/design/mod.rs.
fn check_host_not_private(host: &str) -> Result<()> {
    let resolved: Vec<_> = format!("{host}:443")
        .to_socket_addrs()
        .map_err(|e| anyhow::anyhow!("DNS resolution failed for '{host}': {e}"))?
        .collect();
    for addr in &resolved {
        if is_private_ip(addr.ip()) {
            anyhow::bail!(
                "egress blocked: '{host}' resolves to private/internal address {} — refusing to send hash lookup",
                addr.ip()
            );
        }
    }
    Ok(())
}

fn sha256_file(path: &Path) -> Result<String> {
    let mut file = std::fs::File::open(path)
        .map_err(|e| anyhow::anyhow!("cannot open file '{}': {e}", path.display()))?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher)?;
    Ok(hex_encode(&hasher.finalize()))
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[derive(Debug, Deserialize)]
struct VtEnvelope {
    data: VtData,
}

#[derive(Debug, Deserialize)]
struct VtData {
    attributes: VtAttributes,
}

#[derive(Debug, Deserialize)]
struct VtAttributes {
    last_analysis_stats: VtStats,
    #[serde(default)]
    last_analysis_results: BTreeMap<String, VtEngineResult>,
    #[serde(default)]
    meaningful_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct VtStats {
    #[serde(default)]
    malicious: u32,
    #[serde(default)]
    suspicious: u32,
    #[serde(default)]
    undetected: u32,
    #[serde(default)]
    harmless: u32,
    #[serde(default)]
    timeout: u32,
}

#[derive(Debug, Deserialize)]
struct VtEngineResult {
    category: String,
    #[serde(default)]
    result: Option<String>,
}

fn cmd_check(path_str: &str) -> Result<()> {
    let path = Path::new(path_str);
    let meta = std::fs::metadata(path)
        .map_err(|e| anyhow::anyhow!("cannot read '{}': {e}", path.display()))?;
    if !meta.is_file() {
        anyhow::bail!("not a regular file: {}", path.display());
    }
    if meta.len() > MAX_FILE_SIZE_BYTES {
        anyhow::bail!(
            "file too large ({} bytes, max {} bytes) — hash it yourself with `shasum -a 256` \
             and look it up at https://www.virustotal.com/gui/home/search",
            meta.len(),
            MAX_FILE_SIZE_BYTES
        );
    }

    let api_key = std::env::var("VT_API_KEY").map_err(|_| {
        anyhow::anyhow!(
            "VT_API_KEY not set. Get a free key at https://www.virustotal.com/gui/my-apikey \
             then run: export VT_API_KEY=your_key_here"
        )
    })?;

    eprintln!("[filescan] hashing {}...", path.display());
    let hash = sha256_file(path)?;
    println!("SHA-256: {hash}");

    check_host_not_private(VT_HOST)?;

    eprintln!("[filescan] querying VirusTotal...");
    let url = format!("{VT_API_BASE}/{hash}");
    let call = ureq::get(&url)
        .header("x-apikey", &api_key)
        .header("User-Agent", "yana-rt/1.3 filescan")
        .call();

    let mut resp = match call {
        Ok(r) => r,
        Err(ureq::Error::StatusCode(404)) => {
            print_unknown(path);
            return Ok(());
        }
        Err(ureq::Error::StatusCode(429)) => {
            anyhow::bail!(
                "VirusTotal rate limit hit (free tier: 4 requests/min, 500/day) — try again shortly"
            );
        }
        Err(ureq::Error::StatusCode(401)) => {
            anyhow::bail!("VirusTotal rejected VT_API_KEY (401) — check the key is correct");
        }
        Err(e) => anyhow::bail!("VirusTotal request failed: {e}"),
    };

    let body_text = resp
        .body_mut()
        .read_to_string()
        .map_err(|e| anyhow::anyhow!("failed to read VirusTotal response body: {e}"))?;
    let parsed: VtEnvelope = serde_json::from_str(&body_text)
        .map_err(|e| anyhow::anyhow!("failed to parse VirusTotal response: {e}"))?;

    print_result(path, &hash, &parsed);
    Ok(())
}

fn print_unknown(path: &Path) {
    println!();
    println!("UNKNOWN — this file's hash has never been submitted to VirusTotal.");
    println!("This does NOT mean it's safe — it means no one has scanned this exact file before.");
    println!(
        "Recommendation: do not open '{}' unless you trust the source.",
        path.display()
    );
    println!("For certainty, submit it for a full scan: https://www.virustotal.com/gui/home/upload");
}

fn print_result(path: &Path, hash: &str, resp: &VtEnvelope) {
    let stats = &resp.data.attributes.last_analysis_stats;
    let flagged = stats.malicious + stats.suspicious;
    let total = stats.malicious + stats.suspicious + stats.undetected + stats.harmless + stats.timeout;

    println!();
    if flagged > 0 {
        println!("FLAGGED — do not open: {}", path.display());
        println!("  {flagged}/{total} engines flagged this as malicious/suspicious:");
        for (engine, result) in &resp.data.attributes.last_analysis_results {
            if result.category == "malicious" || result.category == "suspicious" {
                println!(
                    "  - {engine}: {} ({})",
                    result.category,
                    result.result.as_deref().unwrap_or("?")
                );
            }
        }
    } else {
        println!("CLEAN — {}/{total} engines checked, none flagged it.", stats.harmless + stats.undetected);
    }
    println!("  Hash: {hash}");
    if let Some(name) = &resp.data.attributes.meaningful_name {
        println!("  Known filename on VirusTotal: {name}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn sha256_matches_known_vector() {
        // SHA-256("abc") — a standard, published test vector (FIPS 180-2 Appendix B.1)
        let mut f = tempfile::NamedTempFile::new().unwrap();
        f.write_all(b"abc").unwrap();
        let hash = sha256_file(f.path()).unwrap();
        assert_eq!(
            hash,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn sha256_empty_file() {
        let f = tempfile::NamedTempFile::new().unwrap();
        let hash = sha256_file(f.path()).unwrap();
        // SHA-256 of zero bytes — another published test vector
        assert_eq!(
            hash,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn sha256_missing_file_errors() {
        let result = sha256_file(Path::new("/nonexistent/path/does-not-exist"));
        assert!(result.is_err());
    }

    #[test]
    fn is_private_ip_detects_loopback_and_rfc1918() {
        assert!(is_private_ip("127.0.0.1".parse().unwrap()));
        assert!(is_private_ip("10.0.0.1".parse().unwrap()));
        assert!(is_private_ip("192.168.1.1".parse().unwrap()));
        assert!(is_private_ip("169.254.169.254".parse().unwrap())); // cloud metadata
        assert!(!is_private_ip("8.8.8.8".parse().unwrap()));
    }

    #[test]
    fn hex_encode_produces_lowercase_hex() {
        assert_eq!(hex_encode(&[0xab, 0xcd, 0x01]), "abcd01");
    }
}
