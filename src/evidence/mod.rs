//! evidence — provenance for the Truth Gate.
//!
//! The hole this closes
//! --------------------
//! Truth Gate says: no "done / tests passed" without evidence. But it trusts
//! the *shape* of the text — an agent can type a block that looks like
//! `git diff` output and the gate believes it. Evidence was never tied to a
//! command that actually ran.
//!
//! The fix: the runtime (not the model) executes the command and signs its
//! output with HMAC keyed by YANA_EVIDENCE_KEY — a secret the model never
//! sees (kept out of prompt/context). The signed receipt is appended:
//!
//!     YANA-EVIDENCE v1 <exit> <sha256(output)> <hmac>
//!
//! When the agent pastes evidence and claims "done", `evidence verify`
//! recomputes the HMAC. A model without the key cannot forge the tag for
//! output it fabricated — fabricated evidence fails verification.
//!
//! Honest scope: proves "this exact output came from a command this runtime
//! ran under this key." Does NOT prove the command did what its name implies.
//! If the key leaks into context the guarantee is gone. One real notch above
//! "trust the text", not a TPM.

mod crypto;
use clap::Subcommand;
use crypto::{ct_eq, hmac_sha256, sha256, to_hex};
use std::process::Command;

const TAG: &str = "YANA-EVIDENCE v1";

#[derive(Subcommand)]
pub enum EvidenceAction {
    /// Run a shell command and append a signed receipt to its output.
    /// Use this instead of letting the agent narrate command results.
    Run {
        #[arg(trailing_var_arg = true, required = true)]
        command: Vec<String>,
    },
    /// Read stdin, verify the trailing receipt, exit 0 if authentic.
    /// Exit 2 = forged / altered / unsigned.
    Verify,
}

pub fn dispatch(action: EvidenceAction) {
    let code = match action {
        EvidenceAction::Run { command } => cmd_run(&command),
        EvidenceAction::Verify => cmd_verify(),
    };
    std::process::exit(code);
}

fn signing_key() -> Option<String> {
    std::env::var("YANA_EVIDENCE_KEY").ok().filter(|k| !k.is_empty())
}

fn make_receipt(key: &str, exit: i32, output: &str) -> String {
    let content_hash = to_hex(&sha256(output.as_bytes()));
    let signing_body = format!("{TAG}\n{exit}\n{content_hash}");
    let sig = to_hex(&hmac_sha256(key.as_bytes(), signing_body.as_bytes()));
    format!("{TAG} {exit} {content_hash} {sig}")
}

fn verify_receipt(key: &str, body: &str, receipt: &str) -> Result<i32, &'static str> {
    let parts: Vec<&str> = receipt.split_whitespace().collect();
    if parts.len() != 5 { return Err("malformed receipt"); }
    let (claimed_exit, claimed_hash, claimed_sig) = (parts[2], parts[3], parts[4]);

    let actual_hash = to_hex(&sha256(body.as_bytes()));
    if !ct_eq(&actual_hash, claimed_hash) {
        return Err("hash mismatch — output altered");
    }
    let signing_body = format!("{TAG}\n{claimed_exit}\n{claimed_hash}");
    let expected_sig = to_hex(&hmac_sha256(key.as_bytes(), signing_body.as_bytes()));
    if !ct_eq(&expected_sig, claimed_sig) {
        return Err("signature invalid — not produced by this runtime");
    }
    claimed_exit.parse::<i32>().map_err(|_| "invalid exit code")
}

fn cmd_run(command: &[String]) -> i32 {
    let key = match signing_key() {
        Some(k) => k,
        None => {
            eprintln!("evidence run: YANA_EVIDENCE_KEY not set. \
                       Refusing to emit unsigned receipt.");
            return 1;
        }
    };
    let joined = command.join(" ");
    let result = Command::new("sh").arg("-c").arg(&joined).output();
    let (exit, body) = match result {
        Ok(out) => {
            let mut b = String::from_utf8_lossy(&out.stdout).into_owned();
            b.push_str(&String::from_utf8_lossy(&out.stderr));
            (out.status.code().unwrap_or(-1), b)
        }
        Err(e) => (-1, format!("evidence run: spawn failed: {e}\n")),
    };
    print!("{body}");
    if !body.ends_with('\n') { println!(); }
    println!("{}", make_receipt(&key, exit, &body));
    exit
}

fn cmd_verify() -> i32 {
    use std::io::Read;
    let key = match signing_key() {
        Some(k) => k,
        None => { eprintln!("evidence verify: YANA_EVIDENCE_KEY not set."); return 1; }
    };
    let mut input = String::new();
    if std::io::stdin().read_to_string(&mut input).is_err() {
        eprintln!("evidence verify: could not read stdin."); return 2;
    }
    let trimmed = input.trim_end_matches('\n');
    let Some(nl) = trimmed.rfind('\n') else {
        eprintln!("evidence verify: no body + receipt found."); return 2;
    };
    let (body_part, receipt_line) = trimmed.split_at(nl);
    let receipt_line = receipt_line.trim_start_matches('\n');
    if !receipt_line.starts_with(TAG) {
        eprintln!("evidence verify: last line is not a YANA-EVIDENCE receipt."); return 2;
    }
    let body = format!("{body_part}\n");
    match verify_receipt(&key, &body, receipt_line) {
        Ok(exit) => { println!("evidence verify: OK — authentic, exit={exit}"); 0 }
        Err(e)   => { eprintln!("evidence verify: FAIL — {e}"); 2 }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const KEY: &str = "test-key";

    #[test]
    fn genuine_round_trips() {
        let body = "3 passed, 0 failed\n";
        let receipt = make_receipt(KEY, 0, body);
        assert_eq!(verify_receipt(KEY, body, &receipt), Ok(0));
    }

    #[test]
    fn forged_body_fails() {
        let receipt = make_receipt(KEY, 1, "1 passed, 2 failed\n");
        assert_eq!(
            verify_receipt(KEY, "3 passed, 0 failed\n", &receipt),
            Err("hash mismatch — output altered")
        );
    }

    #[test]
    fn wrong_key_fails() {
        let receipt = make_receipt(KEY, 0, "ok\n");
        assert_eq!(
            verify_receipt("wrong-key", "ok\n", &receipt),
            Err("signature invalid — not produced by this runtime")
        );
    }

    #[test]
    fn swapped_exit_code_fails() {
        let body = "FAIL: 2 tests failed\n";
        let receipt = make_receipt(KEY, 1, body);
        let forged = receipt.replacen(" 1 ", " 0 ", 1);
        assert!(verify_receipt(KEY, body, &forged).is_err());
    }
}
