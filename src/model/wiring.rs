//! Assembles the provider a chat session actually talks to (WS1 wiring).
//!
//! With no fallback providers configured and no `<ENV>_POOL` variable set,
//! `assemble` returns the primary provider untouched, so a user who configures
//! nothing gets exactly the behavior they had before. Otherwise it wraps the
//! primary in a `FailoverProvider` with the pools and fallbacks asked for.
//!
//! Everything here is pure: the environment and the provider catalog come in
//! as parameters, so tests never touch process-wide state.

use super::credential_pool::{parse_keys, CredentialPool};
use super::failover::{FailoverPolicy, FailoverProvider, FallbackRoute};
use super::provider::ChatProvider;
use std::sync::Arc;

/// Look up an environment variable. Empty values count as unset.
pub type EnvLookup<'a> = &'a dyn Fn(&str) -> Option<String>;
/// Resolve a provider name to a provider, as `catalog::try_select_provider` does.
pub type ProviderSelect<'a> = &'a dyn Fn(&str) -> Result<Arc<dyn ChatProvider>, String>;

pub struct Wiring {
    pub provider: Arc<dyn ChatProvider>,
    /// Human readable notes about what was skipped or enabled. The caller
    /// decides where to print them.
    pub notes: Vec<String>,
}

/// The key the primary provider should start with: the single-key variable
/// if set, otherwise the first key of `<env_var>_POOL`.
pub fn resolve_primary_key(env_var: &str, lookup: EnvLookup) -> Option<String> {
    let single = lookup(env_var);
    let pool = lookup(&pool_var(env_var));
    parse_keys(single.as_deref(), pool.as_deref()).into_iter().next()
}

fn pool_var(env_var: &str) -> String {
    format!("{env_var}_POOL")
}

/// A pool of every key found for `provider`, or `None` when there are none.
fn pool_for(provider: &dyn ChatProvider, lookup: EnvLookup) -> Option<Arc<CredentialPool>> {
    let pool = CredentialPool::from_lookup(provider.env_var(), |name| lookup(name));
    (pool.len() > 0).then(|| Arc::new(pool))
}

/// The primary uses a pool only when the user set `<ENV>_POOL`; a lone
/// `<ENV>` keeps the exact path it always had.
fn primary_pool(primary: &dyn ChatProvider, lookup: EnvLookup) -> Option<Arc<CredentialPool>> {
    if !primary.requires_key() || lookup(&pool_var(primary.env_var())).is_none() {
        return None;
    }
    pool_for(primary, lookup)
}

fn build_fallback(
    name: &str,
    primary: &dyn ChatProvider,
    seen: &mut Vec<String>,
    select: ProviderSelect,
    lookup: EnvLookup,
) -> Result<FallbackRoute, String> {
    let skipped = |why: String| format!("fallback provider '{name}' skipped: {why}");
    let provider = select(name).map_err(|why| skipped(why))?;
    if provider.name() == primary.name() {
        return Err(skipped("same as the primary provider".to_string()));
    }
    if seen.iter().any(|already| already == provider.name()) {
        return Err(skipped("listed more than once".to_string()));
    }
    let (api_key, pool) = if provider.requires_key() {
        let pool = pool_for(&*provider, lookup)
            .ok_or_else(|| skipped(format!("{} is not set", provider.env_var())))?;
        if lookup(&pool_var(provider.env_var())).is_some() {
            (None, Some(pool))
        } else {
            (lookup(provider.env_var()), None)
        }
    } else {
        (None, None)
    };
    seen.push(provider.name().to_string());
    let model = provider.default_model().to_string();
    Ok(FallbackRoute { provider, model, api_key, pool })
}

pub fn assemble(
    primary: Arc<dyn ChatProvider>,
    fallback_names: &[String],
    select: ProviderSelect,
    lookup: EnvLookup,
) -> Wiring {
    let mut notes = Vec::new();
    let mut seen = Vec::new();
    let mut fallbacks = Vec::new();
    for name in fallback_names {
        match build_fallback(name, &*primary, &mut seen, select, lookup) {
            Ok(route) => fallbacks.push(route),
            Err(note) => notes.push(note),
        }
    }
    let pool = primary_pool(&*primary, lookup);
    if pool.is_none() && fallbacks.is_empty() {
        return Wiring { provider: primary, notes };
    }
    let mut chain = vec![primary.name().to_string()];
    chain.extend(fallbacks.iter().map(|route| route.provider.name().to_string()));
    notes.push(format!("failover enabled: {}", chain.join(" -> ")));
    let mut router = FailoverProvider::new(primary, fallbacks, FailoverPolicy::default());
    if let Some(pool) = pool {
        router = router.with_primary_pool(pool);
    }
    Wiring { provider: Arc::new(router), notes }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::provider::{ChatMessage, ChatUsage};
    use crate::model::provider_error::ProviderError;
    use crate::model::tool::{StreamOutcome, ToolSpec};
    use std::collections::HashMap;
    use std::sync::Mutex;

    struct Fake {
        name: &'static str,
        env: &'static str,
        needs_key: bool,
        fail_with: Option<u16>,
        keys_seen: Mutex<Vec<String>>,
    }

    impl Fake {
        fn new(name: &'static str, env: &'static str, needs_key: bool) -> Arc<Self> {
            Arc::new(Self { name, env, needs_key, fail_with: None, keys_seen: Mutex::new(Vec::new()) })
        }
        fn failing(name: &'static str, env: &'static str, status: u16) -> Arc<Self> {
            Arc::new(Self { name, env, needs_key: true, fail_with: Some(status), keys_seen: Mutex::new(Vec::new()) })
        }
        fn keys(&self) -> Vec<String> {
            self.keys_seen.lock().unwrap().clone()
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
            self.needs_key
        }
        fn env_var(&self) -> &str {
            self.env
        }
        fn stream_chat(
            &self,
            api_key: Option<&str>,
            _model: &str,
            _system: Option<&str>,
            _messages: &[ChatMessage],
            _tools: &[ToolSpec],
            on_chunk: &mut dyn FnMut(&str) -> anyhow::Result<()>,
        ) -> anyhow::Result<(ChatUsage, StreamOutcome)> {
            self.keys_seen.lock().unwrap().push(api_key.unwrap_or("").to_string());
            if let Some(status) = self.fail_with {
                return Err(anyhow::Error::new(ProviderError::from_http(self.name, status, "x", None)));
            }
            on_chunk(self.name)?;
            Ok((ChatUsage::default(), StreamOutcome::Text))
        }
    }

    fn env(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    fn call(provider: &Arc<dyn ChatProvider>) -> (anyhow::Result<()>, Vec<String>) {
        let mut chunks = Vec::new();
        let result = provider
            .stream_chat(Some("caller-key"), "m", None, &[], &[], &mut |c| {
                chunks.push(c.to_string());
                Ok(())
            })
            .map(|_| ());
        (result, chunks)
    }

    fn no_select(_: &str) -> Result<Arc<dyn ChatProvider>, String> {
        Err("not expected".to_string())
    }

    #[test]
    fn nothing_configured_returns_the_primary_untouched() {
        let primary: Arc<dyn ChatProvider> = Fake::new("anthropic", "ANTHROPIC_API_KEY", true);
        let vars = env(&[("ANTHROPIC_API_KEY", "k1")]);
        let wiring = assemble(primary.clone(), &[], &no_select, &|n| vars.get(n).cloned());
        assert!(Arc::ptr_eq(&wiring.provider, &primary), "default behavior must not change");
        assert!(wiring.notes.is_empty());
    }

    #[test]
    fn resolve_primary_key_prefers_the_single_variable() {
        let vars = env(&[("K", "single"), ("K_POOL", "p1,p2")]);
        assert_eq!(resolve_primary_key("K", &|n| vars.get(n).cloned()).as_deref(), Some("single"));
    }

    #[test]
    fn resolve_primary_key_falls_back_to_the_first_pool_key() {
        let vars = env(&[("K_POOL", " p1 , p2")]);
        assert_eq!(resolve_primary_key("K", &|n| vars.get(n).cloned()).as_deref(), Some("p1"));
        assert_eq!(resolve_primary_key("K", &|_| None), None);
    }

    #[test]
    fn a_pool_variable_alone_wraps_the_primary_and_rotates_keys() {
        let fake = Fake::failing("anthropic", "ANTHROPIC_API_KEY", 429);
        let primary: Arc<dyn ChatProvider> = fake.clone();
        let vars = env(&[("ANTHROPIC_API_KEY", "k1"), ("ANTHROPIC_API_KEY_POOL", "k2,k3")]);
        let wiring = assemble(primary.clone(), &[], &no_select, &|n| vars.get(n).cloned());
        assert!(!Arc::ptr_eq(&wiring.provider, &primary));
        assert!(call(&wiring.provider).0.is_err());
        assert_eq!(fake.keys(), vec!["k1", "k2", "k3"], "one attempt per pooled key");
    }

    #[test]
    fn a_configured_fallback_is_used_when_the_primary_fails() {
        let primary: Arc<dyn ChatProvider> = Fake::failing("anthropic", "ANTHROPIC_API_KEY", 503);
        let backup = Fake::new("openai", "OPENAI_API_KEY", true);
        let backup_dyn: Arc<dyn ChatProvider> = backup.clone();
        let vars = env(&[("ANTHROPIC_API_KEY", "k1"), ("OPENAI_API_KEY", "o1")]);
        let select = move |name: &str| {
            if name == "openai" { Ok(backup_dyn.clone()) } else { Err(format!("unknown provider {name}")) }
        };
        let wiring = assemble(primary, &["openai".to_string()], &select, &|n| vars.get(n).cloned());
        let (result, chunks) = call(&wiring.provider);
        assert!(result.is_ok());
        assert_eq!(chunks, vec!["openai"]);
        assert_eq!(backup.keys(), vec!["o1"], "the fallback uses its own key, not the caller's");
    }

    #[test]
    fn unusable_fallbacks_are_skipped_with_a_note_and_leave_the_primary_alone() {
        let primary: Arc<dyn ChatProvider> = Fake::new("anthropic", "ANTHROPIC_API_KEY", true);
        let needs_key: Arc<dyn ChatProvider> = Fake::new("openai", "OPENAI_API_KEY", true);
        let same_as_primary: Arc<dyn ChatProvider> = Fake::new("anthropic", "ANTHROPIC_API_KEY", true);
        let select = move |name: &str| match name {
            "openai" => Ok(needs_key.clone()),
            "anthropic" => Ok(same_as_primary.clone()),
            other => Err(format!("unknown provider {other}")),
        };
        let names: Vec<String> = ["nope", "openai", "anthropic"].iter().map(|s| s.to_string()).collect();
        let vars = env(&[("ANTHROPIC_API_KEY", "k1")]);
        let wiring = assemble(primary.clone(), &names, &select, &|n| vars.get(n).cloned());
        assert!(Arc::ptr_eq(&wiring.provider, &primary), "nothing usable, so no wrapper");
        let notes = wiring.notes.join("\n");
        assert!(notes.contains("nope") && notes.contains("OPENAI_API_KEY") && notes.contains("same"), "{notes}");
    }

    #[test]
    fn a_keyless_fallback_needs_no_key() {
        let primary: Arc<dyn ChatProvider> = Fake::failing("anthropic", "ANTHROPIC_API_KEY", 503);
        let local = Fake::new("ollama", "", false);
        let local_dyn: Arc<dyn ChatProvider> = local.clone();
        let select = move |_: &str| Ok(local_dyn.clone());
        let vars = env(&[("ANTHROPIC_API_KEY", "k1")]);
        let wiring = assemble(primary, &["ollama".to_string()], &select, &|n| vars.get(n).cloned());
        assert!(call(&wiring.provider).0.is_ok());
        assert_eq!(local.keys(), vec![""]);
    }

    #[test]
    fn a_fallback_can_have_its_own_pool() {
        let primary: Arc<dyn ChatProvider> = Fake::failing("anthropic", "ANTHROPIC_API_KEY", 503);
        let backup = Fake::failing("openai", "OPENAI_API_KEY", 429);
        let backup_dyn: Arc<dyn ChatProvider> = backup.clone();
        let select = move |_: &str| Ok(backup_dyn.clone());
        let vars = env(&[("ANTHROPIC_API_KEY", "k1"), ("OPENAI_API_KEY_POOL", "o1,o2")]);
        let wiring = assemble(primary, &["openai".to_string()], &select, &|n| vars.get(n).cloned());
        assert!(call(&wiring.provider).0.is_err());
        assert_eq!(backup.keys(), vec!["o1", "o2"]);
    }
}
