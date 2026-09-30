//! `validate_fetch_url` must refuse every internal destination, whichever way
//! the address is spelled: this tool is reachable by an agent through MCP, so
//! a hole here is a server-side request forgery hole. Only literal IPs are
//! used, so no test touches DNS or the network.

use super::validate_fetch_url;

fn blocked(url: &str) -> bool {
    validate_fetch_url(url).is_err()
}

#[test]
fn ipv4_internal_ranges_are_blocked() {
    for url in [
        "http://127.0.0.1/",
        "http://10.0.0.1/",
        "http://172.16.0.1/",
        "http://192.168.1.1/",
        "http://169.254.169.254/latest/meta-data/",
        "http://0.0.0.0/",
    ] {
        assert!(blocked(url), "{url}");
    }
}

#[test]
fn carrier_grade_nat_including_the_alibaba_metadata_address_is_blocked() {
    for url in ["http://100.100.100.200/", "http://100.64.0.1/", "http://100.127.255.255/"] {
        assert!(blocked(url), "{url}");
    }
    assert!(!blocked("http://100.63.255.255/") && !blocked("http://100.128.0.1/"));
}

#[test]
fn ipv6_internal_ranges_are_blocked() {
    for url in ["http://[::1]/", "http://[::]/", "http://[fc00::1]/", "http://[fd12:3456::1]/", "http://[fe80::1]/", "http://[ff02::1]/"] {
        assert!(blocked(url), "{url}");
    }
}

#[test]
fn an_internal_ipv4_address_wrapped_in_ipv6_is_still_blocked() {
    for url in [
        "http://[::ffff:127.0.0.1]/",
        "http://[::ffff:10.0.0.1]/",
        "http://[::ffff:169.254.169.254]/",
        "http://[::ffff:100.100.100.200]/",
    ] {
        assert!(blocked(url), "{url}");
    }
}

#[test]
fn public_addresses_in_every_spelling_are_still_allowed() {
    for url in ["http://8.8.8.8/", "http://1.1.1.1/", "http://[2606:4700:4700::1111]/", "http://[::ffff:8.8.8.8]/"] {
        assert!(!blocked(url), "{url}");
    }
}

#[test]
fn numeric_spellings_of_loopback_and_metadata_are_blocked() {
    for url in [
        "http://2130706433/",        // 127.0.0.1 as one decimal number
        "http://0x7f.1/",            // hex, shortened
        "http://0x7f000001/",        // hex, single number
        "http://127.1/",             // shortened dotted form
        "http://017700000001/",      // octal, single number
        "http://0177.0.0.1/",        // octal octets
        "http://2852039166/",        // 169.254.169.254 as one decimal number
        "http://0xa9.0xfe.0xa9.0xfe/", // 169.254.169.254 in hex octets
    ] {
        assert!(blocked(url), "{url}");
    }
}

#[test]
fn localhost_is_blocked_with_a_trailing_dot_and_as_a_subdomain() {
    for url in ["http://localhost/", "http://LOCALHOST/", "http://localhost./", "http://foo.localhost/", "http://localhost.localdomain/"] {
        assert!(blocked(url), "{url}");
    }
}
