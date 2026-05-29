use std::fs;
use std::path::PathBuf;
use std::process::Command;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;
use shell_words;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Plugin {
    pub id:          String,
    pub name:        String,
    pub script:      String,
    pub description: String,
    pub enabled:     bool,
    pub added_at:    String,
}

fn plugins_path() -> PathBuf {
    let base = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    base.join(".yamtam").join("plugins.json")
}

fn load_plugins() -> Vec<Plugin> {
    let path = plugins_path();
    if !path.exists() { return vec![]; }
    serde_json::from_str(&fs::read_to_string(&path).unwrap_or_default()).unwrap_or_default()
}

fn save_plugins(plugins: &[Plugin]) {
    let path = plugins_path();
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).ok(); }
    fs::write(&path, serde_json::to_string_pretty(plugins).expect("serialize failed"))
        .expect("write plugins failed");
}

pub fn cmd_plugin_list() {
    let plugins = load_plugins();
    if plugins.is_empty() {
        println!("No plugins registered.\nAdd: yamtam-rt plugin add <name> <script>");
        return;
    }
    println!("{:<10} {:<3} {:<20} {}", "ID", "ON", "NAME", "SCRIPT");
    println!("{}", "─".repeat(62));
    for p in &plugins {
        let on = if p.enabled { "✓" } else { " " };
        println!("{:<10} {on}   {:<20} {}", &p.id[..8], p.name, p.script);
        if !p.description.is_empty() { println!("           {}", p.description); }
    }
}

pub fn cmd_plugin_add(name: String, script: String, description: String) {
    let mut plugins = load_plugins();
    if plugins.iter().any(|p| p.name == name) {
        eprintln!("error: plugin '{name}' already exists. Use 'plugin remove' first.");
        std::process::exit(1);
    }
    plugins.push(Plugin {
        id: Uuid::new_v4().to_string(), name: name.clone(), script: script.clone(),
        description, enabled: true,
        added_at: Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
    });
    save_plugins(&plugins);
    println!("✓ registered '{name}'\n  script: {script}");
}

pub fn cmd_plugin_remove(name: String) {
    let mut plugins = load_plugins();
    let before = plugins.len();
    plugins.retain(|p| p.name != name);
    if plugins.len() == before { eprintln!("error: plugin '{name}' not found"); std::process::exit(1); }
    save_plugins(&plugins);
    println!("✓ removed '{name}'");
}

pub fn cmd_plugin_toggle(name: String, enable: bool) {
    let mut plugins = load_plugins();
    match plugins.iter_mut().find(|p| p.name == name) {
        Some(p) => { p.enabled = enable; }
        None    => { eprintln!("error: plugin '{name}' not found"); std::process::exit(1); }
    }
    save_plugins(&plugins);
    println!("✓ plugin '{name}' {}", if enable { "enabled" } else { "disabled" });
}

pub fn cmd_plugin_run(name: String, input: Option<String>) {
    let plugins = load_plugins();
    let plugin = match plugins.iter().find(|p| p.name == name) {
        Some(p) => p,
        None    => { eprintln!("error: plugin '{name}' not found"); std::process::exit(1); }
    };
    if !plugin.enabled { eprintln!("error: plugin '{name}' is disabled"); std::process::exit(1); }
    println!("→ running '{name}': {}", plugin.script);
    let parts = match shell_words::split(&plugin.script) {
        Ok(p) if !p.is_empty() => p,
        Ok(_) => { eprintln!("error: empty script"); std::process::exit(1); }
        Err(e) => { eprintln!("error: invalid script: {e}"); std::process::exit(1); }
    };
    let mut proc = Command::new(&parts[0]);
    proc.args(&parts[1..]);
    if let Some(ref inp) = input { proc.env("YAMTAM_PLUGIN_INPUT", inp); }
    let status = proc.status().expect("failed to spawn plugin");
    if !status.success() {
        eprintln!("plugin exited: {}", status.code().unwrap_or(-1));
        std::process::exit(1);
    }
    println!("✓ '{name}' done");
}
