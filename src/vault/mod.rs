mod note;
mod search;
mod store;

use anyhow::Result;
use chrono::Utc;
use clap::Subcommand;
use note::{Note, NoteMeta, default_meta};
use store::{VaultConfig, init_vault, load_notes, note_path};

#[derive(Subcommand, Debug)]
pub enum VaultAction {
    /// Initialize a new vault (Tolaria-inspired: markdown + git-backed)
    Init {
        #[arg(default_value = ".")] dir: String,
        #[arg(long, default_value = "My Vault")] name: String,
    },
    /// Create a new note
    New {
        title: String,
        #[arg(long, default_value = "vi")] lang: String,
        #[arg(long, value_delimiter = ',')] tags: Vec<String>,
        #[arg(long, default_value = ".")] vault: String,
    },
    /// List notes — filter by lang or tag
    List {
        #[arg(long)] lang: Option<String>,
        #[arg(long)] tag: Option<String>,
        #[arg(long, default_value = ".")] vault: String,
    },
    /// Full-text search with Vietnamese Unicode support
    Search {
        query: String,
        #[arg(long)] lang: Option<String>,
        /// Accent-insensitive: "viet" matches "Việt"
        #[arg(long)] no_accent: bool,
        #[arg(long, default_value = ".")] vault: String,
    },
    /// Show note content
    Show {
        id: String,
        #[arg(long, default_value = ".")] vault: String,
    },
    /// Vault statistics — total notes, word count, language breakdown
    Stats {
        #[arg(long, default_value = ".")] vault: String,
    },
    /// Link two notes as parallel translations (WMT23-inspired)
    Link {
        id: String,
        translation_id: String,
        #[arg(long)] lang: String,
        #[arg(long, default_value = ".")] vault: String,
    },
}

pub fn dispatch(action: VaultAction) {
    let result = match action {
        VaultAction::Init { dir, name }                         => cmd_init(&dir, &name),
        VaultAction::New { title, lang, tags, vault }           => cmd_new(&vault, &title, &lang, tags),
        VaultAction::List { lang, tag, vault }                  => cmd_list(&vault, lang.as_deref(), tag.as_deref()),
        VaultAction::Search { query, lang, no_accent, vault }   => cmd_search(&vault, &query, lang.as_deref(), no_accent),
        VaultAction::Show { id, vault }                         => cmd_show(&vault, &id),
        VaultAction::Stats { vault }                            => cmd_stats(&vault),
        VaultAction::Link { id, translation_id, lang, vault }  => cmd_link(&vault, &id, &translation_id, &lang),
    };
    if let Err(e) = result {
        eprintln!("[vault] error: {e}");
        std::process::exit(1);
    }
}

fn cmd_init(dir: &str, name: &str) -> Result<()> {
    init_vault(dir, name)
}

fn cmd_new(vault: &str, title: &str, lang: &str, tags: Vec<String>) -> Result<()> {
    let config = VaultConfig::load(vault)?;
    let slug = slugify(title);
    let path = note_path(vault, &config, &slug);
    if path.exists() {
        anyhow::bail!("Note '{}' already exists at {}", slug, path.display());
    }
    let now = Utc::now();
    let meta = NoteMeta { title: title.to_string(), tags, lang: lang.to_string(),
        created: Some(now), updated: Some(now), ..default_meta() };
    let note = Note { id: slug.clone(), meta, body: String::new(), path: path.clone() };
    std::fs::write(&path, note.to_file_content()?)?;
    println!("[vault] created: {}", path.display());
    Ok(())
}

fn cmd_list(vault: &str, lang: Option<&str>, tag: Option<&str>) -> Result<()> {
    let config = VaultConfig::load(vault)?;
    let notes = load_notes(vault, &config)?;
    let filtered: Vec<_> = notes.iter().filter(|n| {
        lang.map_or(true, |l| n.meta.lang == l)
            && tag.map_or(true, |t| n.meta.tags.iter().any(|tg| tg == t))
    }).collect();
    if filtered.is_empty() {
        println!("(no notes)");
        return Ok(());
    }
    println!("{:<32} {:<6} {:<12} {}", "ID", "LANG", "CREATED", "TITLE");
    println!("{}", "─".repeat(76));
    for n in &filtered {
        let created = n.meta.created.map_or("-".to_string(), |d| d.format("%Y-%m-%d").to_string());
        let trans = if n.meta.translations.is_empty() { String::new() }
            else { format!(" [→{}]", n.meta.translations.keys().cloned().collect::<Vec<_>>().join(",")) };
        println!("{:<32} {:<6} {:<12} {}{}", n.id, n.meta.lang, created, n.meta.title, trans);
    }
    println!("\n{} note(s)", filtered.len());
    Ok(())
}

fn cmd_search(vault: &str, query: &str, lang: Option<&str>, no_accent: bool) -> Result<()> {
    let config = VaultConfig::load(vault)?;
    let notes = load_notes(vault, &config)?;
    let hits: Vec<_> = notes.iter().filter(|n| {
        lang.map_or(true, |l| n.meta.lang == l)
            && (search::matches(query, &n.meta.title, no_accent)
                || search::matches(query, &n.body, no_accent)
                || n.meta.tags.iter().any(|t| search::matches(query, t, no_accent)))
    }).collect();
    if hits.is_empty() {
        println!("(no results for '{}')", query);
        return Ok(());
    }
    println!("Found {} note(s) matching '{}':\n", hits.len(), query);
    for n in &hits {
        let snippet = n.body.lines()
            .find(|l| search::matches(query, l, no_accent))
            .map(|l| l.chars().take(80).collect::<String>())
            .unwrap_or_default();
        println!("  [{}] {} ({})", n.meta.lang, n.meta.title, n.id);
        if !snippet.is_empty() {
            println!("      …{}", snippet.trim());
        }
    }
    Ok(())
}

fn cmd_show(vault: &str, id: &str) -> Result<()> {
    let config = VaultConfig::load(vault)?;
    let path = note_path(vault, &config, id);
    anyhow::ensure!(path.exists(), "Note '{}' not found", id);
    let note = Note::from_file(&path)?;
    println!("# {}", note.meta.title);
    println!("lang: {}  |  tags: {}  |  words: {}", note.meta.lang,
        if note.meta.tags.is_empty() { "-".to_string() } else { note.meta.tags.join(", ") },
        note.word_count());
    if !note.meta.translations.is_empty() {
        let t: Vec<_> = note.meta.translations.iter()
            .map(|(l, id)| format!("{l}:{id}")).collect();
        println!("translations: {}", t.join("  "));
    }
    println!("{}", "─".repeat(60));
    println!("{}", note.body);
    Ok(())
}

fn cmd_stats(vault: &str) -> Result<()> {
    let config = VaultConfig::load(vault)?;
    let notes = load_notes(vault, &config)?;
    let words: usize = notes.iter().map(|n| n.word_count()).sum();
    let linked = notes.iter().filter(|n| !n.meta.translations.is_empty()).count();
    let mut by_lang: std::collections::HashMap<String, usize> = Default::default();
    for n in &notes { *by_lang.entry(n.meta.lang.clone()).or_default() += 1; }
    println!("Vault : {}", config.vault_name);
    println!("Notes : {}  |  Words: {}  |  Linked translations: {}", notes.len(), words, linked);
    println!("\nBy language:");
    let mut langs: Vec<_> = by_lang.iter().collect();
    langs.sort_by(|a, b| b.1.cmp(a.1));
    for (lang, count) in langs {
        println!("  {:<6} {:>4}  {}", lang, count, "█".repeat(*count));
    }
    Ok(())
}

fn cmd_link(vault: &str, id: &str, translation_id: &str, lang: &str) -> Result<()> {
    let config = VaultConfig::load(vault)?;
    let path = note_path(vault, &config, id);
    let trans_path = note_path(vault, &config, translation_id);
    anyhow::ensure!(path.exists(), "Note '{}' not found", id);
    anyhow::ensure!(trans_path.exists(), "Translation note '{}' not found", translation_id);
    let mut note = Note::from_file(&path)?;
    note.meta.translations.insert(lang.to_string(), translation_id.to_string());
    note.meta.updated = Some(Utc::now());
    std::fs::write(&path, note.to_file_content()?)?;
    println!("[vault] linked: {} → {} ({})", id, translation_id, lang);
    Ok(())
}

pub fn slugify(s: &str) -> String {
    search::strip_diacritics(&search::normalize(s))
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}
