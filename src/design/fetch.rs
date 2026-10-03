//! HTTP(S) fetch for `design extract <url>` that re-checks every hop.
//!
//! The URL comes from the user, so the destination must never be an internal
//! address, and that must stay true across redirects: a public URL that
//! answers `302 Location: http://169.254.169.254/...` must not be followed.
//! The HTTP client's automatic redirects are therefore turned off and each hop
//! is validated before it is contacted. `validate` is a parameter so tests can
//! run against local servers; production passes `check_url_not_private`.

use anyhow::Result;
use std::net::ToSocketAddrs;
use url::{Host, Url};

/// Redirects followed before giving up.
const MAX_REDIRECTS: usize = 5;
const CONNECT_TIMEOUT_SECS: u64 = 10;
const RESPONSE_TIMEOUT_SECS: u64 = 30;

/// Refuses non-http(s) schemes, embedded credentials, and any destination
/// that is, or resolves to, a private or internal address.
pub(super) fn check_url_not_private(url: &Url) -> Result<()> {
    if !matches!(url.scheme(), "http" | "https") {
        anyhow::bail!("only http and https URLs are allowed, got '{}'", url.scheme());
    }
    if !url.username().is_empty() || url.password().is_some() {
        anyhow::bail!("URLs with embedded credentials are not allowed");
    }
    let port = url.port_or_known_default().unwrap_or(80);
    let addrs: Vec<std::net::IpAddr> = match url.host() {
        None => anyhow::bail!("could not extract host from URL: '{url}'"),
        Some(Host::Ipv4(ip)) => vec![ip.into()],
        Some(Host::Ipv6(ip)) => vec![ip.into()],
        Some(Host::Domain(name)) => (name, port)
            .to_socket_addrs()
            .map_err(|e| anyhow::anyhow!("DNS resolution failed for '{name}': {e}"))?
            .map(|a| a.ip())
            .collect(),
    };
    if addrs.is_empty() {
        anyhow::bail!("'{url}' resolved to no addresses");
    }
    for ip in addrs {
        if super::is_private_ip(ip) {
            anyhow::bail!("SSRF blocked: '{}' resolves to private/internal address {ip}", url.host_str().unwrap_or(""));
        }
    }
    Ok(())
}

pub(super) fn fetch_url(raw: &str) -> Result<String> {
    fetch_url_with(raw, &check_url_not_private)
}

pub(super) fn fetch_url_with(raw: &str, validate: &dyn Fn(&Url) -> Result<()>) -> Result<String> {
    let config = ureq::Agent::config_builder()
        .max_redirects(0)
        .http_status_as_error(false)
        .timeout_connect(Some(std::time::Duration::from_secs(CONNECT_TIMEOUT_SECS)))
        .timeout_recv_response(Some(std::time::Duration::from_secs(RESPONSE_TIMEOUT_SECS)))
        .build();
    let agent = ureq::Agent::new_with_config(config);
    let mut current = Url::parse(raw).map_err(|e| anyhow::anyhow!("invalid URL '{raw}': {e}"))?;
    for _ in 0..=MAX_REDIRECTS {
        validate(&current)?;
        let resp = agent
            .get(current.as_str())
            .header("User-Agent", "yana-rt/0.9 design-extractor")
            .call()
            .map_err(|e| anyhow::anyhow!("fetch failed: {e}"))?;
        let status = resp.status().as_u16();
        if matches!(status, 301 | 302 | 303 | 307 | 308) {
            let location = resp
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| anyhow::anyhow!("redirect (HTTP {status}) without a Location header"))?;
            current = current
                .join(location)
                .map_err(|e| anyhow::anyhow!("invalid redirect target '{location}': {e}"))?;
            continue;
        }
        if status >= 400 {
            anyhow::bail!("fetch failed: HTTP {status}");
        }
        return Ok(resp.into_body().read_to_string()?);
    }
    anyhow::bail!("too many redirects (more than {MAX_REDIRECTS})")
}

#[cfg(test)]
mod tests;
