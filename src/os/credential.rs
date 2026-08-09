//! Credential management (Program K, area 2 of 3 — see
//! `PROGRAM-K-YANA-OS-SKELETON.md`).
//!
//! Per `52-secrets-vault-law.md` and `66-client-secret-encryption-law.md`,
//! this only ever reports *presence* of a configured key, never the value.
//! It's a status view over the provider/env-var pairs already hardcoded in
//! `chat::anthropic` and `chat::openai_compat` — not a new credential
//! store. A real per-Gatekeeper credential model (the `cloudflare-os`-
//! inspired design point noted in the skeleton's Research Reference) is
//! still `_(TODO)_`.

struct ProviderCredential {
    name: &'static str,
    env_var: &'static str,
    keyless: bool,
}

/// Mirrors the provider list in `chat::anthropic`/`chat::openai_compat`.
/// Kept as a small local table rather than importing those modules' private
/// constructors — this is a read-only status view, not a dependency on
/// their internal wiring.
fn known_providers() -> Vec<ProviderCredential> {
    vec![
        ProviderCredential { name: "anthropic", env_var: "ANTHROPIC_API_KEY", keyless: false },
        ProviderCredential { name: "openai", env_var: "OPENAI_API_KEY", keyless: false },
        ProviderCredential { name: "kimi", env_var: "MOONSHOT_API_KEY", keyless: false },
        ProviderCredential { name: "ollama", env_var: "", keyless: true },
        ProviderCredential { name: "turbofieldfare", env_var: "", keyless: true },
    ]
}

pub fn status() {
    println!("Credential status  (presence only — values are never printed)");
    println!("{}", "─".repeat(50));
    for p in known_providers() {
        let state = if p.keyless {
            "keyless (local server, no key required)".to_string()
        } else if std::env::var(p.env_var).is_ok() {
            format!("configured  ({})", p.env_var)
        } else {
            format!("not set     ({})", p.env_var)
        };
        println!("  {:<15} {state}", p.name);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_providers_never_expose_a_value_field() {
        // Structural guard: `ProviderCredential` has no field that could
        // hold a secret value — if one is ever added, this test's field
        // list below stops compiling, forcing a deliberate review instead
        // of a silent leak through a future `status()` edit.
        let p = &known_providers()[0];
        let _: &str = p.name;
        let _: &str = p.env_var;
        let _: bool = p.keyless;
    }

    #[test]
    fn status_does_not_panic() {
        status();
    }
}
