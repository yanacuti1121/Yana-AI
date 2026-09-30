use super::*;

struct ManualClock(Mutex<Instant>);

impl ManualClock {
    fn new() -> Arc<Self> {
        Arc::new(Self(Mutex::new(Instant::now())))
    }
    fn advance(&self, by: Duration) {
        *self.0.lock().unwrap() += by;
    }
}

impl Clock for ManualClock {
    fn now(&self) -> Instant {
        *self.0.lock().unwrap()
    }
}

fn pool(keys: &[&str], clock: &Arc<ManualClock>) -> CredentialPool {
    CredentialPool::new("TEST_KEY", keys.iter().map(|k| k.to_string()).collect(), clock.clone())
}

fn error(status: u16, retry_after: Option<u64>) -> ProviderError {
    ProviderError::from_http("p", status, "", retry_after.map(Duration::from_secs))
}

#[test]
fn parse_keys_merges_trims_and_dedupes() {
    assert_eq!(parse_keys(Some("a"), Some("b, c ,a,,")), vec!["a", "b", "c"]);
    assert_eq!(parse_keys(Some("solo"), None), vec!["solo"]);
    assert_eq!(parse_keys(None, Some(" x ")), vec!["x"]);
    assert!(parse_keys(None, None).is_empty());
    assert!(parse_keys(Some("  "), Some(" , ")).is_empty());
}

#[test]
fn from_lookup_reads_the_single_and_pool_variables() {
    let pool = CredentialPool::from_lookup("ANTHROPIC_API_KEY", |name| match name {
        "ANTHROPIC_API_KEY" => Some("k1".to_string()),
        "ANTHROPIC_API_KEY_POOL" => Some("k2,k3".to_string()),
        _ => None,
    });
    assert_eq!(pool.len(), 3);
    assert_eq!(pool.acquire().unwrap().id(), "ANTHROPIC_API_KEY#1");
}

#[test]
fn acquire_rotates_round_robin() {
    let clock = ManualClock::new();
    let pool = pool(&["a", "b", "c"], &clock);
    let seen: Vec<String> = (0..6).map(|_| pool.acquire().unwrap().secret().to_string()).collect();
    assert_eq!(seen, vec!["a", "b", "c", "a", "b", "c"]);
}

#[test]
fn empty_pool_gives_no_key() {
    let clock = ManualClock::new();
    assert!(pool(&[], &clock).acquire().is_none());
}

#[test]
fn rate_limited_key_is_parked_for_retry_after_then_returns() {
    let clock = ManualClock::new();
    let pool = pool(&["a", "b"], &clock);
    let lease = pool.acquire().unwrap();
    pool.report(&lease, &error(429, Some(30)));
    assert_eq!(pool.available(), 1);
    assert_eq!(pool.acquire().unwrap().secret(), "b");
    assert_eq!(pool.acquire().unwrap().secret(), "b", "a is parked, only b is served");
    clock.advance(Duration::from_secs(31));
    assert_eq!(pool.available(), 2);
}

#[test]
fn rate_limit_without_retry_after_uses_the_default_pause() {
    let clock = ManualClock::new();
    let pool = pool(&["a"], &clock);
    let lease = pool.acquire().unwrap();
    pool.report(&lease, &error(429, None));
    clock.advance(Duration::from_secs(59));
    assert!(pool.acquire().is_none());
    clock.advance(Duration::from_secs(2));
    assert!(pool.acquire().is_some());
}

#[test]
fn quota_exhausted_key_is_parked_for_an_hour() {
    let clock = ManualClock::new();
    let pool = pool(&["a"], &clock);
    let lease = pool.acquire().unwrap();
    pool.report(&lease, &error(402, None));
    clock.advance(Duration::from_secs(3599));
    assert!(pool.acquire().is_none());
    clock.advance(Duration::from_secs(2));
    assert!(pool.acquire().is_some());
}

#[test]
fn auth_failure_disables_the_key_for_good() {
    let clock = ManualClock::new();
    let pool = pool(&["a", "b"], &clock);
    let lease = pool.acquire().unwrap();
    pool.report(&lease, &error(401, None));
    clock.advance(Duration::from_secs(7 * 24 * 3600));
    assert_eq!(pool.available(), 1);
    assert_eq!(pool.acquire().unwrap().secret(), "b");
}

#[test]
fn unrelated_errors_leave_the_key_usable() {
    let clock = ManualClock::new();
    let pool = pool(&["a"], &clock);
    let lease = pool.acquire().unwrap();
    for status in [500, 503, 400, 404] {
        pool.report(&lease, &error(status, None));
    }
    assert_eq!(pool.available(), 1);
}

#[test]
fn every_key_parked_gives_none() {
    let clock = ManualClock::new();
    let pool = pool(&["a", "b"], &clock);
    for _ in 0..2 {
        let lease = pool.acquire().unwrap();
        pool.report(&lease, &error(429, Some(60)));
    }
    assert!(pool.acquire().is_none());
    assert_eq!(pool.available(), 0);
}

#[test]
fn secrets_never_show_in_debug_output() {
    let clock = ManualClock::new();
    let pool = pool(&["sk-REALLYSECRET-123456"], &clock);
    let lease = pool.acquire().unwrap();
    let shown = format!("{lease:?} {:?}", Secret::new("sk-REALLYSECRET-123456"));
    assert!(!shown.contains("REALLYSECRET"), "{shown}");
    assert!(shown.contains("TEST_KEY#1"));
}

#[test]
fn wipe_overwrites_every_byte() {
    let mut bytes = b"topsecret".to_vec();
    wipe(&mut bytes);
    assert_eq!(bytes, vec![0u8; 9]);
    let mut empty: Vec<u8> = Vec::new();
    wipe(&mut empty);
    assert!(empty.is_empty());
}
