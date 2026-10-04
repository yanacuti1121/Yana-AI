//! MCP client (WS3 T1, docs/contracts/ws3-tools.md 4): lets Yana use external
//! MCP servers over stdio. The MCP protocol part is built only with the `mcp`
//! feature; the child-process and configuration parts are shared with the LSP
//! client and are built with either feature.
//!
//! Layers: `config` (which servers, from a file the model cannot write),
//! `process` (the child with a clean environment, and killing its tree),
//! `bounded` (size-capped reads), and, with `mcp`: `session` (one connection,
//! time limits, size caps), `spawn` (start and handshake) and `gateway` (the
//! single `mcp.call` entry point that screens output as untrusted).

pub mod bounded;
pub mod config;
pub mod process;
#[cfg(feature = "mcp")]
pub mod gateway;
#[cfg(feature = "mcp")]
pub mod session;
#[cfg(feature = "mcp")]
pub mod spawn;

#[cfg(all(test, any(feature = "mcp", feature = "lsp")))]
mod config_tests;
// The fake servers are `sh` scripts and the checks use `kill -0`, so these are Unix-only.
#[cfg(all(test, unix, feature = "mcp"))]
pub(crate) mod gateway_tests;
#[cfg(all(test, unix))]
pub(crate) mod test_support;
