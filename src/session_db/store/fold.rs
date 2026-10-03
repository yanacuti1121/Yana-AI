//! Text folding for search: lowercase, no accents, no Unicode form differences.
//!
//! Done in Rust, before text reaches SQLite, so the behavior does not depend
//! on the SQLite tokenizer's diacritics handling. In particular the
//! Vietnamese `đ` has no decomposition into `d` plus a mark, so a tokenizer
//! that only strips combining marks would not fold it.

use unicode_normalization::char::is_combining_mark;
use unicode_normalization::UnicodeNormalization;

/// Most terms of one query that are used; the rest are dropped.
const MAX_TERMS: usize = 32;

/// Lowercase, strip combining marks, map `đ` to `d`. Other characters,
/// including spaces and punctuation, are kept.
pub(super) fn fold(text: &str) -> String {
    text.chars()
        .map(|c| if matches!(c, 'đ' | 'Đ') { 'd' } else { c })
        .nfd()
        .filter(|c| !is_combining_mark(*c))
        .flat_map(char::to_lowercase)
        .collect()
}

/// The words of a query, folded. Anything that is not a letter or digit
/// separates words, so quotes, operators and control characters never
/// reach the search engine.
pub(super) fn search_terms(query: &str) -> Vec<String> {
    fold(query)
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .take(MAX_TERMS)
        .map(str::to_string)
        .collect()
}
