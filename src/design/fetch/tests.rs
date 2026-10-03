//! Behavior tests for the redirect-safe fetch. Local one-shot HTTP servers stand
//! in for the internet; the validator is a parameter, so the tests can allow
//! the first server and still assert that a redirect to a "forbidden" host is
//! refused without that host ever being contacted.

use super::*;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

const READ_TIMEOUT_SECS: u64 = 2;

fn reply(status: u16, headers: &str, body: &str) -> String {
    format!("HTTP/1.1 {status} X\r\nContent-Length: {}\r\n{headers}Connection: close\r\n\r\n{body}", body.len())
}

/// Serves `replies` in order (the last one repeats); returns (port, request count).
fn serve(replies: Vec<String>) -> (u16, Arc<AtomicUsize>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let hits = Arc::new(AtomicUsize::new(0));
    let counter = hits.clone();
    std::thread::spawn(move || {
        for (i, stream) in listener.incoming().enumerate() {
            let Ok(mut stream) = stream else { break };
            stream.set_read_timeout(Some(std::time::Duration::from_secs(READ_TIMEOUT_SECS))).ok();
            let mut seen = Vec::new();
            let mut buf = [0u8; 1024];
            while !seen.windows(4).any(|w| w == b"\r\n\r\n") {
                match stream.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => seen.extend_from_slice(&buf[..n]),
                }
            }
            counter.fetch_add(1, Ordering::SeqCst);
            let body = replies.get(i).unwrap_or_else(|| replies.last().unwrap());
            stream.write_all(body.as_bytes()).ok();
            stream.flush().ok();
        }
    });
    (port, hits)
}

fn allow_port(port: u16) -> impl Fn(&Url) -> Result<()> {
    move |u: &Url| {
        if u.port() == Some(port) { Ok(()) } else { check_url_not_private(u) }
    }
}

// ── check_url_not_private ────────────────────────────────────────────────────

#[test]
fn only_http_and_https_without_credentials_are_allowed() {
    for bad in ["file:///etc/passwd", "ftp://8.8.8.8/x", "gopher://8.8.8.8/", "http://user:pw@8.8.8.8/", "http://user@8.8.8.8/"] {
        assert!(check_url_not_private(&Url::parse(bad).unwrap()).is_err(), "{bad}");
    }
}

#[test]
fn internal_destinations_are_refused_in_every_spelling() {
    for bad in [
        "http://127.0.0.1/", "http://169.254.169.254/latest/", "http://100.100.100.200/", "http://10.0.0.1:8080/",
        "http://[::1]/", "http://[::ffff:169.254.169.254]/", "http://[64:ff9b::a9fe:a9fe]/", "http://localhost:9/",
    ] {
        assert!(check_url_not_private(&Url::parse(bad).unwrap()).is_err(), "{bad}");
    }
}

#[test]
fn public_literal_addresses_pass_without_any_dns_lookup() {
    for good in ["http://8.8.8.8/", "https://1.1.1.1/x", "http://[2606:4700:4700::1111]/"] {
        assert!(check_url_not_private(&Url::parse(good).unwrap()).is_ok(), "{good}");
    }
}

// ── fetch_url_with ───────────────────────────────────────────────────────────

#[test]
fn a_plain_200_returns_the_body() {
    let (port, _) = serve(vec![reply(200, "", "hello")]);
    let body = fetch_url_with(&format!("http://127.0.0.1:{port}/"), &allow_port(port)).unwrap();
    assert_eq!(body, "hello");
}

#[test]
fn a_relative_redirect_is_followed_and_each_hop_is_validated() {
    let (port, hits) = serve(vec![reply(302, "Location: /next\r\n", ""), reply(200, "", "done")]);
    let calls = AtomicUsize::new(0);
    let validate = |u: &Url| {
        calls.fetch_add(1, Ordering::SeqCst);
        allow_port(port)(u)
    };
    let body = fetch_url_with(&format!("http://127.0.0.1:{port}/"), &validate).unwrap();
    assert_eq!(body, "done");
    assert_eq!((calls.load(Ordering::SeqCst), hits.load(Ordering::SeqCst)), (2, 2));
}

#[test]
fn a_redirect_to_a_forbidden_host_is_refused_and_never_contacted() {
    let (secret_port, secret_hits) = serve(vec![reply(200, "", "SECRET")]);
    let location = format!("Location: http://127.0.0.1:{secret_port}/secret\r\n");
    let (port, _) = serve(vec![reply(302, &location, "")]);
    let result = fetch_url_with(&format!("http://127.0.0.1:{port}/"), &allow_port(port));
    assert!(result.is_err(), "the redirect target must be refused");
    assert_eq!(secret_hits.load(Ordering::SeqCst), 0, "the forbidden host must not be contacted");
}

#[test]
fn a_redirect_to_a_non_http_scheme_is_refused() {
    let (port, _) = serve(vec![reply(302, "Location: file:///etc/passwd\r\n", "")]);
    assert!(fetch_url_with(&format!("http://127.0.0.1:{port}/"), &allow_port(port)).is_err());
}

#[test]
fn a_redirect_loop_stops_after_the_limit() {
    let (port, hits) = serve(vec![reply(302, "Location: /\r\n", "")]);
    let err = fetch_url_with(&format!("http://127.0.0.1:{port}/"), &allow_port(port)).unwrap_err().to_string();
    assert!(err.contains("too many redirects"), "{err}");
    assert_eq!(hits.load(Ordering::SeqCst), MAX_REDIRECTS + 1);
}

#[test]
fn error_statuses_a_redirect_without_location_and_a_bad_url_are_errors() {
    let (port, _) = serve(vec![reply(404, "", "nope")]);
    let err = fetch_url_with(&format!("http://127.0.0.1:{port}/"), &allow_port(port)).unwrap_err().to_string();
    assert!(err.contains("HTTP 404"), "{err}");
    let (port2, _) = serve(vec![reply(302, "", "")]);
    let err = fetch_url_with(&format!("http://127.0.0.1:{port2}/"), &allow_port(port2)).unwrap_err().to_string();
    assert!(err.contains("Location"), "{err}");
    assert!(fetch_url_with("not a url", &allow_port(1)).is_err());
}
