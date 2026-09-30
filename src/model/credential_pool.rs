//! Credential pool (WS1 P3, see docs/contracts/ws1-provider.md section 4).
//!
//! Holds several API keys for one provider, hands them out round-robin, and
//! parks a key after the provider says it is rate limited, out of quota or
//! invalid. Keys live only in memory: never written to disk, never logged.
//! `Secret` has no `Display`, and its `Debug` prints a mask.
//!
//! Best-effort memory hygiene: `Secret` overwrites its bytes on drop. That
//! reduces how long a key sits in freed memory but is not a guarantee; the
//! optimizer may drop the writes and copies made elsewhere are not covered.

use super::provider_error::{ProviderError, ProviderErrorKind};
use std::fmt;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

/// Pause used when a 429 carries no `Retry-After`.
const DEFAULT_RATE_LIMIT_COOLDOWN: Duration = Duration::from_secs(60);
/// Out-of-quota keys usually recover on a billing cycle, not in seconds.
const QUOTA_COOLDOWN: Duration = Duration::from_secs(3600);

pub trait Clock: Send + Sync {
    fn now(&self) -> Instant;
}

pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> Instant {
        Instant::now()
    }
}

/// An API key. Not `Clone`, no `Display`, masked `Debug`.
pub struct Secret(Vec<u8>);

impl Secret {
    pub fn new(value: &str) -> Self {
        Self(value.as_bytes().to_vec())
    }

    pub fn expose(&self) -> &str {
        std::str::from_utf8(&self.0).unwrap_or("")
    }
}

impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Secret(***)")
    }
}

impl Drop for Secret {
    fn drop(&mut self) {
        wipe(&mut self.0);
    }
}

/// A parked key whose pause has passed is usable again.
fn refreshed(state: State, now: Instant) -> State {
    match state {
        State::CoolingUntil(until) if now >= until => State::Available,
        other => other,
    }
}

/// Overwrite `bytes` with zeros. Best effort, see the module docs.
fn wipe(bytes: &mut [u8]) {
    bytes.iter_mut().for_each(|byte| *byte = 0);
}

#[derive(Clone, Copy)]
enum State {
    Available,
    CoolingUntil(Instant),
    Disabled,
}

struct Credential {
    id: String,
    secret: Arc<Secret>,
    state: State,
}

struct Inner {
    credentials: Vec<Credential>,
    next: usize,
}

pub struct CredentialPool {
    inner: Mutex<Inner>,
    clock: Arc<dyn Clock>,
}

/// A borrowed key for one call. `id` is a label such as `ANTHROPIC_API_KEY#2`,
/// safe to log; the secret is only reachable through `secret()`.
pub struct Lease {
    id: String,
    secret: Arc<Secret>,
}

impl Lease {
    pub fn id(&self) -> &str {
        &self.id
    }
    pub fn secret(&self) -> &str {
        self.secret.expose()
    }
}

impl fmt::Debug for Lease {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Lease({})", self.id)
    }
}

/// Merge the pool variable (comma separated) and the single-key variable into
/// an ordered, de-duplicated list. Blank entries are dropped.
pub fn parse_keys(single: Option<&str>, pool: Option<&str>) -> Vec<String> {
    let mut keys: Vec<String> = Vec::new();
    let candidates = single.into_iter().chain(pool.into_iter().flat_map(|list| list.split(',')));
    for candidate in candidates {
        let key = candidate.trim();
        if !key.is_empty() && !keys.iter().any(|existing| existing == key) {
            keys.push(key.to_string());
        }
    }
    keys
}

impl CredentialPool {
    pub fn new(label: &str, keys: Vec<String>, clock: Arc<dyn Clock>) -> Self {
        let credentials = keys
            .iter()
            .enumerate()
            .map(|(position, key)| Credential {
                id: format!("{label}#{}", position + 1),
                secret: Arc::new(Secret::new(key)),
                state: State::Available,
            })
            .collect();
        Self { inner: Mutex::new(Inner { credentials, next: 0 }), clock }
    }

    /// Build from environment-style lookups: `<env_var>` holds one key and
    /// `<env_var>_POOL` holds a comma separated list. The lookup is a
    /// parameter so callers and tests never touch process-wide state.
    pub fn from_lookup(env_var: &str, lookup: impl Fn(&str) -> Option<String>) -> Self {
        let single = lookup(env_var);
        let pool = lookup(&format!("{env_var}_POOL"));
        let keys = parse_keys(single.as_deref(), pool.as_deref());
        Self::new(env_var, keys, Arc::new(SystemClock))
    }

    pub fn len(&self) -> usize {
        self.lock().credentials.len()
    }

    /// Next usable key, round-robin, skipping parked ones. `None` when every
    /// key is parked.
    pub fn acquire(&self) -> Option<Lease> {
        let now = self.clock.now();
        let mut inner = self.lock();
        let count = inner.credentials.len();
        for offset in 0..count {
            let index = (inner.next + offset) % count;
            let credential = &mut inner.credentials[index];
            credential.state = refreshed(credential.state, now);
            if matches!(credential.state, State::Available) {
                let lease = Lease { id: credential.id.clone(), secret: credential.secret.clone() };
                inner.next = (index + 1) % count;
                return Some(lease);
            }
        }
        None
    }

    /// Number of keys usable right now.
    pub fn available(&self) -> usize {
        let now = self.clock.now();
        let inner = self.lock();
        inner
            .credentials
            .iter()
            .filter(|credential| matches!(refreshed(credential.state, now), State::Available))
            .count()
    }

    /// Park the leased key according to why the call failed. Other error
    /// kinds leave the key alone.
    pub fn report(&self, lease: &Lease, error: &ProviderError) {
        let now = self.clock.now();
        let parked = match error.kind {
            ProviderErrorKind::RateLimited => {
                State::CoolingUntil(now + error.retry_after.unwrap_or(DEFAULT_RATE_LIMIT_COOLDOWN))
            }
            ProviderErrorKind::QuotaExhausted => State::CoolingUntil(now + QUOTA_COOLDOWN),
            ProviderErrorKind::Auth => State::Disabled,
            _ => return,
        };
        let mut inner = self.lock();
        if let Some(credential) = inner.credentials.iter_mut().find(|c| c.id == lease.id) {
            credential.state = parked;
        }
    }

    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[cfg(test)]
mod tests;
