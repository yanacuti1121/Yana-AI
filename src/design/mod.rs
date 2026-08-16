use anyhow::Result;
use clap::Subcommand;
use regex::Regex;
use std::collections::HashMap;
use std::net::ToSocketAddrs;
use std::path::Path;

const DESIGN_DIR: &str = ".yana-ai/design";
const DESIGN_FILE: &str = "design-context.json";

// ── CLI ───────────────────────────────────────────────────────────────────────

#[derive(Subcommand, Debug)]
pub enum DesignAction {
    /// Extract design tokens from URL or local CSS/HTML file
    Extract {
        source: String,
        #[arg(long, default_value = ".")] target: String,
        #[arg(long)] json: bool,
        #[arg(long)] quiet: bool,
    },
    /// Show extracted design context
    Show {
        #[arg(long, default_value = ".")] target: String,
        #[arg(long)] json: bool,
    },
    /// Generate DESIGN.md from extracted tokens
    Init {
        #[arg(long, default_value = ".")] target: String,
        #[arg(long, value_name = "FILE")] out: Option<String>,
    },
}

pub fn dispatch(action: DesignAction) {
    let result = match action {
        DesignAction::Extract { source, target, json, quiet } =>
            cmd_extract(&source, &target, json, quiet),
        DesignAction::Show { target, json } =>
            cmd_show(&target, json),
        DesignAction::Init { target, out } =>
            cmd_init(&target, out.as_deref()),
    };
    if let Err(e) = result {
        eprintln!("[design] error: {e}");
        std::process::exit(1);
    }
}

// ── Extract ───────────────────────────────────────────────────────────────────

fn cmd_extract(source: &str, target: &str, as_json: bool, quiet: bool) -> Result<()> {
    validate_relative_path(target, "--target")?;
    if !quiet { eprintln!("[design] fetching {}…", source); }

    let html = fetch_source(source)?;
    let css  = extract_css(&html);
    let tokens = extract_tokens(&css, &html);

    let dir = Path::new(target).join(DESIGN_DIR);
    std::fs::create_dir_all(&dir)?;
    let out = dir.join(DESIGN_FILE);
    std::fs::write(&out, serde_json::to_string_pretty(&tokens)?)?;

    if as_json {
        println!("{}", serde_json::to_string_pretty(&tokens)?);
    } else {
        print_tokens(&tokens);
        if !quiet { eprintln!("\n[design] saved → {}", out.display()); }
    }
    Ok(())
}

fn cmd_show(target: &str, as_json: bool) -> Result<()> {
    validate_relative_path(target, "--target")?;
    let path = Path::new(target).join(DESIGN_DIR).join(DESIGN_FILE);
    let s = std::fs::read_to_string(&path)
        .map_err(|_| anyhow::anyhow!("No design context. Run: yana-rt design extract <url>"))?;
    let tokens: DesignTokens = serde_json::from_str(&s)?;
    if as_json { println!("{}", serde_json::to_string_pretty(&tokens)?); }
    else { print_tokens(&tokens); }
    Ok(())
}

fn cmd_init(target: &str, out_path: Option<&str>) -> Result<()> {
    validate_relative_path(target, "--target")?;
    let path = Path::new(target).join(DESIGN_DIR).join(DESIGN_FILE);
    let s = std::fs::read_to_string(&path)
        .map_err(|_| anyhow::anyhow!("No design context. Run: yana-rt design extract <url> first"))?;
    let tokens: DesignTokens = serde_json::from_str(&s)?;
    let md = tokens_to_markdown(&tokens);
    let dest = out_path.unwrap_or("DESIGN.md");
    validate_relative_path(dest, "--out")?;
    std::fs::write(dest, &md)?;
    println!("[design] DESIGN.md → {}", dest);
    Ok(())
}

// ── Security helpers ──────────────────────────────────────────────────────────

fn validate_relative_path(path: &str, label: &str) -> Result<()> {
    let p = Path::new(path);
    if p.is_absolute() {
        anyhow::bail!("{} must be a relative path, got: '{}'", label, path);
    }
    for component in p.components() {
        if matches!(component, std::path::Component::ParentDir) {
            anyhow::bail!("{} must not contain '..': '{}'", label, path);
        }
    }
    Ok(())
}

fn extract_url_host(url: &str) -> Option<&str> {
    let without_scheme = url.split("://").nth(1)?;
    let host_port = without_scheme.split('/').next()?;
    Some(host_port.split(':').next()?)
}

/// BUG FIX (Workstream A stabilization doc, Section 15-21 — SSRF network
/// caller inventory): this is a second, independent SSRF guard from
/// `core/hooks/tool-validator.sh`'s WebFetch guard (that one gates Claude
/// Code's own WebFetch tool; this one gates `yana-rt design extract
/// <url>`, a real, separately-reachable user-controlled-URL fetch this
/// crate makes on its own). It had the exact same CGNAT gap
/// tool-validator.sh's own audit trail already found and fixed in the
/// OTHER guard, never ported here: `Ipv4Addr::is_private()` covers
/// RFC1918 (10/8, 172.16/12, 192.168/16) but NOT RFC6598 Carrier-Grade
/// NAT / Shared Address Space (100.64.0.0/10) -- where Alibaba Cloud's
/// metadata endpoint (100.100.100.200) lives. Reproduced live before
/// fixing: `is_private_ip("100.100.100.200".parse().unwrap())` returned
/// `false` on the pre-fix code. The IPv6 side was thinner still -- only
/// loopback/unspecified, no unique-local (fc00::/7) or link-local
/// (fe80::/10) equivalent, and no IPv4-mapped-address unwrapping (an
/// attacker-supplied `::ffff:100.100.100.200` would resolve, classify as
/// "not loopback, not unspecified", and pass straight through).
fn is_private_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => is_private_ipv4(v4),
        std::net::IpAddr::V6(v6) => {
            if let Some(mapped) = v6.to_ipv4_mapped() {
                return is_private_ipv4(mapped);
            }
            v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || is_unique_local_v6(v6)
                || is_link_local_v6(v6)
        }
    }
}

fn is_private_ipv4(v4: std::net::Ipv4Addr) -> bool {
    v4.is_loopback()
        || v4.is_private()
        || v4.is_link_local()
        || v4.is_unspecified()
        || is_cgnat_v4(v4)
}

/// 100.64.0.0/10 (RFC 6598) -- checked via raw octets rather than a
/// stdlib helper: `Ipv4Addr` has no built-in CGNAT classification, and a
/// manual bitmask keeps this independent of any particular Rust stdlib
/// version.
fn is_cgnat_v4(v4: std::net::Ipv4Addr) -> bool {
    let octets = v4.octets();
    octets[0] == 100 && (octets[1] & 0b1100_0000) == 0b0100_0000
}

/// fc00::/7 (RFC 4193 Unique Local Address).
fn is_unique_local_v6(v6: std::net::Ipv6Addr) -> bool {
    (v6.segments()[0] & 0xfe00) == 0xfc00
}

/// fe80::/10 (link-local).
fn is_link_local_v6(v6: std::net::Ipv6Addr) -> bool {
    (v6.segments()[0] & 0xffc0) == 0xfe80
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

fn fetch_source(source: &str) -> Result<String> {
    if source.starts_with("http://") || source.starts_with("https://") {
        let host = extract_url_host(source)
            .ok_or_else(|| anyhow::anyhow!("could not extract host from URL: '{}'", source))?;
        // Resolve and reject private/internal IPs (SSRF prevention)
        let resolved: Vec<_> = format!("{}:80", host)
            .to_socket_addrs()
            .map_err(|e| anyhow::anyhow!("DNS resolution failed for '{}': {}", host, e))?
            .collect();
        for addr in &resolved {
            if is_private_ip(addr.ip()) {
                anyhow::bail!(
                    "SSRF blocked: '{}' resolves to private/internal address {}",
                    host, addr.ip()
                );
            }
        }
        let resp = ureq::get(source)
            .header("User-Agent", "yana-rt/0.9 design-extractor")
            .call()
            .map_err(|e| anyhow::anyhow!("fetch failed: {e}"))?;
        Ok(resp.into_body().read_to_string()?)
    } else {
        // Local file — must stay within project (no absolute paths, no ..)
        validate_relative_path(source, "source")?;
        Ok(std::fs::read_to_string(source)?)
    }
}

fn extract_css(html: &str) -> String {
    let mut css = String::new();
    // Inline <style> blocks
    let style_re = Regex::new(r"(?s)<style[^>]*>(.*?)</style>").unwrap();
    for cap in style_re.captures_iter(html) {
        css.push_str(&cap[1]);
        css.push('\n');
    }
    // Inline style= attributes
    let attr_re = Regex::new(r#"style="([^"]+)""#).unwrap();
    for cap in attr_re.captures_iter(html) {
        css.push_str(&cap[1]);
        css.push(';');
    }
    css
}

// ── Token extraction ─────────────────────────────────────────────────────────

#[derive(Debug, serde::Serialize, serde::Deserialize, Default)]
pub struct DesignTokens {
    pub source:       String,
    pub colors:       Vec<String>,
    pub fonts:        Vec<String>,
    pub font_sizes:   Vec<String>,
    pub spacing:      Vec<String>,
    pub border_radius: Vec<String>,
    pub shadows:      Vec<String>,
    pub css_vars:     HashMap<String, String>,
}

fn extract_tokens(css: &str, html: &str) -> DesignTokens {
    let combined = format!("{}\n{}", css, html);
    DesignTokens {
        source:       String::new(),
        colors:       unique(extract_colors(&combined)),
        fonts:        unique(extract_fonts(&combined)),
        font_sizes:   unique(extract_font_sizes(css)),
        spacing:      unique(extract_spacing(css)),
        border_radius: unique(extract_border_radius(css)),
        shadows:      unique(extract_shadows(css)),
        css_vars:     extract_css_vars(css),
    }
}

fn extract_colors(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    // hex
    let hex = Regex::new(r"#([0-9A-Fa-f]{3,8})\b").unwrap();
    for cap in hex.captures_iter(text) { out.push(format!("#{}", &cap[1])); }
    // hsl/rgb
    let func = Regex::new(r"(?i)(hsl|rgb)a?\([^)]{3,40}\)").unwrap();
    for cap in func.captures_iter(text) { out.push(cap[0].trim().to_string()); }
    out
}

fn extract_fonts(text: &str) -> Vec<String> {
    let re = Regex::new(r#"font-family\s*:\s*([^;}"]+)"#).unwrap();
    let mut out = Vec::new();
    for cap in re.captures_iter(text) {
        for f in cap[1].split(',') {
            let clean = f.trim().trim_matches(|c| c == '\'' || c == '"').to_string();
            if !clean.is_empty() && clean != "inherit" && clean != "sans-serif" && clean != "serif" {
                out.push(clean);
            }
        }
    }
    out
}

fn extract_font_sizes(css: &str) -> Vec<String> {
    let re = Regex::new(r"font-size\s*:\s*([^;}\s]+)").unwrap();
    re.captures_iter(css).map(|c| c[1].to_string()).collect()
}

fn extract_spacing(css: &str) -> Vec<String> {
    let re = Regex::new(r"(?:margin|padding)\s*:\s*([^;}{]+)").unwrap();
    re.captures_iter(css).map(|c| c[1].trim().to_string()).take(20).collect()
}

fn extract_border_radius(css: &str) -> Vec<String> {
    let re = Regex::new(r"border-radius\s*:\s*([^;}{]+)").unwrap();
    re.captures_iter(css).map(|c| c[1].trim().to_string()).collect()
}

fn extract_shadows(css: &str) -> Vec<String> {
    let re = Regex::new(r"(?:box|text)-shadow\s*:\s*([^;}{]+)").unwrap();
    re.captures_iter(css).map(|c| c[1].trim().to_string()).collect()
}

fn extract_css_vars(css: &str) -> HashMap<String, String> {
    let re = Regex::new(r"--([\w-]+)\s*:\s*([^;}\n]+)").unwrap();
    let mut map = HashMap::new();
    for cap in re.captures_iter(css) {
        map.insert(format!("--{}", cap[1].trim()), cap[2].trim().to_string());
    }
    map
}

fn unique(mut v: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    v.retain(|s| seen.insert(s.clone()));
    v
}

// ── Render ────────────────────────────────────────────────────────────────────

fn print_tokens(t: &DesignTokens) {
    println!("\n  Design Tokens\n");
    if !t.colors.is_empty() {
        println!("  Colors ({}):", t.colors.len());
        for c in t.colors.iter().take(12) { println!("    {}", c); }
    }
    if !t.fonts.is_empty() {
        println!("\n  Fonts: {}", t.fonts.join(", "));
    }
    if !t.font_sizes.is_empty() {
        println!("  Font sizes: {}", t.font_sizes.iter().take(8).cloned().collect::<Vec<_>>().join(", "));
    }
    if !t.border_radius.is_empty() {
        println!("  Border radius: {}", t.border_radius.iter().take(6).cloned().collect::<Vec<_>>().join(", "));
    }
    if !t.css_vars.is_empty() {
        println!("\n  CSS Variables ({}):", t.css_vars.len());
        let mut vars: Vec<_> = t.css_vars.iter().collect();
        vars.sort_by_key(|(k, _)| k.clone());
        for (k, v) in vars.iter().take(15) { println!("    {}: {}", k, v); }
        if t.css_vars.len() > 15 { println!("    … and {} more", t.css_vars.len() - 15); }
    }
    println!();
}

fn tokens_to_markdown(t: &DesignTokens) -> String {
    let mut md = String::from("# Design Context\n\n");
    md.push_str("> Auto-extracted by `yana-rt design extract`\n\n");

    if !t.colors.is_empty() {
        md.push_str("## Colors\n\n");
        for c in &t.colors { md.push_str(&format!("- `{}`\n", c)); }
        md.push('\n');
    }
    if !t.fonts.is_empty() {
        md.push_str(&format!("## Typography\n\n**Fonts:** {}\n\n", t.fonts.join(", ")));
    }
    if !t.font_sizes.is_empty() {
        md.push_str(&format!("**Font sizes:** {}\n\n", t.font_sizes.join(", ")));
    }
    if !t.border_radius.is_empty() {
        md.push_str(&format!("## Border Radius\n\n{}\n\n", t.border_radius.join(", ")));
    }
    if !t.shadows.is_empty() {
        md.push_str("## Shadows\n\n");
        for s in &t.shadows { md.push_str(&format!("- `{}`\n", s)); }
        md.push('\n');
    }
    if !t.css_vars.is_empty() {
        md.push_str("## CSS Variables\n\n```css\n:root {\n");
        let mut vars: Vec<_> = t.css_vars.iter().collect();
        vars.sort_by_key(|(k, _)| k.clone());
        for (k, v) in &vars { md.push_str(&format!("  {}: {};\n", k, v)); }
        md.push_str("}\n```\n");
    }
    md
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cgnat_range_is_blocked_alibaba_cloud_metadata_included() {
        // REPRODUCTION: before this fix, is_private_ip returned false for
        // this exact address -- confirmed live against the pre-fix code.
        assert!(is_private_ip("100.100.100.200".parse().unwrap()));
        // Boundary check: the whole /10 block, not just the one known IP.
        assert!(is_private_ip("100.64.0.0".parse().unwrap()));
        assert!(is_private_ip("100.127.255.255".parse().unwrap()));
        // Just outside the block on both sides must NOT be flagged.
        assert!(!is_private_ip("100.63.255.255".parse().unwrap()));
        assert!(!is_private_ip("100.128.0.0".parse().unwrap()));
    }

    #[test]
    fn rfc1918_loopback_and_link_local_ipv4_still_blocked() {
        assert!(is_private_ip("127.0.0.1".parse().unwrap()));
        assert!(is_private_ip("10.0.0.1".parse().unwrap()));
        assert!(is_private_ip("172.16.0.1".parse().unwrap()));
        assert!(is_private_ip("192.168.1.1".parse().unwrap()));
        assert!(is_private_ip("169.254.1.1".parse().unwrap()));
        assert!(is_private_ip("0.0.0.0".parse().unwrap()));
    }

    #[test]
    fn genuinely_public_ipv4_is_not_blocked() {
        assert!(!is_private_ip("8.8.8.8".parse().unwrap()));
        assert!(!is_private_ip("1.1.1.1".parse().unwrap()));
    }

    #[test]
    fn ipv6_loopback_unique_local_and_link_local_are_blocked() {
        assert!(is_private_ip("::1".parse().unwrap()));
        assert!(is_private_ip("fc00::1".parse().unwrap()));
        assert!(is_private_ip("fd12:3456::1".parse().unwrap()));
        assert!(is_private_ip("fe80::1".parse().unwrap()));
    }

    #[test]
    fn ipv4_mapped_ipv6_cgnat_bypass_is_blocked() {
        // REPRODUCTION: before this fix, an IPv4-mapped IPv6 literal
        // wasn't unwrapped at all -- ::ffff:100.100.100.200 classified as
        // "not loopback, not unspecified" and passed straight through,
        // even after the plain-IPv4 CGNAT fix, since the V6 match arm
        // never looked at the embedded V4 address.
        assert!(is_private_ip("::ffff:100.100.100.200".parse().unwrap()));
        assert!(is_private_ip("::ffff:127.0.0.1".parse().unwrap()));
        assert!(!is_private_ip("::ffff:8.8.8.8".parse().unwrap()));
    }

    #[test]
    fn genuinely_public_ipv6_is_not_blocked() {
        assert!(!is_private_ip("2606:4700:4700::1111".parse().unwrap())); // Cloudflare DNS
    }
}
