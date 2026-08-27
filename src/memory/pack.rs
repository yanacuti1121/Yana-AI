//! Deterministic, explainable lexical ranking and bounded prompt-pack
//! assembly for L3 memory. Split out of `memory/mod.rs` to stay under this
//! repo's 300-line file limit (`core/rules/agent-code-constraints.md`).

use super::L3Fact;
use serde::Serialize;

/// A deterministic, explainable match for assembling a small amount of
/// project memory into a model prompt. This is local-only: no embedding
/// provider receives the memory store just to answer a query.
#[derive(Debug, Serialize, Clone)]
pub struct RankedFact {
    pub fact: L3Fact,
    pub score: u32,
    pub matched_terms: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct MemoryPack {
    pub query: String,
    pub facts: Vec<RankedFact>,
    pub omitted_sensitive: usize,
    pub character_count: usize,
    pub text: String,
}

fn terms(value: &str) -> Vec<String> {
    value.split(|c: char| !c.is_alphanumeric())
        .filter(|term| term.chars().count() >= 2)
        .map(|term| term.to_lowercase())
        .collect()
}

/// Transparent lexical ranking: key matches are strongest, then tags, then
/// fact text. This stays inspectable rather than hiding a similarity score.
pub fn rank_facts(facts: &[L3Fact], query: &str, limit: usize) -> Vec<RankedFact> {
    let query_terms = terms(query);
    if query_terms.is_empty() || limit == 0 { return Vec::new(); }
    let phrase = query.trim().to_lowercase();
    let mut ranked: Vec<_> = facts.iter().filter_map(|fact| {
        let key = fact.key.to_lowercase();
        let value = fact.value.to_lowercase();
        let tags: Vec<String> = fact.tags.iter().map(|tag| tag.to_lowercase()).collect();
        let mut score = 0;
        let mut matched_terms = Vec::new();
        for term in &query_terms {
            let mut matched = false;
            if key.contains(term) { score += 5; matched = true; }
            if tags.iter().any(|tag| tag.contains(term)) { score += 3; matched = true; }
            if value.contains(term) { score += 1; matched = true; }
            if matched { matched_terms.push(term.clone()); }
        }
        if !phrase.is_empty() && (key.contains(&phrase) || value.contains(&phrase)) { score += 6; }
        (score > 0).then(|| RankedFact { fact: fact.clone(), score, matched_terms })
    }).collect();
    ranked.sort_by(|left, right| {
        right.score.cmp(&left.score)
            .then_with(|| right.fact.updated_at.cmp(&left.fact.updated_at))
            .then_with(|| left.fact.key.cmp(&right.fact.key))
    });
    ranked.truncate(limit);
    ranked
}

/// Build a bounded prompt fragment from L3 facts, retaining key, confidence,
/// and timestamp. Rule 68 confidential/sovereign facts are omitted by default.
pub fn build_memory_pack(facts: &[L3Fact], query: &str, limit: usize, max_chars: usize) -> MemoryPack {
    let mut selected = Vec::new();
    let mut omitted_sensitive = 0;
    let header = "Relevant project memory (local, inspect before relying on it):\n";
    let mut text: String = header.chars().take(max_chars).collect();
    for ranked in rank_facts(facts, query, limit) {
        let source = format!("{} {} {}", ranked.fact.key, ranked.fact.value, ranked.fact.tags.join(" "));
        let (sensitivity, _) = crate::route::classify_sensitivity(&source);
        if !matches!(sensitivity, crate::route::Sensitivity::Public | crate::route::Sensitivity::Internal) {
            omitted_sensitive += 1;
            continue;
        }
        let line = format!("- [{} | {} | {}] {}\n", ranked.fact.key, ranked.fact.confidence, ranked.fact.updated_at, ranked.fact.value);
        if text.chars().count().saturating_add(line.chars().count()) > max_chars { break; }
        text.push_str(&line);
        selected.push(ranked);
    }
    let character_count = text.chars().count();
    MemoryPack { query: query.to_string(), facts: selected, omitted_sensitive, character_count, text }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fact(key: &str, value: &str, tags: &[&str], updated_at: &str) -> L3Fact {
        L3Fact { id: "00000000-0000-0000-0000-000000000001".into(), key: key.into(), value: value.into(),
            tags: tags.iter().map(|tag| (*tag).into()).collect(), agent: None, confidence: "high".into(),
            scope: "both".into(), created_at: updated_at.into(), updated_at: updated_at.into(), promoted: false }
    }

    #[test]
    fn recall_prioritizes_key_and_tag_matches() {
        let facts = vec![fact("deploy-guide", "production checklist", &["release"], "2026-01-01T00:00:00Z"),
            fact("notes", "deploy is mentioned here", &[], "2026-02-01T00:00:00Z")];
        let ranked = rank_facts(&facts, "deploy", 10);
        assert_eq!(ranked.len(), 2);
        assert_eq!(ranked[0].fact.key, "deploy-guide");
        assert!(ranked[0].score > ranked[1].score);
    }

    /// Regression test for code-auditor review (2026-08-27): every prior
    /// test used a limit large enough that nothing was ever actually
    /// dropped. This proves `limit` really excludes the lowest-priority
    /// match rather than just capping how many are iterated.
    #[test]
    fn rank_facts_excludes_the_lowest_scoring_match_beyond_the_limit() {
        let facts = vec![
            // key + tag + value + phrase match -> highest score.
            fact("deploy-guide", "deploy deploy deploy", &["deploy"], "2026-01-01T00:00:00Z"),
            // value-only + phrase match, older -> loses the tie-break below.
            fact("notes-a", "deploy mentioned once", &[], "2026-01-02T00:00:00Z"),
            // value-only + phrase match, newer -> wins the tie-break.
            fact("notes-b", "deploy mentioned too", &[], "2026-01-03T00:00:00Z"),
        ];
        let ranked = rank_facts(&facts, "deploy", 2);
        assert_eq!(ranked.len(), 2, "limit=2 must exclude one match, not include all three");
        assert_eq!(ranked[0].fact.key, "deploy-guide");
        assert_eq!(ranked[1].fact.key, "notes-b", "newer fact wins a score tie");
        assert!(
            !ranked.iter().any(|item| item.fact.key == "notes-a"),
            "the 3rd, lowest-priority match must be excluded, not silently included"
        );
    }

    #[test]
    fn pack_is_bounded_and_preserves_fact_provenance() {
        let facts = vec![fact("rust-style", "Use explicit error handling.", &["rust"], "2026-01-01T00:00:00Z")];
        let pack = build_memory_pack(&facts, "rust", 10, 500);
        assert_eq!(pack.facts.len(), 1);
        assert!(pack.text.contains("[rust-style | high | 2026-01-01T00:00:00Z]"));
        assert!(pack.character_count <= 500);
    }

    #[test]
    fn pack_honors_a_limit_smaller_than_its_header() {
        let pack = build_memory_pack(&[], "rust", 10, 12);
        assert_eq!(pack.character_count, 12);
        assert_eq!(pack.text.chars().count(), 12);
    }

    /// Regression test for code-auditor review (2026-08-27): every prior
    /// `max_chars` test used either no facts or a budget generous enough
    /// that nothing was ever excluded on size grounds. This proves a fact
    /// that doesn't fit is dropped whole, not truncated mid-line, and that
    /// the exclusion isn't misreported as a rule-68 sensitivity omission.
    #[test]
    fn pack_excludes_a_lower_ranked_fact_that_does_not_fit_under_max_chars() {
        let facts = vec![
            fact("rust-a", "First fact that fits easily.", &["rust"], "2026-01-02T00:00:00Z"),
            fact("rust-b", "Second fact that will not fit in the remaining budget because it is long.", &["rust"], "2026-01-01T00:00:00Z"),
        ];
        let header = "Relevant project memory (local, inspect before relying on it):\n";
        let first_line = "- [rust-a | high | 2026-01-02T00:00:00Z] First fact that fits easily.\n";
        let max_chars = header.chars().count() + first_line.chars().count();
        let pack = build_memory_pack(&facts, "rust", 10, max_chars);
        assert_eq!(pack.facts.len(), 1, "the fact that doesn't fit must be excluded entirely, not truncated");
        assert_eq!(pack.facts[0].fact.key, "rust-a");
        assert_eq!(pack.omitted_sensitive, 0, "exclusion here is a size decision, not a rule-68 decision");
        assert!(pack.character_count <= max_chars);
        assert!(!pack.text.contains("rust-b"), "the excluded fact's content must not appear even partially");
    }

    #[test]
    fn pack_omits_confidential_facts() {
        let facts = vec![fact("deal", "M&A negotiation position", &[], "2026-01-01T00:00:00Z")];
        let pack = build_memory_pack(&facts, "negotiation", 10, 500);
        assert!(pack.facts.is_empty());
        assert_eq!(pack.omitted_sensitive, 1);
    }
}
