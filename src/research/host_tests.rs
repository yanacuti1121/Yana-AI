//! `research probe` contacts the source URL stored on a record, so
//! `public_https_host` decides what it may reach: https only, a real public host,
//! and one reading of the URL that matches what the HTTP client will use. Only
//! literal IPs are used, so no test touches DNS.

use super::public_https_host;

#[test]
fn only_https_urls_with_a_host_pass() {
    for bad in ["http://8.8.8.8/x", "ftp://8.8.8.8/", "file:///etc/passwd", "8.8.8.8", "https://", "https:///path"] {
        assert!(public_https_host(bad).is_err(), "{bad}");
    }
}

#[test]
fn public_literal_addresses_pass_and_are_returned_as_the_host() {
    assert_eq!(public_https_host("https://8.8.8.8/claim").unwrap(), "8.8.8.8");
    assert_eq!(public_https_host("https://[2606:4700:4700::1111]/x").unwrap(), "2606:4700:4700::1111");
    assert_eq!(public_https_host("https://8.8.8.8:8443/x").unwrap(), "8.8.8.8", "the port is not part of the host");
}

#[test]
fn internal_addresses_are_refused_including_ipv6_literals_and_wrapped_ipv4() {
    for bad in [
        "https://127.0.0.1/", "https://10.0.0.5/", "https://169.254.169.254/latest/", "https://100.100.100.200/",
        "https://[::1]/", "https://[fe80::1]/", "https://[::ffff:169.254.169.254]/", "https://[64:ff9b::a9fe:a9fe]/",
        "https://2130706433/", "https://0x7f.1/",
    ] {
        assert!(public_https_host(bad).is_err(), "{bad}");
    }
}

#[test]
fn urls_that_different_parsers_read_differently_are_refused() {
    for bad in [
        "https://user@8.8.8.8/",            // credentials
        "https://user:pw@8.8.8.8/",
        "https://evil.example\\@127.0.0.1/", // backslash before @
        "https://127.0.0.1\\@8.8.8.8/",
        "https://8.8.8.8 /x",                // space
        "https://8.8.8.8\\@169.254.169.254/", // read as host 8.8.8.8 by one parser and 169.254.169.254 by another
        "https://8.8.8.8/a b",              // raw space in the path
    ] {
        assert!(public_https_host(bad).is_err(), "{bad}");
    }
}
