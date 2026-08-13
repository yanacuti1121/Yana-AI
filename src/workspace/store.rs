use super::domain::WorkspaceEvent;
use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};

pub trait EventStore {
    fn load(&self) -> Result<Vec<WorkspaceEvent>, String>;
    fn append(&self, event: &WorkspaceEvent) -> Result<(), String>;
}

#[derive(Debug, Clone)]
pub struct FileEventStore {
    root: PathBuf,
}

impl FileEventStore {
    pub fn new(project_root: impl AsRef<Path>) -> Self {
        Self {
            root: project_root.as_ref().join(".yana-ai/workspace/events"),
        }
    }

    #[cfg(test)]
    pub fn event_dir(&self) -> &Path {
        &self.root
    }

    fn ensure_dir(&self) -> Result<(), String> {
        fs::create_dir_all(&self.root).map_err(|error| {
            format!(
                "creating workspace event directory {}: {error}",
                self.root.display()
            )
        })
    }
}

impl EventStore for FileEventStore {
    fn load(&self) -> Result<Vec<WorkspaceEvent>, String> {
        if !self.root.exists() {
            return Ok(Vec::new());
        }
        let mut paths: Vec<_> = fs::read_dir(&self.root)
            .map_err(|error| format!("reading {}: {error}", self.root.display()))?
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| path.extension().and_then(|value| value.to_str()) == Some("json"))
            .collect();
        paths.sort();
        let mut events = Vec::with_capacity(paths.len());
        for path in paths {
            let content = fs::read_to_string(&path)
                .map_err(|error| format!("reading workspace event {}: {error}", path.display()))?;
            let event = serde_json::from_str(&content)
                .map_err(|error| format!("parsing workspace event {}: {error}", path.display()))?;
            events.push(event);
        }
        events.sort_by(|left: &WorkspaceEvent, right: &WorkspaceEvent| {
            left.occurred_at
                .cmp(&right.occurred_at)
                .then_with(|| left.id.cmp(&right.id))
        });
        Ok(events)
    }

    fn append(&self, event: &WorkspaceEvent) -> Result<(), String> {
        self.ensure_dir()?;
        let timestamp = event.occurred_at.replace([':', '.'], "-");
        let final_path = self.root.join(format!("{timestamp}-{}.json", event.id));
        let temp_path = self.root.join(format!(
            ".{timestamp}-{}.tmp-{}",
            event.id,
            std::process::id()
        ));
        let serialized = serde_json::to_vec_pretty(event)
            .map_err(|error| format!("serializing workspace event: {error}"))?;
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        let mut file = options.open(&temp_path).map_err(|error| {
            format!(
                "creating workspace event temp file {}: {error}",
                temp_path.display()
            )
        })?;
        file.write_all(&serialized)
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("writing workspace event {}: {error}", temp_path.display()))?;
        match fs::hard_link(&temp_path, &final_path) {
            Ok(()) => {
                let _ = fs::remove_file(&temp_path);
                Ok(())
            }
            Err(error) => {
                let _ = fs::remove_file(&temp_path);
                if error.kind() == ErrorKind::AlreadyExists {
                    Err(format!("workspace event already exists: {}", event.id))
                } else {
                    Err(format!(
                        "publishing workspace event {}: {error}",
                        final_path.display()
                    ))
                }
            }
        }
    }
}
