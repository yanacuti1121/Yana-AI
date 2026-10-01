//! Outbound HTTPS for WS3 tools (docs/contracts/ws3-tools.md 5).
//!
//! Every address a request would go to is checked first, with the crate's one
//! private-address test (`crate::design::is_private_ip`), and redirects are
//! never followed by the HTTP client: this module follows them itself, one hop
//! at a time, checking each destination before contacting it. The actual
//! sending is behind a trait so tests use an in-memory fake and open no socket.
//!
//! Known, accepted residual risk (same as `browser_fetch`): the name is resolved
//! here and again by the client when it connects, so a DNS answer that changes in
//! between is not caught.

use super::error::CapabilityError;
use std::net::IpAddr;
use std::time::Duration;
use url::{Host, Url};

/// Most redirect hops followed.
pub const MAX_HOPS: usize = 5;
/// Per-request time limit.
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

pub type Resolver<'a> = &'a dyn Fn(&str) -> std::io::Result<Vec<IpAddr>>;

#[derive(Debug, Clone)]
pub struct HttpReply {
    pub status: u16,
    pub location: Option<String>,
    pub body: Vec<u8>,
}

pub trait Transport {
    /// One GET, no redirects, body read up to `max_body` bytes.
    fn get(&self, url: &Url, headers: &[(String, String)], max_body: usize) -> Result<HttpReply, CapabilityError>;
}

fn refuse(detail: impl Into<String>) -> CapabilityError {
    CapabilityError::InvalidInput { detail: detail.into() }
}

/// `raw` must be a plain `https` URL, without credentials, whose host is not an
/// internal name and does not resolve to any private, loopback, link-local or
/// otherwise special address.
pub fn check_public_https(raw: &str, resolve: Resolver<'_>) -> Result<Url, CapabilityError> {
    let url = Url::parse(raw).map_err(|e| refuse(format!("not a valid URL: {e}")))?;
    if url.scheme() != "https" {
        return Err(refuse(format!("scheme '{}' is not allowed; only https", url.scheme())));
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(refuse("credentials embedded in the URL are not allowed"));
    }
    match url.host().ok_or_else(|| refuse("URL has no host"))? {
        Host::Ipv4(ip) => deny_if_private(IpAddr::V4(ip))?,
        Host::Ipv6(ip) => deny_if_private(IpAddr::V6(ip))?,
        Host::Domain(name) => {
            let name = name.trim_end_matches('.').to_ascii_lowercase();
            if name == "localhost" || name.ends_with(".localhost") {
                return Err(refuse("localhost is not allowed"));
            }
            let addresses = resolve(&name).map_err(|e| CapabilityError::External { detail: format!("could not resolve '{name}': {e}") })?;
            if addresses.is_empty() {
                return Err(refuse(format!("'{name}' resolved to no addresses")));
            }
            addresses.into_iter().try_for_each(deny_if_private)?;
        }
    }
    Ok(url)
}

fn deny_if_private(ip: IpAddr) -> Result<(), CapabilityError> {
    if crate::design::is_private_ip(ip) || is_special_purpose(ip) {
        return Err(refuse(format!("the address {ip} is internal or reserved; refusing to connect")));
    }
    Ok(())
}

/// Ranges `crate::design::is_private_ip` does not cover and that are never a
/// public web server: broadcast, class E, `0.0.0.0/8`, IETF protocol and
/// benchmarking blocks, documentation blocks, and for IPv6 everything outside
/// global unicast `2000::/3`, plus the ranges inside it that embed or tunnel an
/// IPv4 address (NAT64, 6to4, Teredo) or are documentation.
fn is_special_purpose(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let o = v4.octets();
            v4.is_broadcast()
                || v4.is_multicast()
                || o[0] == 0
                || o[0] >= 240
                || (o[0] == 192 && o[1] == 0 && (o[2] == 0 || o[2] == 2))
                || (o[0] == 198 && (o[1] == 18 || o[1] == 19 || (o[1] == 51 && o[2] == 100)))
                || (o[0] == 203 && o[1] == 0 && o[2] == 113)
        }
        IpAddr::V6(v6) => {
            let s = v6.segments();
            let global_unicast = (s[0] & 0xe000) == 0x2000;
            let teredo = s[0] == 0x2001 && s[1] == 0;
            let documentation = s[0] == 0x2001 && s[1] == 0x0db8;
            let six_to_four = s[0] == 0x2002;
            !global_unicast || teredo || documentation || six_to_four
        }
    }
}

/// Statuses that are followed as redirects.
const REDIRECTS: [u16; 5] = [301, 302, 303, 307, 308];

/// What counts as "the same place" for credentials: scheme, host and port.
fn origin_of(url: &Url) -> (String, Option<String>, Option<u16>) {
    (url.scheme().to_string(), url.host_str().map(str::to_ascii_lowercase), url.port_or_known_default())
}

/// GET `start`, following redirects by hand. Every URL, including each redirect
/// target, passes `check_public_https` before anything is sent to it. `headers`
/// (for example an API key) go only to the original host: a redirect to another
/// host is followed without them.
pub fn get_checked(
    transport: &dyn Transport,
    resolve: Resolver<'_>,
    start: &str,
    headers: &[(String, String)],
    max_body: usize,
) -> Result<HttpReply, CapabilityError> {
    let mut url = check_public_https(start, resolve)?;
    let origin = origin_of(&url);
    for hop in 0..=MAX_HOPS {
        let sent: &[(String, String)] = if origin_of(&url) == origin { headers } else { &[] };
        let reply = transport.get(&url, sent, max_body)?;
        let Some(location) = reply.location.as_deref().filter(|_| REDIRECTS.contains(&reply.status)) else {
            return Ok(reply);
        };
        if hop == MAX_HOPS {
            break;
        }
        let next = url.join(location).map_err(|e| refuse(format!("bad redirect target: {e}")))?;
        url = check_public_https(next.as_str(), resolve)?;
    }
    Err(refuse(format!("more than {MAX_HOPS} redirects")))
}

/// The real transport: `ureq` with automatic redirects turned off.
pub struct UreqTransport;

impl Transport for UreqTransport {
    fn get(&self, url: &Url, headers: &[(String, String)], max_body: usize) -> Result<HttpReply, CapabilityError> {
        // No ambient proxy: through one, the proxy would resolve the name and
        // the address check made here would say nothing about where it connects.
        let config = ureq::Agent::config_builder()
            .proxy(None)
            .max_redirects(0)
            .timeout_global(Some(REQUEST_TIMEOUT))
            .http_status_as_error(false)
            .build();
        let agent = ureq::Agent::new_with_config(config);
        let mut request = agent.get(url.as_str()).header("User-Agent", "yana-rt");
        for (name, value) in headers {
            // A value with a line break would split the header; refuse it without echoing it.
            if value.chars().any(char::is_control) || name.chars().any(char::is_control) {
                return Err(refuse("a request header contains control characters"));
            }
            request = request.header(name.as_str(), value.as_str());
        }
        let host = url.host_str().unwrap_or("?");
        // The messages are fixed text: the library's own error text could quote header content.
        let mut response = request.call().map_err(|e| match e {
            ureq::Error::Timeout(_) => CapabilityError::Timeout { detail: format!("request to {host}") },
            _ => CapabilityError::External { detail: format!("request to {host} failed (connection or protocol error)") },
        })?;
        let status = response.status().as_u16();
        let location = response.headers().get("location").and_then(|v| v.to_str().ok()).map(str::to_string);
        let body = response
            .body_mut()
            .with_config()
            .limit(max_body as u64)
            .read_to_vec()
            .map_err(|_| CapabilityError::External { detail: format!("the response from {host} was larger than {max_body} bytes or could not be read") })?;
        Ok(HttpReply { status, location, body })
    }
}

/// The system resolver.
pub fn system_resolver(host: &str) -> std::io::Result<Vec<IpAddr>> {
    use std::net::ToSocketAddrs;
    Ok((host, 443u16).to_socket_addrs()?.map(|a| a.ip()).collect())
}

#[cfg(test)]
mod tests;
