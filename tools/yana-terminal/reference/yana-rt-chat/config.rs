use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct YamtamConfig {
    pub version:           String,
    pub guards:            Vec<String>,
    pub plugins_enabled:   bool,
    pub cost_tracking:     bool,
    pub l3_retention_days: u32,
    pub bus_max_events:    usize,
    #[serde(default)]
    pub extra:             HashMap<String, String>,
}

impl Default for YamtamConfig {
    fn default() -> Self {
        Self {
            version:           "1.0".into(),
            guards:            vec!["scope-guard".into(), "token-budget".into()],
            plugins_enabled:   true,
            cost_tracking:     true,
            l3_retention_days: 30,
            bus_max_events:    10_000,
            extra:             HashMap::new(),
        }
    }
}

fn config_path(dir: &str) -> PathBuf {
    PathBuf::from(dir).join(".yana-ai").join("settings.json")
}

pub fn cmd_config_show(dir: String) {
    let path = config_path(&dir);
    if !path.exists() {
        println!("No config at {}\nRun: yana-rt config init --dir {dir}", path.display());
        return;
    }
    let cfg: YamtamConfig = serde_json::from_str(&fs::read_to_string(&path).unwrap_or_default())
        .unwrap_or_default();
    println!("Config: {}", path.display());
    println!("  version:            {}", cfg.version);
    println!("  plugins_enabled:    {}", cfg.plugins_enabled);
    println!("  cost_tracking:      {}", cfg.cost_tracking);
    println!("  l3_retention_days:  {}", cfg.l3_retention_days);
    println!("  bus_max_events:     {}", cfg.bus_max_events);
    if !cfg.guards.is_empty() {
        println!("  guards:");
        for g in &cfg.guards { println!("    - {g}"); }
    }
    if !cfg.extra.is_empty() {
        println!("  extra:");
        for (k, v) in &cfg.extra { println!("    {k}: {v}"); }
    }
}

pub fn cmd_config_init(dir: String) {
    let path = config_path(&dir);
    if path.exists() { println!("Config already exists: {}", path.display()); return; }
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).ok(); }
    let json = serde_json::to_string_pretty(&YamtamConfig::default()).expect("serialize failed");
    fs::write(&path, json).expect("write config failed");
    println!("✓ created  {}", path.display());
}

pub fn cmd_config_set(dir: String, key: String, value: String) {
    let path = config_path(&dir);
    let mut cfg: YamtamConfig = if path.exists() {
        serde_json::from_str(&fs::read_to_string(&path).unwrap_or_default()).unwrap_or_default()
    } else {
        YamtamConfig::default()
    };
    if let Some(parent) = path.parent() { fs::create_dir_all(parent).ok(); }
    // Try known fields first, fall through to extra
    match key.as_str() {
        "plugins_enabled"   => cfg.plugins_enabled   = value == "true",
        "cost_tracking"     => cfg.cost_tracking      = value == "true",
        "l3_retention_days" => cfg.l3_retention_days  = value.parse().unwrap_or(30),
        "bus_max_events"    => cfg.bus_max_events      = value.parse().unwrap_or(10_000),
        _                   => { cfg.extra.insert(key.clone(), value.clone()); }
    }
    let json = serde_json::to_string_pretty(&cfg).expect("serialize failed");
    fs::write(&path, json).expect("write config failed");
    println!("✓ set  {key} = {value}");
}
