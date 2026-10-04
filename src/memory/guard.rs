//! What long-term memory refuses to store: credentials, and anything rule 68
//! classifies as confidential or sovereign.
//!
//! WS4 keeps its own small credential check for now. It can be swapped for a
//! shared one once the WS1 masking code is merged (contract, question 6).

use crate::route::{classify_sensitivity, Sensitivity};

/// Prefixes of well known API key formats.
const KEY_PREFIXES: [&str; 8] = ["sk-", "AIza", "gsk_", "xai-", "hf_", "ghp_", "github_pat_", "AKIA"];
/// Shortest token that counts as a key when it starts with a known prefix, so
/// words such as "sk-learn" pass.
const MIN_KEY_LEN: usize = 16;
/// Shortest token after the word "Bearer" that counts as a credential.
const MIN_BEARER_LEN: usize = 20;

/// Why `texts` must not be stored, or `None` when they may be.
pub(super) fn refusal_reason(texts: &[&str]) -> Option<String> {
    if let Some(kind) = texts.iter().find_map(|text| secret_kind(text)) {
        return Some(format!("it looks like {kind}"));
    }
    let (sensitivity, signals) = classify_sensitivity(&texts.join("\n"));
    match sensitivity {
        Sensitivity::Public | Sensitivity::Internal => None,
        other => Some(format!("{other:?} context under rule 68 ({})", signals.join(", "))),
    }
}

fn is_token_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.')
}

fn secret_kind(text: &str) -> Option<&'static str> {
    if text.contains("-----BEGIN") && text.contains("PRIVATE KEY") {
        return Some("a private key");
    }
    let tokens: Vec<&str> = text.split(|c: char| !is_token_char(c)).filter(|t| !t.is_empty()).collect();
    for (index, token) in tokens.iter().enumerate() {
        if token.len() >= MIN_KEY_LEN && KEY_PREFIXES.iter().any(|prefix| token.starts_with(prefix)) {
            return Some("an API key");
        }
        let next_len = tokens.get(index + 1).map_or(0, |next| next.len());
        if token.eq_ignore_ascii_case("bearer") && next_len >= MIN_BEARER_LEN {
            return Some("a bearer token");
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credential_shaped_text_is_refused() {
        let cases = [
            "token sk-ant-api03-ABCDEFGHIJKLMNOP1234",
            "AKIA0123456789ABCDEF is the id",
            "key gsk_0123456789abcdefABCDEF",
            "ghp_0123456789abcdefABCDEF",
            "hf_0123456789abcdefABCDEF",
            "xai-0123456789abcdefABCDEF",
            "AIzaSyFAKEFAKEFAKEFAKE12345678",
            "-----BEGIN RSA PRIVATE KEY-----\nMIIE...",
            "Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789",
        ];
        for text in cases {
            assert!(refusal_reason(&[text]).is_some(), "{text} should be refused");
        }
    }

    #[test]
    fn ordinary_notes_are_allowed() {
        let cases = [
            "the sk-learn package is installed",
            "rotate the api key every 90 days",
            "use Bearer auth on the internal API",
            "AKIA prefixes belong to AWS access keys",
            "prefers tabs over spaces",
            "quyết định dùng SQLite cho phiên chat",
        ];
        for text in cases {
            assert_eq!(refusal_reason(&[text]), None, "{text} should be allowed");
        }
    }

    #[test]
    fn confidential_context_is_refused_under_rule_68() {
        assert!(refusal_reason(&["notes on the M&A negotiation"]).is_some());
        assert!(refusal_reason(&["#mật kế hoạch chưa công bố"]).is_some());
    }

    #[test]
    fn any_of_several_fields_can_trigger_a_refusal() {
        assert!(refusal_reason(&["fine key", "fine value", "sk-ant-api03-ABCDEFGHIJKLMNOP1234"]).is_some());
    }
}
