//! Scripted stand-ins and helpers shared by the failover tests. No network, no credentials.

use super::*;
use crate::model::credential_pool::SystemClock;
use crate::model::provider_error::ProviderErrorKind;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

#[derive(Clone)]
pub(super) enum Step {
    Ok(&'static str),
    Http(u16, &'static str),
    HttpAfterOutput(u16),
    Untyped,
}

/// Scripted stand-in for a real provider. No network, no credentials.
pub(super) struct Fake {
    name: &'static str,
    steps: Mutex<VecDeque<Step>>,
    then: Step,
    calls: AtomicUsize,
    pub(super) keys_seen: Mutex<Vec<Option<String>>>,
}

impl Fake {
    pub(super) fn new(name: &'static str, steps: Vec<Step>, then: Step) -> Arc<Self> {
        Arc::new(Self {
            name,
            steps: Mutex::new(steps.into()),
            then,
            calls: AtomicUsize::new(0),
            keys_seen: Mutex::new(Vec::new()),
        })
    }
    pub(super) fn calls(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }
}

impl ChatProvider for Fake {
    fn name(&self) -> &str {
        self.name
    }
    fn default_model(&self) -> &str {
        "fake-default"
    }
    fn requires_key(&self) -> bool {
        false
    }
    fn env_var(&self) -> &str {
        ""
    }
    fn stream_chat(
        &self,
        api_key: Option<&str>,
        model: &str,
        _system: Option<&str>,
        _messages: &[ChatMessage],
        _tools: &[ToolSpec],
        on_chunk: &mut dyn FnMut(&str) -> Result<()>,
    ) -> Result<(ChatUsage, StreamOutcome)> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        self.keys_seen.lock().unwrap().push(api_key.map(str::to_string));
        let step = self.steps.lock().unwrap().pop_front().unwrap_or_else(|| self.then.clone());
        match step {
            Step::Ok(text) => {
                on_chunk(&format!("{text}:{model}"))?;
                Ok((ChatUsage::default(), StreamOutcome::Text))
            }
            Step::Http(status, body) => {
                Err(anyhow::Error::new(ProviderError::from_http(self.name, status, body, None)))
            }
            Step::HttpAfterOutput(status) => {
                on_chunk("partial")?;
                Err(anyhow::Error::new(ProviderError::from_http(self.name, status, "cut", None)))
            }
            Step::Untyped => Err(anyhow::anyhow!("KEY_NOT_SET")),
        }
    }
}

pub(super) fn fast_policy(max_attempts: u32) -> FailoverPolicy {
    FailoverPolicy {
        max_attempts_per_route: max_attempts,
        retry_backoff: Duration::ZERO,
        ..FailoverPolicy::default()
    }
}

pub(super) fn route(provider: &Arc<Fake>, model: &str, key: Option<&str>) -> FallbackRoute {
    FallbackRoute {
        provider: provider.clone(),
        model: model.to_string(),
        api_key: key.map(str::to_string),
        pool: None,
    }
}

pub(super) fn key_pool(keys: &[&str]) -> Arc<CredentialPool> {
    Arc::new(CredentialPool::new(
        "TEST_KEY",
        keys.iter().map(|k| k.to_string()).collect(),
        Arc::new(SystemClock),
    ))
}

pub(super) fn keys_seen(fake: &Fake) -> Vec<String> {
    fake.keys_seen.lock().unwrap().iter().map(|k| k.clone().unwrap_or_default()).collect()
}

pub(super) fn run(router: &FailoverProvider) -> (Result<(ChatUsage, StreamOutcome)>, Vec<String>) {
    let mut chunks = Vec::new();
    let result = router.stream_chat(
        Some("caller-key"),
        "caller-model",
        None,
        &[],
        &[],
        &mut |c| {
            chunks.push(c.to_string());
            Ok(())
        },
    );
    (result, chunks)
}

pub(super) fn kind_of(error: &anyhow::Error) -> Option<ProviderErrorKind> {
    error.downcast_ref::<ProviderError>().map(|e| e.kind)
}
