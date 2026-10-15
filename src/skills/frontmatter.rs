//! The frontmatter of a `SKILL.md`, read as a small subset of YAML: top-level `key: value` lines, quoted text, block
//! text (`|` and `>`), inline lists (`[a, b]`) and `- item` lists. Nothing else is interpreted: no aliases, anchors,
//! tags, merge keys or nesting. A general YAML library would be the wrong tool for text written by someone else, because
//! a few hundred bytes of aliases can make it spend seconds and memory (the `noyalib` budget advisory, RUSTSEC-2026-0333).
//! Here the work is linear in the size of the frontmatter, which `split_frontmatter` already caps.

/// What a skill's frontmatter says, before names and descriptions are cleaned and checked.
#[derive(Debug, Default)]
pub struct RawMeta {
    pub name: String,
    pub description: String,
    pub allowed_tools: Vec<String>,
    pub user_invocable: Option<bool>,
}

pub fn parse(front: &str) -> Result<RawMeta, String> {
    let lines: Vec<&str> = front.lines().collect();
    let mut meta = RawMeta::default();
    let mut index = 0;
    while index < lines.len() {
        let line = lines[index];
        index += 1;
        let Some((key, value)) = top_level_pair(line) else { continue };
        let block = indented_block(&lines, &mut index);
        match key {
            "name" => meta.name = scalar(value, &block).map_err(|why| format!("name: {why}"))?,
            "description" => meta.description = scalar(value, &block).map_err(|why| format!("description: {why}"))?,
            "allowed-tools" => meta.allowed_tools = list(value, &block).map_err(|why| format!("allowed-tools: {why}"))?,
            "user-invocable" => meta.user_invocable = boolean(value),
            _ => {}
        }
    }
    Ok(meta)
}

/// `key: value` at the start of a line. Indented lines, comments and lines that are not a pair are not top-level pairs.
fn top_level_pair(line: &str) -> Option<(&str, &str)> {
    if line.starts_with([' ', '\t', '#']) {
        return None;
    }
    let (key, value) = line.split_once(':')?;
    let key = key.trim();
    let plain_key = !key.is_empty() && key.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'));
    plain_key.then_some((key, value.trim()))
}

/// The indented (or blank) lines after a key. They belong to that key: block text, list items, or nesting that is ignored.
fn indented_block<'a>(lines: &[&'a str], index: &mut usize) -> Vec<&'a str> {
    let mut block = Vec::new();
    while *index < lines.len() && (lines[*index].starts_with([' ', '\t']) || lines[*index].trim().is_empty()) {
        block.push(lines[*index]);
        *index += 1;
    }
    block
}

fn unquote(text: &str) -> Result<String, String> {
    let text = text.trim();
    let Some(quote) = text.chars().next().filter(|c| matches!(c, '"' | '\'')) else { return Ok(text.to_string()) };
    let inner = text.strip_prefix(quote).and_then(|rest| rest.strip_suffix(quote));
    match inner {
        Some(inner) if quote == '\'' => Ok(inner.replace("''", "'")),
        Some(inner) => Ok(unescape_double_quoted(inner)),
        None => Err("a quote is not closed".to_string()),
    }
}

/// The few escapes that appear in real descriptions. Anything else keeps its backslash, so text is never lost.
fn unescape_double_quoted(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('"') => out.push('"'),
            Some('\\') => out.push('\\'),
            Some('n') | Some('t') => out.push(' '),
            Some(other) => {
                out.push('\\');
                out.push(other);
            }
            None => out.push('\\'),
        }
    }
    out
}

fn scalar(value: &str, block: &[&str]) -> Result<String, String> {
    let block_text = || block.iter().map(|line| line.trim()).collect::<Vec<_>>().join(" ");
    if value.starts_with(['|', '>']) || value.is_empty() {
        return Ok(block_text());
    }
    if value.starts_with(['[', '{']) {
        return Err("a list or map where text was expected".to_string());
    }
    // A quoted text may continue on the following indented lines until the closing quote.
    if value.starts_with(['"', '\'']) && !block.is_empty() {
        return unquote(&format!("{value} {}", block_text()));
    }
    // A plain text continues on the following indented lines too.
    if !block.is_empty() {
        return Ok(format!("{value} {}", block_text()).trim().to_string());
    }
    unquote(value)
}

fn list(value: &str, block: &[&str]) -> Result<Vec<String>, String> {
    let items: Vec<String> = if let Some(inner) = value.strip_prefix('[') {
        let inner = inner.strip_suffix(']').ok_or_else(|| "a list is not closed".to_string())?;
        inner.split(',').map(unquote).collect::<Result<_, _>>()?
    } else if value.is_empty() {
        block.iter().filter_map(|line| line.trim().strip_prefix('-')).map(unquote).collect::<Result<_, _>>()?
    } else {
        value.split([',', ' ']).map(str::to_string).collect()
    };
    Ok(items.into_iter().filter(|item| !item.trim().is_empty()).collect())
}

fn boolean(value: &str) -> Option<bool> {
    match value.to_ascii_lowercase().as_str() {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}
