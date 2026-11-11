// SPDX-FileCopyrightText: 2026 Vũ Văn Tâm
// SPDX-License-Identifier: Apache-2.0

pub mod agent;
pub mod approval;
pub mod attachment;
pub mod chat;
pub mod command;
pub mod compose_stage;
pub mod composer;
pub mod context_view;
pub mod layout;
pub mod memory;
pub mod notification;
pub mod provider;
pub mod render;
pub mod search;
pub mod session;
pub mod storage;
pub mod theme;
pub mod workflow;

use agent::AgentEngine;
use approval::ApprovalEngine;
use attachment::AttachmentEngine;
use chat::ChatEngine;
use command::CommandEngine;
use compose_stage::ComposeStageEngine;
use composer::ComposerEngine;
use context_view::ContextViewEngine;
use layout::LayoutEngine;
use memory::MemoryEngine;
use notification::NotificationEngine;
use provider::ProviderEngine;
use render::RenderEngine;
use search::SearchEngine;
use session::SessionEngine;
use storage::StorageEngine;
use theme::ThemeEngine;
use workflow::WorkflowEngine;

#[derive(Debug, Default)]
pub struct UiEngines {
    pub agent: AgentEngine,
    pub approval: ApprovalEngine,
    pub attachment: AttachmentEngine,
    pub chat: ChatEngine,
    pub command: CommandEngine,
    pub compose_stage: ComposeStageEngine,
    pub composer: ComposerEngine,
    pub context_view: ContextViewEngine,
    pub layout: LayoutEngine,
    pub memory: MemoryEngine,
    pub notification: NotificationEngine,
    pub provider: ProviderEngine,
    pub render: RenderEngine,
    pub search: SearchEngine,
    pub session: SessionEngine,
    pub storage: StorageEngine,
    pub theme: ThemeEngine,
    pub workflow: WorkflowEngine,
}

impl UiEngines {
    pub const COUNT: usize = 18;

    pub fn names() -> [&'static str; Self::COUNT] {
        [
            "Chat",
            "Composer",
            "Render",
            "Layout",
            "Workflow",
            "Provider",
            "Session",
            "Storage",
            "Search",
            "Command",
            "Context View",
            "Attachment",
            "Notification",
            "Theme",
            "Compose Stage",
            "Memory",
            "Approval",
            "Agent",
        ]
    }
}
