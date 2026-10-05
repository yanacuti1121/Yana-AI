//! The configuration of external MCP servers lives in `capability::mcp_config`
//! (it is needed by the chat approval prompt, which is built without the `mcp`
//! feature); re-exported here so this module reads as one unit.

pub use crate::capability::mcp_config::*;
