use super::domain::{Block, WorkspaceState};
use std::fs;
use std::path::{Path, PathBuf};

pub trait WorkspaceExporter {
    fn export(&self, state: &WorkspaceState) -> Result<Vec<PathBuf>, String>;
}

#[derive(Debug, Clone)]
pub struct MarkdownExporter {
    output_dir: PathBuf,
}

impl MarkdownExporter {
    pub fn new(output_dir: impl AsRef<Path>) -> Self {
        Self {
            output_dir: output_dir.as_ref().to_path_buf(),
        }
    }
}

impl WorkspaceExporter for MarkdownExporter {
    fn export(&self, state: &WorkspaceState) -> Result<Vec<PathBuf>, String> {
        fs::create_dir_all(&self.output_dir)
            .map_err(|error| format!("creating export directory: {error}"))?;
        let mut blocks: Vec<_> = state.blocks.values().collect();
        blocks.sort_by(|left, right| left.created_at.cmp(&right.created_at));
        let mut paths = Vec::with_capacity(blocks.len() + 1);
        for block in blocks {
            let path = self.output_dir.join(format!("{}.md", block.id));
            fs::write(&path, render_block(state, block))
                .map_err(|error| format!("writing {}: {error}", path.display()))?;
            paths.push(path);
        }
        let index = self.output_dir.join("INDEX.md");
        fs::write(&index, render_index(state))
            .map_err(|error| format!("writing {}: {error}", index.display()))?;
        paths.push(index);
        Ok(paths)
    }
}

fn render_block(state: &WorkspaceState, block: &Block) -> String {
    let related = state.related(&block.id);
    let metadata = serde_json::to_string(&block.metadata).unwrap_or_else(|_| "{}".into());
    let mut output = format!(
        "---\nid: {}\nkind: {:?}\nattention: {:?}\ncreated_at: {}\nupdated_at: {}\nmetadata_json: {}\n---\n\n# {}\n\n{}\n",
        block.id,
        block.kind,
        block.attention,
        block.created_at,
        block.updated_at,
        metadata,
        block.title,
        block.body
    );
    if !related.is_empty() {
        output.push_str("\n## Related\n");
        for (other, link) in related {
            output.push_str(&format!(
                "\n- [{}]({}.md) — `{}`",
                other.title, other.id, link.relation
            ));
        }
        output.push('\n');
    }
    output
}

fn render_index(state: &WorkspaceState) -> String {
    let mut blocks: Vec<_> = state.blocks.values().collect();
    blocks.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    let mut output = String::from("# Yana Workspace Export\n\n");
    for block in blocks {
        output.push_str(&format!(
            "- [{}]({}.md) — `{:?}` · `{:?}`\n",
            block.title, block.id, block.kind, block.attention
        ));
    }
    output
}
