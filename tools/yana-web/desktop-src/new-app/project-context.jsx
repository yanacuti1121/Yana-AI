// Roadmap Phase 2 item 7 — "Global Project Context": one current
// workspace/project context shared by Chat, Files, Git, Tasks, Terminal
// and Activity, instead of each surface guessing its own cwd/repository.
//
// Named `ProjectContext`/`useProject` (NOT `WorkspaceContext`) on purpose:
// that name is already taken by the chat trust-boundary envelope
// (`{ terminal: {...} }`, untrusted PTY data attached to a turn — see
// lib/workspace-context.js, src/chat/headless.rs). Different concept,
// deliberately different name to avoid confusing the two.
//
// Real data only: `repoRoot`/`branch`/`modifiedCount`/`untrackedCount`
// come from the same git-status adapter index.jsx already fetched once;
// this just centralizes where every surface reads it from.
import React from 'react';

const ProjectContext = React.createContext(null);

export function ProjectProvider({ value, children }) {
  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  return React.useContext(ProjectContext) || { projectName: null, repoRoot: null, branch: null, modifiedCount: undefined, untrackedCount: undefined };
}
