//! `lsp.query`: the one door to every language server (WS3, contract section 17).
//!
//! This module does NOT authorize. The caller must have passed the capability
//! through `YanaAuthorityChain` (human approval per call) BEFORE calling
//! `lsp_query`, and must pass the [`LspDisclosure`] the approver was shown:
//! `lsp_query` runs only if the server's configuration and the question still match
//! it. The answer is untrusted: it is screened and wrapped by `capability::untrusted`.

use super::operation::parse_query;
use super::present::present;
use super::session::run_query_blocking;
use crate::capability::lsp_config::find_lsp_server;
use crate::capability::lsp_disclosure::{disclosure_of, LspDisclosure};
use crate::capability::untrusted::guard;
use crate::capability::CapabilityError;
use serde_json::{json, Value};
use std::path::Path;

/// Ask the language server named in `arguments`. The configuration is read ONCE here
/// and run only if it equals `approved`: a file that changed since approval (an edit,
/// a `git pull`), or a different question, runs nothing.
pub fn lsp_query(root: &Path, arguments: &Value, approved: &LspDisclosure) -> Result<String, CapabilityError> {
    let query = parse_query(arguments)?;
    let server = find_lsp_server(root, &query.server)?;
    if &disclosure_of(&server, &query) != approved {
        return Err(CapabilityError::External {
            detail: format!("the configuration of language server '{}' or the question is not what was approved; nothing was started", query.server),
        });
    }
    let result = run_query_blocking(&server.server, root, &query)?;
    let text = present(query.operation, &result, root);
    let source = format!("lsp:{}/{}", query.server, query.operation.label());
    let wrapped = guard(&source, &text)?;
    let data = json!({"server": query.server, "operation": query.operation.label(), "path": query.path, "content": wrapped});
    serde_json::to_string(&json!({"capability": "lsp.query", "data": data, "truncated": false})).map_err(|e| CapabilityError::Serialize { detail: e.to_string() })
}

#[cfg(all(test, unix))]
mod tests;
