use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct Finding {
    pub id:           String,
    pub severity:     String,
    pub category:     String,
    pub file:         String,
    pub line:         Option<u32>,
    pub rule:         String,
    pub reason:       String,
    pub message:      String,
    pub fix:          String,
    pub confidence:   String,
    pub matched_value: String,
    pub description:  String,
}

#[derive(Debug, Serialize)]
pub struct SummaryCount {
    pub total: usize, pub critical: usize, pub high: usize,
    pub medium: usize, pub low: usize, pub info: usize,
}

#[derive(Debug, Serialize)]
pub struct ScanStats {
    pub files_scanned: usize, pub files_skipped: usize,
    pub files_ignored: usize, pub scanners_run: usize,
    pub checks_applied: usize, pub duration_ms: u64,
}

#[derive(Debug, Serialize)]
pub struct TopRule {
    pub id: String, pub severity: String,
    pub count: usize, pub category: String,
}

#[derive(Debug, Serialize)]
pub struct Analytics {
    pub by_category:        std::collections::HashMap<String, usize>,
    pub top_rules:          Vec<TopRule>,
    pub files_with_findings: usize,
    pub files_clean:        usize,
    pub hit_rate_pct:       f64,
}

#[derive(Debug, Serialize)]
pub struct ScanReport {
    pub schema_version: String,
    pub generated_at:   String,
    pub target:         String,
    pub yamtam_version: String,
    pub score:          u32,
    pub risk_level:     String,
    pub status:         String,
    pub summary:        SummaryCount,
    pub scan_stats:     ScanStats,
    pub analytics:      Analytics,
    pub findings:       Vec<Finding>,
}
