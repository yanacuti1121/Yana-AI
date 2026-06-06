use unicode_normalization::UnicodeNormalization;

/// NFC normalize + lowercase — canonical form for Vietnamese Unicode
pub fn normalize(s: &str) -> String {
    s.nfc().collect::<String>().to_lowercase()
}

/// NFD decompose then strip combining diacritical marks.
/// "Việt Nam" → "Viet Nam", "năm" → "nam"
pub fn strip_diacritics(s: &str) -> String {
    s.nfd()
        .filter(|c| {
            let n = *c as u32;
            // Remove combining diacritical marks ranges
            !(0x0300..=0x036F).contains(&n)
                && !(0x1DC0..=0x1DFF).contains(&n)
                && !(0x20D0..=0x20FF).contains(&n)
                && !(0xFE20..=0xFE2F).contains(&n)
        })
        .collect()
}

/// Check if query matches text.
/// accent_insensitive: "viet" matches "Việt", "nam" matches "Năm"
pub fn matches(query: &str, text: &str, accent_insensitive: bool) -> bool {
    let (q, t) = if accent_insensitive {
        (strip_diacritics(&normalize(query)), strip_diacritics(&normalize(text)))
    } else {
        (normalize(query), normalize(text))
    };
    // Each query term must appear as a whole word in text (prevents "sync"⊂"async")
    let words: Vec<&str> = t.split_whitespace().collect();
    q.split_whitespace().all(|term| words.contains(&term))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accent_insensitive_vi() {
        assert!(matches("viet", "Việt Nam", true));
        assert!(matches("rust", "học Rust", false));
        assert!(!matches("java", "học Rust", false));
    }

    #[test]
    fn multi_term_search() {
        assert!(matches("rust async", "Rust async programming guide", false));
        assert!(!matches("rust sync", "Rust async programming guide", false));
    }

    #[test]
    fn empty_query() {
        assert!(matches("", "anything", false));
    }
}
