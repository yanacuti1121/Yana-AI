//! `yana-rt skill list` and `yana-rt skill show`: the skills of the current project and of the user, as text or JSON.
//! The IDE and the chat read skills through this, so both see the same list.

use super::{discover, read_body, roots, Discovery, Skill};
use anyhow::{bail, Result};
use clap::Subcommand;
use serde_json::json;
use std::path::PathBuf;

const LIST_DESCRIPTION_COLUMNS: usize = 90;

#[derive(Subcommand)]
pub enum SkillAction {
    /// List the skills of this project (.yana-ai/skills) and of the user (<YANA_HOME>/skills)
    List {
        #[arg(long)]
        json: bool,
    },
    /// Print the instructions of one skill
    Show {
        name: String,
        #[arg(long)]
        json: bool,
    },
}

/// `$YANA_HOME`, or `~/.yana`. Nothing is read if neither can be found.
fn yana_home() -> Option<PathBuf> {
    std::env::var_os("YANA_HOME").map(PathBuf::from).or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".yana")))
}

fn current_discovery() -> Discovery {
    let project = std::env::current_dir().ok();
    discover(&roots(project.as_deref(), yana_home().as_deref()))
}

pub fn dispatch(action: SkillAction) {
    if let Err(error) = run(action) {
        eprintln!("[skill] {error:#}");
        std::process::exit(1);
    }
}

fn run(action: SkillAction) -> Result<()> {
    let found = current_discovery();
    match action {
        SkillAction::List { json } => list(&found, json),
        SkillAction::Show { name, json } => show(&found, &name, json),
    }
}

fn list(found: &Discovery, json: bool) -> Result<()> {
    if json {
        println!("{}", json!({ "skills": found.skills, "problems": found.problems }));
        return Ok(());
    }
    for skill in &found.skills {
        let description: String = skill.description.chars().take(LIST_DESCRIPTION_COLUMNS).collect();
        println!("{:<32} {:<8} {description}", skill.name, skill.scope.word());
    }
    for problem in &found.problems {
        eprintln!("not loaded: {}: {}", problem.dir, problem.reason);
    }
    println!("{} skill(s), {} not loaded", found.skills.len(), found.problems.len());
    Ok(())
}

fn show(found: &Discovery, name: &str, json: bool) -> Result<()> {
    let Some(skill) = found.skills.iter().find(|skill| skill.name == name) else {
        bail!("no skill named '{name}' (run `yana-rt skill list`)");
    };
    let body = read_body(skill)?;
    if json {
        println!("{}", detail(skill, &body));
    } else {
        print!("{body}");
    }
    Ok(())
}

fn detail(skill: &Skill, body: &str) -> serde_json::Value {
    json!({
        "name": skill.name,
        "description": skill.description,
        "scope": skill.scope,
        "user_invocable": skill.user_invocable,
        "allowed_tools": skill.allowed_tools,
        "path": skill.path,
        "body": body,
    })
}
