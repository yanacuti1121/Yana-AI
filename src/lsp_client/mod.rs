//! LSP client (WS3, docs/contracts/ws3-tools.md section 17): asks a language
//! server the repository configured about code in the repository. Read-only:
//! the client never applies an edit a server proposes.
//!
//! Layers: `operation` (what may be asked, and positions and URIs) and `present`
//! (a server's answer as bounded text) exist in every build, because the approval
//! prompt needs the question. `codec` (message framing with hard limits),
//! `connection` (one JSON-RPC conversation and what to answer when the server asks
//! something), `session` (start the program, ask, stop it) and `gateway` (the one
//! door, with approval comparison and untrusted-content screening) need the async
//! runtime and are built with the `mcp` feature.

// Without the client only the question and its presentation exist; the helpers the async
// parts use (positions, URIs, request parameters) have no caller in that build.
#![cfg_attr(not(feature = "mcp"), allow(dead_code))]

#[cfg(feature = "mcp")]
pub mod codec;
#[cfg(feature = "mcp")]
pub mod connection;
#[cfg(feature = "mcp")]
pub mod gateway;
pub mod operation;
pub mod present;
#[cfg(feature = "mcp")]
pub mod session;
