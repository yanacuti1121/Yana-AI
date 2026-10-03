//! LSP client (WS3, docs/contracts/ws3-tools.md section 17): asks a language
//! server the repository configured about code in the repository. Read-only:
//! the client never applies an edit a server proposes.
//!
//! Layers: `codec` (message framing with hard limits), `connection` (one
//! JSON-RPC conversation and what to answer when the server asks something),
//! `operation` (what may be asked, and positions and URIs), `present` (a server's
//! answer as bounded text), `session` (start the program, ask, stop it).
//!
//! Built with the `mcp` feature, which already brings the async runtime it needs.

// Step (a) of the contract's order of work: nothing dispatches to this module yet;
// the configuration, trust, approval and gateway (steps b and c) come next.
#![allow(dead_code)]

pub mod codec;
pub mod connection;
pub mod operation;
pub mod present;
pub mod session;
