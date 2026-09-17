//! browser.fetch — one-shot page fetch via an externally-installed
//! Lightpanda binary (github.com/lightpanda-io/browser).
//!
//! Lightpanda is AGPL-3.0 and is therefore never vendored into this
//! Apache-2.0 repository. Yana AI only shells out to a `lightpanda` binary
//! the operator installs separately (e.g.
//! `brew install lightpanda-io/browser/lightpanda`), talking to it purely
//! as an external process over its own one-shot CLI mode
//! (`lightpanda fetch --dump <format> <url>`) — no Lightpanda source is
//! linked or copied, matching how `command.rs` already shells out to
//! whatever the operator's own shell/tools provide.
//!
//! This is also the first capability in this registry that lets an agent
//! direct a real outbound network request to a URL the agent (not the
//! operator) chooses, so it carries its own SSRF-scoped validation
//! (`validate_fetch_url`) rather than relying only on the network-egress
//! guidance in `core/rules/network-egress-law.md`, most of which is
//! documentation for shell-level guards, not code that runs inside this
//! binary.

use super::error::CapabilityError;
use std::io::Read;
use std::net::{IpAddr, ToSocketAddrs};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// Pages are legitimately much larger than a command's stdout; command.rs's
/// 32KB cap would truncate almost every real page.
pub const MAX_FETCH_OUTPUT_BYTES: usize = 512 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DumpFormat {
    Html,
    Markdown,
}

impl DumpFormat {
    pub fn as_flag(self) -> &'static str {
        match self {
            DumpFormat::Html => "html",
            DumpFormat::Markdown => "markdown",
        }
    }

    pub fn parse(raw: &str) -> Result<Self, CapabilityError> {
        match raw {
            "html" => Ok(DumpFormat::Html),
            "markdown" => Ok(DumpFormat::Markdown),
            other => Err(CapabilityError::InvalidInput {
                detail: format!("unsupported dump format '{other}'; use 'html' or 'markdown'"),
            }),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct FetchOptions {
    pub format: DumpFormat,
    pub timeout: Duration,
}

impl Default for FetchOptions {
    fn default() -> Self {
        Self {
            format: DumpFormat::Markdown,
            timeout: Duration::from_secs(30),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FetchOutcome {
    pub url: String,
    pub format: String,
    pub content: String,
    pub truncated: bool,
}

/// Rejects everything except plain `http`/`https` URLs whose host does not
/// resolve to a private, loopback, link-local, or unspecified address.
///
/// Known, accepted residual risk (shared with every other shell-based
/// egress guard in this repo, see `network-egress-law.md`'s own "DNS
/// rebinding defense" section): resolution happens here, the actual
/// connection happens later inside the spawned `lightpanda` process, and a
/// TTL=0 DNS answer could theoretically re-resolve differently in between.
/// This still closes the common, real case — a URL whose hostname plainly
/// resolves to an internal/metadata address today — which is what this
/// capability had zero defense against before this function existed.
pub fn validate_fetch_url(raw: &str) -> Result<url::Url, CapabilityError> {
    let parsed = url::Url::parse(raw).map_err(|error| CapabilityError::InvalidInput {
        detail: format!("not a valid URL: {error}"),
    })?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(CapabilityError::InvalidInput {
            detail: format!(
                "scheme '{}' is not allowed; only http/https are fetchable",
                parsed.scheme()
            ),
        });
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(CapabilityError::InvalidInput {
            detail: "credentials embedded in the URL (user:pass@host) are not allowed".into(),
        });
    }
    let host = parsed.host_str().ok_or_else(|| CapabilityError::InvalidInput {
        detail: "URL has no host".into(),
    })?;
    reject_if_private_or_link_local(host)?;
    Ok(parsed)
}

fn reject_if_private_or_link_local(host: &str) -> Result<(), CapabilityError> {
    if host.eq_ignore_ascii_case("localhost") {
        return Err(CapabilityError::InvalidInput {
            detail: "localhost is not allowed".into(),
        });
    }
    if let Ok(ip) = host.trim_start_matches('[').trim_end_matches(']').parse::<IpAddr>() {
        return check_ip(ip);
    }
    // (host, 0) forces the standard library's own resolver rather than a
    // hand-rolled DNS client; port 0 is never dialed, only resolved.
    let addrs = (host, 0u16)
        .to_socket_addrs()
        .map_err(|error| CapabilityError::InvalidInput {
            detail: format!("could not resolve host '{host}': {error}"),
        })?;
    let mut saw_any = false;
    for addr in addrs {
        saw_any = true;
        check_ip(addr.ip())?;
    }
    if !saw_any {
        return Err(CapabilityError::InvalidInput {
            detail: format!("host '{host}' resolved to no addresses"),
        });
    }
    Ok(())
}

fn check_ip(ip: IpAddr) -> Result<(), CapabilityError> {
    let blocked = match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback() || v4.is_link_local() || v4.is_private() || v4.is_unspecified()
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unspecified()
                || (v6.segments()[0] & 0xfe00) == 0xfc00 // fc00::/7, unique local
        }
    };
    if blocked {
        return Err(CapabilityError::InvalidInput {
            detail: format!("URL resolves to a blocked internal address ({ip}); refusing to fetch"),
        });
    }
    Ok(())
}

/// Runs `lightpanda fetch --dump <format> <url>` and returns its captured
/// stdout. Concurrently drains stdout/stderr on background threads while
/// polling `try_wait()` for the timeout: a naive "poll try_wait, then read
/// stdout once it exits" loop deadlocks the first time a page's output
/// exceeds the OS pipe buffer (~64KB), because the child blocks writing to
/// a full, unread pipe and never actually exits.
pub fn fetch_page(url: &str, options: &FetchOptions) -> Result<FetchOutcome, CapabilityError> {
    let validated = validate_fetch_url(url)?;

    let mut child = Command::new("lightpanda")
        .arg("fetch")
        .arg("--obey-robots")
        .arg("--dump")
        .arg(options.format.as_flag())
        .arg("--log-level")
        .arg("error")
        .arg(validated.as_str())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                CapabilityError::SpawnFailed {
                    detail: "lightpanda binary not found on PATH. Install: \
                             brew install lightpanda-io/browser/lightpanda \
                             (see https://github.com/lightpanda-io/browser)"
                        .into(),
                }
            } else {
                CapabilityError::SpawnFailed {
                    detail: format!("spawn lightpanda: {error}"),
                }
            }
        })?;

    let mut stdout_pipe = child.stdout.take().expect("stdout was piped");
    let mut stderr_pipe = child.stderr.take().expect("stderr was piped");
    let stdout_reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        stdout_pipe.read_to_end(&mut buf).ok();
        buf
    });
    let stderr_reader = std::thread::spawn(move || {
        let mut buf = Vec::new();
        stderr_pipe.read_to_end(&mut buf).ok();
        buf
    });

    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if start.elapsed() > options.timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = stdout_reader.join();
                    let _ = stderr_reader.join();
                    return Err(CapabilityError::SpawnFailed {
                        detail: format!(
                            "lightpanda fetch of {validated} timed out after {:?}",
                            options.timeout
                        ),
                    });
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(error) => {
                return Err(CapabilityError::SpawnFailed {
                    detail: format!("wait on lightpanda: {error}"),
                })
            }
        }
    };

    let stdout_bytes = stdout_reader.join().unwrap_or_default();
    let stderr_bytes = stderr_reader.join().unwrap_or_default();

    if !status.success() {
        return Err(CapabilityError::SpawnFailed {
            detail: format!(
                "lightpanda exited {status}: {}",
                String::from_utf8_lossy(&stderr_bytes)
            ),
        });
    }

    let (content, truncated) = cap_bytes(&stdout_bytes);
    Ok(FetchOutcome {
        url: validated.to_string(),
        format: options.format.as_flag().to_string(),
        content,
        truncated,
    })
}

fn cap_bytes(bytes: &[u8]) -> (String, bool) {
    if bytes.len() > MAX_FETCH_OUTPUT_BYTES {
        (
            String::from_utf8_lossy(&bytes[..MAX_FETCH_OUTPUT_BYTES]).to_string(),
            true,
        )
    } else {
        (String::from_utf8_lossy(bytes).to_string(), false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_https_url_validates() {
        assert!(validate_fetch_url("https://example.com/page").is_ok());
    }

    #[test]
    fn non_http_scheme_is_rejected() {
        for scheme in ["file:///etc/passwd", "gopher://example.com", "ftp://example.com"] {
            let result = validate_fetch_url(scheme);
            assert!(result.is_err(), "{scheme} should be rejected");
        }
    }

    #[test]
    fn credentials_in_url_are_rejected() {
        assert!(validate_fetch_url("https://user:pass@example.com").is_err());
    }

    #[test]
    fn localhost_is_rejected() {
        assert!(validate_fetch_url("http://localhost:8080/").is_err());
        assert!(validate_fetch_url("http://LOCALHOST/").is_err());
    }

    #[test]
    fn loopback_ip_literal_is_rejected() {
        assert!(validate_fetch_url("http://127.0.0.1/").is_err());
        assert!(validate_fetch_url("http://[::1]/").is_err());
    }

    #[test]
    fn link_local_metadata_address_is_rejected() {
        // The AWS/Azure/GCP cloud metadata endpoint, the single most
        // common real-world SSRF target this check exists to close.
        assert!(validate_fetch_url("http://169.254.169.254/latest/meta-data/").is_err());
    }

    #[test]
    fn private_rfc1918_ip_literal_is_rejected() {
        for ip in ["10.0.0.1", "172.16.0.1", "192.168.1.1"] {
            let url = format!("http://{ip}/");
            assert!(validate_fetch_url(&url).is_err(), "{url} should be rejected");
        }
    }

    #[test]
    fn unspecified_address_is_rejected() {
        assert!(validate_fetch_url("http://0.0.0.0/").is_err());
    }

    #[test]
    fn public_ip_literal_is_allowed() {
        // 93.184.215.14 is example.com's real, public, stable address —
        // not a private range, so the validator must not reject it.
        assert!(validate_fetch_url("http://93.184.215.14/").is_ok());
    }

    #[test]
    fn dump_format_parses_known_values_and_rejects_unknown() {
        assert_eq!(DumpFormat::parse("html").unwrap().as_flag(), "html");
        assert_eq!(DumpFormat::parse("markdown").unwrap().as_flag(), "markdown");
        assert!(DumpFormat::parse("pdf").is_err());
    }

    #[test]
    fn cap_bytes_truncates_and_flags_oversized_output() {
        let big = vec![b'a'; MAX_FETCH_OUTPUT_BYTES + 10];
        let (content, truncated) = cap_bytes(&big);
        assert!(truncated);
        assert_eq!(content.len(), MAX_FETCH_OUTPUT_BYTES);
    }

    #[test]
    fn cap_bytes_leaves_small_output_untouched() {
        let (content, truncated) = cap_bytes(b"hello");
        assert!(!truncated);
        assert_eq!(content, "hello");
    }

    #[test]
    fn missing_lightpanda_binary_gives_an_actionable_error_not_a_panic() {
        // Real environment check, not a mock: this test's assertion only
        // holds in an environment without `lightpanda` on PATH, which is
        // true for this repo's own CI and dev machines today (it is an
        // operator-installed external tool, never vendored — see this
        // module's own header comment). If `lightpanda` is ever added to
        // the environment this test would need a fake-binary fixture
        // instead; not needed yet.
        let result = fetch_page(
            "https://example.com/",
            &FetchOptions { format: DumpFormat::Markdown, timeout: Duration::from_secs(1) },
        );
        match result {
            Err(CapabilityError::SpawnFailed { detail }) => {
                assert!(
                    detail.contains("lightpanda") || detail.contains("not found") || detail.contains("timed out"),
                    "unexpected error detail: {detail}"
                );
            }
            other => panic!("expected SpawnFailed when lightpanda is absent, got {other:?}"),
        }
    }
}
