// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Confidence(u8);

impl Confidence {
    pub fn new(value: u8) -> Self {
        Self(value.min(100))
    }

    pub fn value(self) -> u8 {
        self.0
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Evidence {
    pub path: String,
    pub start_line: usize,
    pub end_line: usize,
    pub reason: String,
    pub confidence: Confidence,
}

impl Evidence {
    pub fn new(
        path: impl Into<String>,
        start_line: usize,
        end_line: usize,
        reason: impl Into<String>,
        confidence: u8,
    ) -> Result<Self, LensError> {
        if start_line == 0 || end_line < start_line {
            return Err(LensError::InvalidLineRange {
                start_line,
                end_line,
            });
        }

        Ok(Self {
            path: path.into(),
            start_line,
            end_line,
            reason: reason.into(),
            confidence: Confidence::new(confidence),
        })
    }
}

#[derive(Debug, Default)]
pub struct Lens {
    evidence: Vec<Evidence>,
}

impl Lens {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn collect(&mut self, evidence: Evidence) {
        self.evidence.push(evidence);
    }

    pub fn all(&self) -> &[Evidence] {
        &self.evidence
    }

    pub fn strongest(&self) -> Option<&Evidence> {
        self.evidence
            .iter()
            .max_by_key(|evidence| evidence.confidence)
    }

    pub fn for_path<'a>(&'a self, path: &'a str) -> impl Iterator<Item = &'a Evidence> {
        self.evidence
            .iter()
            .filter(move |evidence| evidence.path == path)
    }

    pub fn clear(&mut self) {
        self.evidence.clear();
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LensError {
    InvalidLineRange { start_line: usize, end_line: usize },
}

impl std::fmt::Display for LensError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidLineRange {
                start_line,
                end_line,
            } => write!(
                formatter,
                "invalid evidence range: {start_line}..={end_line}"
            ),
        }
    }
}

impl std::error::Error for LensError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn confidence_is_clamped() {
        assert_eq!(Confidence::new(180).value(), 100);
    }

    #[test]
    fn strongest_evidence_is_returned() {
        let mut lens = Lens::new();
        lens.collect(Evidence::new("src/a.rs", 1, 4, "weak", 30).unwrap());
        lens.collect(Evidence::new("src/b.rs", 8, 12, "strong", 92).unwrap());
        assert_eq!(lens.strongest().unwrap().path, "src/b.rs");
    }
}
