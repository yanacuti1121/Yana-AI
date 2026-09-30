//! Failover tests for credential-pool rotation inside a route.

use super::test_support::*;
use super::*;

#[test]
fn rate_limited_key_rotates_to_the_next_key_without_leaving_the_provider() {
    let primary = Fake::new("primary", vec![Step::Http(429, "slow")], Step::Ok("ok"));
    let backup = Fake::new("backup", vec![], Step::Ok("nope"));
    let router = FailoverProvider::new(primary.clone(), vec![route(&backup, "b", None)], fast_policy(1))
        .with_primary_pool(key_pool(&["k1", "k2"]));
    let (result, chunks) = run(&router);
    assert!(result.is_ok());
    assert_eq!(keys_seen(&primary), vec!["k1", "k2"]);
    assert_eq!(chunks, vec!["ok:caller-model"]);
    assert_eq!(backup.calls(), 0);
}

#[test]
fn rotation_does_not_trip_the_breaker_while_a_good_key_remains() {
    // A 401 on one key would normally park the whole route for a long time.
    let primary = Fake::new("primary", vec![Step::Http(401, "bad key")], Step::Ok("ok"));
    let backup = Fake::new("backup", vec![], Step::Ok("nope"));
    let router = FailoverProvider::new(primary.clone(), vec![route(&backup, "b", None)], fast_policy(1))
        .with_primary_pool(key_pool(&["bad", "good"]));
    assert!(run(&router).0.is_ok());
    assert!(run(&router).0.is_ok(), "route must still be usable on the next turn");
    assert_eq!(backup.calls(), 0);
    assert_eq!(keys_seen(&primary), vec!["bad", "good", "good"]);
}

#[test]
fn every_key_rate_limited_then_the_fallback_provider_is_used() {
    let primary = Fake::new("primary", vec![], Step::Http(429, "slow"));
    let backup = Fake::new("backup", vec![], Step::Ok("ok"));
    let router = FailoverProvider::new(primary.clone(), vec![route(&backup, "b", None)], fast_policy(1))
        .with_primary_pool(key_pool(&["k1", "k2"]));
    let (result, _) = run(&router);
    assert!(result.is_ok());
    assert_eq!(primary.calls(), 2, "one attempt per key, no more");
    assert_eq!(backup.calls(), 1);
}

#[test]
fn a_route_with_no_usable_key_is_skipped_without_calling_the_provider() {
    let primary = Fake::new("primary", vec![], Step::Ok("nope"));
    let backup = Fake::new("backup", vec![], Step::Ok("ok"));
    let router = FailoverProvider::new(primary.clone(), vec![route(&backup, "b", None)], fast_policy(1))
        .with_primary_pool(key_pool(&[]));
    assert!(run(&router).0.is_ok());
    assert_eq!(primary.calls(), 0);
}

#[test]
fn a_fallback_route_can_have_its_own_pool() {
    let primary = Fake::new("primary", vec![], Step::Http(503, "down"));
    let backup = Fake::new("backup", vec![Step::Http(429, "slow")], Step::Ok("ok"));
    let mut fallback = route(&backup, "b", Some("unused-single-key"));
    fallback.pool = Some(key_pool(&["b1", "b2"]));
    let router = FailoverProvider::new(primary, vec![fallback], fast_policy(1));
    assert!(run(&router).0.is_ok());
    assert_eq!(keys_seen(&backup), vec!["b1", "b2"]);
}

#[test]
fn no_key_appears_in_the_final_error_text() {
    let secret = "sk-FAKEKEYFAKEKEY1234567890";
    let leaky: &'static str = Box::leak(format!("invalid key {secret}").into_boxed_str());
    let primary = Fake::new("primary", vec![], Step::Http(401, leaky));
    let router = FailoverProvider::new(primary, vec![], fast_policy(1))
        .with_primary_pool(key_pool(&[secret]));
    let error = run(&router).0.unwrap_err();
    assert!(!format!("{error:#} {error:?}").contains("FAKEKEYFAKEKEY"), "{error:#}");
}

