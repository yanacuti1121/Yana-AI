use super::*;
use std::cell::RefCell;
use std::collections::HashMap;

fn public(_: &str) -> std::io::Result<Vec<IpAddr>> {
    Ok(vec!["93.184.216.34".parse().unwrap()])
}

fn names(map: &'static [(&'static str, &'static str)]) -> impl Fn(&str) -> std::io::Result<Vec<IpAddr>> {
    let table: HashMap<&str, &str> = map.iter().copied().collect();
    move |host| Ok(vec![table.get(host).unwrap_or(&"93.184.216.34").parse().unwrap()])
}

#[test]
fn only_plain_public_https_urls_pass() {
    assert!(check_public_https("https://example.com/search?q=x", &public).is_ok());
    for bad in [
        "http://example.com/",
        "ftp://example.com/",
        "file:///etc/hosts",
        "https://user:pw@example.com/",
        "https://localhost/",
        "https://LOCALHOST./",
        "https://app.localhost/",
        "https://127.0.0.1/",
        "https://[::1]/",
        "https://10.0.0.5/",
        "https://192.168.1.1/",
        "https://169.254.169.254/latest/meta-data/",
        "https://[::ffff:169.254.169.254]/",
        "https://[::ffff:127.0.0.1]/",
        "https://100.100.100.200/",
        "https://100.64.0.1/",
        "https://[fe80::1]/",
        "https://[fc00::1]/",
        "https://[ff02::1]/",
        "not a url",
        "",
    ] {
        assert!(check_public_https(bad, &public).is_err(), "{bad}");
    }
}

#[test]
fn a_name_that_resolves_to_an_internal_address_is_refused() {
    let table = names(&[("evil.example", "169.254.169.254"), ("lan.example", "10.1.2.3")]);
    assert!(check_public_https("https://evil.example/", &table).is_err());
    assert!(check_public_https("https://lan.example/", &table).is_err());
    let mixed = |_: &str| Ok(vec!["93.184.216.34".parse().unwrap(), "127.0.0.1".parse().unwrap()]);
    assert!(check_public_https("https://mixed.example/", &mixed).is_err(), "any internal answer refuses");
    let none = |_: &str| Ok(Vec::new());
    assert!(check_public_https("https://empty.example/", &none).is_err());
    let failing = |_: &str| Err(std::io::Error::other("no dns"));
    assert!(check_public_https("https://down.example/", &failing).is_err());
}

struct Fake {
    pages: HashMap<String, (u16, Option<String>, Vec<u8>)>,
    contacted: RefCell<Vec<String>>,
    seen_headers: RefCell<Vec<usize>>,
}

impl Fake {
    fn new(pages: Vec<(&str, u16, Option<&str>, &str)>) -> Self {
        let pages = pages.into_iter().map(|(u, s, l, b)| (u.to_string(), (s, l.map(str::to_string), b.as_bytes().to_vec()))).collect();
        Self { pages, contacted: RefCell::new(Vec::new()), seen_headers: RefCell::new(Vec::new()) }
    }
}

impl Transport for Fake {
    fn get(&self, url: &Url, headers: &[(String, String)], _max: usize) -> Result<HttpReply, CapabilityError> {
        self.contacted.borrow_mut().push(url.to_string());
        self.seen_headers.borrow_mut().push(headers.len());
        let (status, location, body) = self.pages.get(url.as_str()).cloned().unwrap_or((404, None, Vec::new()));
        Ok(HttpReply { status, location, body })
    }
}

fn key() -> Vec<(String, String)> {
    vec![("Authorization".to_string(), "Bearer k".to_string())]
}

#[test]
fn a_redirect_to_an_internal_address_is_never_contacted() {
    let fake = Fake::new(vec![("https://example.com/a", 302, Some("https://169.254.169.254/latest/"), "")]);
    let error = get_checked(&fake, &public, "https://example.com/a", &[], 1000).unwrap_err();
    assert!(error.to_string().contains("internal or reserved"), "{error}");
    assert_eq!(fake.contacted.borrow().as_slice(), ["https://example.com/a"], "the internal target was not connected to");
}

#[test]
fn a_redirect_to_a_non_https_or_a_name_that_resolves_internally_is_refused() {
    let table = names(&[("inner.example", "10.0.0.9")]);
    let to_http = Fake::new(vec![("https://example.com/a", 301, Some("http://example.com/b"), "")]);
    assert!(get_checked(&to_http, &table, "https://example.com/a", &[], 1000).is_err());
    let to_inner = Fake::new(vec![("https://example.com/a", 301, Some("https://inner.example/x"), "")]);
    assert!(get_checked(&to_inner, &table, "https://example.com/a", &[], 1000).is_err());
    assert_eq!(to_inner.contacted.borrow().len(), 1);
}

#[test]
fn relative_redirects_are_followed_and_a_loop_stops() {
    let fake = Fake::new(vec![("https://example.com/a", 302, Some("/b"), ""), ("https://example.com/b", 200, None, "done")]);
    assert_eq!(get_checked(&fake, &public, "https://example.com/a", &[], 1000).unwrap().body, b"done");
    let looping = Fake::new(vec![("https://example.com/a", 302, Some("/a"), "")]);
    let error = get_checked(&looping, &public, "https://example.com/a", &[], 1000).unwrap_err();
    assert!(error.to_string().contains("redirects"), "{error}");
    assert_eq!(looping.contacted.borrow().len(), MAX_HOPS + 1);
}

#[test]
fn credentials_are_not_sent_to_a_different_host_after_a_redirect() {
    let fake = Fake::new(vec![("https://example.com/a", 302, Some("https://other.example/b"), ""), ("https://other.example/b", 200, None, "ok")]);
    get_checked(&fake, &public, "https://example.com/a", &key(), 1000).unwrap();
    assert_eq!(fake.seen_headers.borrow().as_slice(), [1, 0], "the key went to the first host only");
}

#[test]
fn a_forbidden_start_url_is_never_contacted() {
    let fake = Fake::new(vec![]);
    for bad in ["https://127.0.0.1/", "http://example.com/", "https://[::ffff:169.254.169.254]/"] {
        assert!(get_checked(&fake, &public, bad, &key(), 1000).is_err());
    }
    assert!(fake.contacted.borrow().is_empty());
}

/// One-shot loopback HTTP server, for exercising the real transport only
/// (the address check is bypassed here on purpose; it has its own tests above).
fn serve_once(response: Vec<u8>) -> Url {
    use std::io::{Read, Write};
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    std::thread::spawn(move || {
        if let Ok((mut stream, _)) = listener.accept() {
            let mut buffer = [0u8; 2048];
            let _ = stream.read(&mut buffer);
            let _ = stream.write_all(&response);
        }
    });
    Url::parse(&format!("http://127.0.0.1:{port}/")).unwrap()
}

#[test]
fn the_real_transport_reports_a_redirect_instead_of_following_it() {
    let url = serve_once(b"HTTP/1.1 302 Found\r\nLocation: http://169.254.169.254/x\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_vec());
    let reply = UreqTransport.get(&url, &[], 1000).unwrap();
    assert_eq!(reply.status, 302);
    assert_eq!(reply.location.as_deref(), Some("http://169.254.169.254/x"));
}

#[test]
fn the_real_transport_fails_on_a_body_over_the_cap_and_reads_one_within_it() {
    let mut big = b"HTTP/1.1 200 OK\r\nContent-Length: 5000\r\nConnection: close\r\n\r\n".to_vec();
    big.extend(std::iter::repeat_n(b'a', 5000));
    let error = UreqTransport.get(&serve_once(big), &[], 100).unwrap_err();
    assert!(matches!(error, CapabilityError::External { .. }), "{error:?}");
    assert!(error.to_string().contains("larger than 100 bytes"), "{error}");
    let mut small = b"HTTP/1.1 200 OK\r\nContent-Length: 50\r\nConnection: close\r\n\r\n".to_vec();
    small.extend(std::iter::repeat_n(b'b', 50));
    assert_eq!(UreqTransport.get(&serve_once(small), &[], 100).unwrap().body.len(), 50);
}

#[test]
fn special_purpose_addresses_are_refused_too() {
    for bad in [
        "https://255.255.255.255/",
        "https://224.0.0.1/",
        "https://0.1.2.3/",
        "https://240.0.0.1/",
        "https://198.18.0.1/",
        "https://192.0.0.8/",
        "https://192.0.2.1/",
        "https://198.51.100.1/",
        "https://203.0.113.1/",
        "https://[64:ff9b::a9fe:a9fe]/",
        "https://[::7f00:1]/",
        "https://[2002:7f00:1::]/",
        "https://[2001::1]/",
        "https://[fec0::1]/",
        "https://[2001:db8::1]/",
    ] {
        assert!(check_public_https(bad, &public).is_err(), "{bad}");
    }
    for fine in ["https://93.184.216.34/", "https://[2606:2800:220:1:248:1893:25c8:1946]/"] {
        assert!(check_public_https(fine, &public).is_ok(), "{fine}");
    }
}

#[test]
fn a_mixed_case_host_and_a_resolver_failure_are_handled() {
    assert!(check_public_https("https://ExAmPlE.COM/", &public).is_ok());
    assert!(check_public_https("https://LocalHost/", &public).is_err());
    let failing = |_: &str| Err(std::io::Error::other("no dns"));
    assert!(matches!(check_public_https("https://down.example/", &failing), Err(CapabilityError::External { .. })), "a network failure is not bad input");
}

#[test]
fn five_redirects_then_a_page_is_fine_and_a_sixth_is_refused_without_resolving_it() {
    let mut pages = Vec::new();
    for n in 0..5 {
        pages.push((format!("https://example.com/{n}"), 302, Some(format!("/{}", n + 1)), String::new()));
    }
    pages.push(("https://example.com/5".to_string(), 200, None, "end".to_string()));
    let fake = Fake::new(pages.iter().map(|(u, s, l, b)| (u.as_str(), *s, l.as_deref(), b.as_str())).collect());
    assert_eq!(get_checked(&fake, &public, "https://example.com/0", &[], 1000).unwrap().body, b"end");
    let resolved = RefCell::new(0usize);
    let counting = |_: &str| {
        *resolved.borrow_mut() += 1;
        Ok(vec!["93.184.216.34".parse().unwrap()])
    };
    let endless = Fake::new(vec![("https://example.com/a", 302, Some("/a"), "")]);
    assert!(get_checked(&endless, &counting, "https://example.com/a", &[], 1000).is_err());
    assert_eq!(*resolved.borrow(), MAX_HOPS + 1, "the start and five redirect targets, not a sixth");
}

#[test]
fn a_3xx_without_location_and_a_304_are_returned_not_followed() {
    let fake = Fake::new(vec![("https://example.com/a", 302, None, "page"), ("https://example.com/b", 304, Some("/a"), "")]);
    assert_eq!(get_checked(&fake, &public, "https://example.com/a", &[], 1000).unwrap().status, 302);
    assert_eq!(get_checked(&fake, &public, "https://example.com/b", &[], 1000).unwrap().status, 304);
}

#[test]
fn credentials_follow_a_same_origin_redirect_but_not_a_different_port() {
    let same = Fake::new(vec![("https://example.com/a", 302, Some("/b"), ""), ("https://example.com/b", 200, None, "ok")]);
    get_checked(&same, &public, "https://example.com/a", &key(), 1000).unwrap();
    assert_eq!(same.seen_headers.borrow().as_slice(), [1, 1]);
    let other_port = Fake::new(vec![("https://example.com/a", 302, Some("https://example.com:8443/b"), ""), ("https://example.com:8443/b", 200, None, "ok")]);
    get_checked(&other_port, &public, "https://example.com/a", &key(), 1000).unwrap();
    assert_eq!(other_port.seen_headers.borrow().as_slice(), [1, 0], "another port is another origin");
}

#[test]
fn a_header_with_a_line_break_is_refused_without_being_echoed() {
    let url = serve_once(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".to_vec());
    let bad = vec![("Authorization".to_string(), "Bearer top\r\nX-Evil: 1".to_string())];
    let error = UreqTransport.get(&url, &bad, 100).unwrap_err().to_string();
    assert!(!error.contains("top") && !error.contains("Evil"), "{error}");
}
