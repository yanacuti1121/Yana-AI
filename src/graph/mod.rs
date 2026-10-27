mod build;
mod imports;
mod query;
pub mod types;

use anyhow::Result;
use clap::Subcommand;

#[derive(Subcommand, Debug)]
pub enum GraphAction {
    /// Build knowledge graph for target directory
    Build {
        #[arg(default_value = ".")] target: String,
        #[arg(long)] quiet: bool,
    },
    /// Show graph summary
    Show {
        #[arg(default_value = ".")] target: String,
    },
    /// Search graph nodes
    Search {
        query: String,
        #[arg(default_value = ".")] target: String,
        #[arg(long)] expand: bool,
        #[arg(long, default_value_t = 15)] limit: usize,
    },
    /// Generate onboarding guide (Markdown)
    Onboard {
        #[arg(default_value = ".")] target: String,
        #[arg(long, value_name = "FILE")] out: Option<String>,
    },
    /// Diff impact analysis — which files are affected by changed files
    Diff {
        #[arg(default_value = "origin/main")] base: String,
        #[arg(default_value = ".")] target: String,
    },
    /// Generate structured RepoWiki Knowledge Cards (`architecture.md`,
    /// `modules.md`, `tech-stack.md`) from the AST knowledge graph.
    Wiki {
        #[arg(default_value = ".")] target: String,
        #[arg(long, default_value = ".yana-ai/repowiki")] out_dir: String,
        #[arg(long)] json: bool,
    },
}

pub fn dispatch(action: GraphAction) {
    let result: Result<()> = match action {
        GraphAction::Build { target, quiet } => {
            build::build_graph(&target, quiet).map(|_| ())
        }
        GraphAction::Show { target } => {
            build::load_graph(&target).map(|data| query::cmd_show(&data))
        }
        GraphAction::Search { query, target, expand, limit } => {
            build::load_graph(&target).map(|data| query::cmd_search(&data, &query, expand, limit))
        }
        GraphAction::Onboard { target, out } => {
            build::load_graph(&target).and_then(|data| query::cmd_onboard(&data, out.as_deref()))
        }
        GraphAction::Diff { base, target } => {
            build::load_graph(&target).and_then(|data| query::cmd_diff(&data, &base, &target))
        }
        GraphAction::Wiki { target, out_dir, json } => {
            build::load_graph(&target)
                .or_else(|_| build::build_graph(&target, true))
                .and_then(|data| query::cmd_wiki(&data, &target, &out_dir, json))
        }
    };
    if let Err(e) = result {
        eprintln!("[graph] error: {e}");
        std::process::exit(1);
    }
}
