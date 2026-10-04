//! Range coverage for the canonical private-address test used by every
//! outbound fetch (`design`, `research`, `filescan`, `browser_fetch`). The
//! basic ranges are tested next to the function; these pin the special-purpose
//! IPv4 blocks and the IPv6 forms that embed an IPv4 address, each with its
//! neighbours just outside the range so the boundary is exact.

use super::is_private_ip;

fn blocked(s: &str) -> bool {
    is_private_ip(s.parse().unwrap_or_else(|_| panic!("bad test address {s}")))
}

#[test]
fn special_purpose_ipv4_blocks_are_private() {
    for ip in [
        "198.18.0.1", "198.19.255.255", // 198.18.0.0/15 benchmarking
        "192.0.0.1", "192.0.0.192", "192.0.0.255", // 192.0.0.0/24 IETF protocol assignments
        "224.0.0.1", "239.255.255.255", // multicast
        "240.0.0.1", "255.255.255.254", "255.255.255.255", // reserved and broadcast
        "192.0.2.1", "198.51.100.1", "203.0.113.1", // documentation ranges
        "192.88.99.1", // 6to4 relay anycast
    ] {
        assert!(blocked(ip), "{ip}");
    }
}

#[test]
fn addresses_just_outside_the_special_purpose_blocks_stay_public() {
    for ip in ["198.17.255.255", "198.20.0.1", "192.0.1.1", "223.255.255.255", "8.8.8.8", "1.1.1.1", "192.0.3.1"] {
        assert!(!blocked(ip), "{ip}");
    }
}

#[test]
fn nat64_addresses_are_judged_by_the_ipv4_address_they_embed() {
    for ip in ["64:ff9b::a9fe:a9fe", "64:ff9b::7f00:1", "64:ff9b::a00:1", "64:ff9b::6464:64c8"] {
        assert!(blocked(ip), "{ip} embeds 169.254.169.254, 127.0.0.1, 10.0.0.1 or 100.100.100.200");
    }
    assert!(!blocked("64:ff9b::808:808"), "embeds public 8.8.8.8");
}

#[test]
fn six_to_four_addresses_are_judged_by_the_ipv4_address_they_embed() {
    for ip in ["2002:a9fe:a9fe::1", "2002:7f00:1::1", "2002:a00:1::1"] {
        assert!(blocked(ip), "{ip}");
    }
    assert!(!blocked("2002:808:808::1"), "embeds public 8.8.8.8");
}

#[test]
fn deprecated_ipv4_compatible_and_teredo_forms_are_blocked() {
    for ip in ["::7f00:1", "::a9fe:a9fe", "::808:808", "2001:0:4136:e378:8000:63bf:3fff:fdd2"] {
        assert!(blocked(ip), "{ip}");
    }
}

#[test]
fn ordinary_public_ipv6_addresses_stay_reachable() {
    for ip in ["2606:4700:4700::1111", "2a00:1450:4001::1", "2001:4860:4860::8888", "2620:fe::fe"] {
        assert!(!blocked(ip), "{ip}");
    }
}
