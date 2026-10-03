//! MCP client (WS3 T1, docs/contracts/ws3-tools.md 4): lets Yana use external
//! MCP servers over stdio. Built only with the `mcp` feature.
//!
//! Layers: `config` (which servers, from a file the model cannot write),
//! `session` (one connection, time limits, size caps), `spawn` (the child
//! process with a clean environment), `gateway` (the single `mcp.call`
//! entry point that screens output as untrusted).

pub mod bounded;
pub mod config;
pub mod gateway;
pub mod session;
pub mod spawn;

#[cfg(test)]
mod config_tests;
// The fake servers are `sh` scripts and the checks use `kill -0`, so these are Unix-only.
#[cfg(all(test, unix))]
pub(crate) mod gateway_tests;
