//! LSP message framing: `Content-Length: N\r\n\r\n` followed by N bytes of JSON.
//!
//! Everything read here comes from a program the repository named, so every
//! length is capped before anything is allocated or read: a header line, the
//! number of header lines, and the body.

use serde_json::Value;
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncWrite, AsyncWriteExt};

/// Longest header line accepted (`Content-Length: 1048576` is 24 bytes).
const MAX_HEADER_LINE: usize = 256;
/// Most header lines before the blank line (a server sends one or two).
const MAX_HEADER_LINES: usize = 8;
/// Largest message body accepted.
pub const MAX_BODY_BYTES: usize = 1024 * 1024;

#[derive(Debug, PartialEq, Eq)]
pub enum CodecError {
    /// The server closed its output before a message was complete.
    Closed,
    /// The bytes are not a well-formed frame; the text says what was wrong.
    Malformed(String),
    Io(String),
}

impl std::fmt::Display for CodecError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Closed => write!(f, "the language server closed its output"),
            Self::Malformed(why) => write!(f, "the language server sent a malformed message ({why})"),
            Self::Io(why) => write!(f, "could not talk to the language server ({why})"),
        }
    }
}

fn malformed(why: impl Into<String>) -> CodecError {
    CodecError::Malformed(why.into())
}

/// One header line without its line ending, reading at most `MAX_HEADER_LINE` bytes.
/// `None` at a clean end of input before any byte.
async fn read_header_line<R: AsyncBufRead + Unpin>(reader: &mut R) -> Result<Option<String>, CodecError> {
    let mut line = Vec::new();
    loop {
        let available = reader.fill_buf().await.map_err(|e| CodecError::Io(e.kind().to_string()))?;
        if available.is_empty() {
            return if line.is_empty() { Ok(None) } else { Err(CodecError::Closed) };
        }
        let newline = available.iter().position(|b| *b == b'\n');
        let take = newline.map_or(available.len(), |at| at + 1);
        if line.len() + take > MAX_HEADER_LINE {
            return Err(malformed("a header line is too long"));
        }
        line.extend_from_slice(&available[..take]);
        reader.consume(take);
        if newline.is_some() {
            break;
        }
    }
    let text = String::from_utf8(line).map_err(|_| malformed("a header is not text"))?;
    Ok(Some(text.trim_end_matches(['\r', '\n']).to_string()))
}

/// The next message, or `Closed` when the server's output ended between messages.
pub async fn read_message<R: AsyncBufRead + Unpin>(reader: &mut R) -> Result<Value, CodecError> {
    let mut length: Option<usize> = None;
    for seen in 0.. {
        if seen >= MAX_HEADER_LINES {
            return Err(malformed("too many header lines"));
        }
        let Some(line) = read_header_line(reader).await? else {
            return Err(CodecError::Closed);
        };
        if line.is_empty() {
            break;
        }
        let Some((name, value)) = line.split_once(':') else {
            return Err(malformed("a header has no colon"));
        };
        if name.trim().eq_ignore_ascii_case("content-length") {
            if length.is_some() {
                return Err(malformed("two Content-Length headers"));
            }
            let value = value.trim();
            if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
                return Err(malformed("Content-Length is not a number"));
            }
            length = Some(value.parse::<usize>().map_err(|_| malformed("Content-Length is too large"))?);
        }
    }
    let length = length.ok_or_else(|| malformed("no Content-Length"))?;
    if length > MAX_BODY_BYTES {
        return Err(malformed(format!("a message of {length} bytes is over the {MAX_BODY_BYTES} byte limit")));
    }
    let mut body = vec![0u8; length];
    tokio::io::AsyncReadExt::read_exact(reader, &mut body).await.map_err(|e| match e.kind() {
        std::io::ErrorKind::UnexpectedEof => CodecError::Closed,
        _ => CodecError::Io(e.kind().to_string()),
    })?;
    serde_json::from_slice(&body).map_err(|_| malformed("the body is not JSON"))
}

pub async fn write_message<W: AsyncWrite + Unpin>(writer: &mut W, message: &Value) -> Result<(), CodecError> {
    let body = serde_json::to_vec(message).map_err(|e| CodecError::Io(e.to_string()))?;
    let head = format!("Content-Length: {}\r\n\r\n", body.len());
    let io = |e: std::io::Error| CodecError::Io(e.kind().to_string());
    writer.write_all(head.as_bytes()).await.map_err(io)?;
    writer.write_all(&body).await.map_err(io)?;
    writer.flush().await.map_err(io)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tokio::io::BufReader;

    fn frame(body: &str) -> Vec<u8> {
        format!("Content-Length: {}\r\n\r\n{body}", body.len()).into_bytes()
    }

    async fn read(bytes: Vec<u8>) -> Result<Value, CodecError> {
        read_message(&mut BufReader::new(std::io::Cursor::new(bytes))).await
    }

    #[tokio::test]
    async fn a_message_written_is_the_message_read() {
        let mut out = Vec::new();
        write_message(&mut out, &json!({"jsonrpc": "2.0", "id": 1, "result": [1, 2]})).await.unwrap();
        assert_eq!(read(out).await.unwrap(), json!({"jsonrpc": "2.0", "id": 1, "result": [1, 2]}));
    }

    #[tokio::test]
    async fn two_messages_in_a_row_and_a_content_type_header_are_fine() {
        let mut bytes = b"Content-Type: application/vscode-jsonrpc; charset=utf-8\r\n".to_vec();
        bytes.extend(frame(r#"{"a":1}"#));
        bytes.extend(frame(r#"{"b":2}"#));
        let mut reader = BufReader::new(std::io::Cursor::new(bytes));
        assert_eq!(read_message(&mut reader).await.unwrap(), json!({"a": 1}));
        assert_eq!(read_message(&mut reader).await.unwrap(), json!({"b": 2}));
        assert_eq!(read_message(&mut reader).await, Err(CodecError::Closed), "a clean end between messages");
    }

    #[tokio::test]
    async fn multibyte_text_is_counted_in_bytes_not_characters() {
        assert_eq!(read(frame("{\"a\":\"\u{4e2d}\u{6587}\"}")).await.unwrap(), json!({"a": "\u{4e2d}\u{6587}"}));
    }

    #[tokio::test]
    async fn a_frame_that_breaks_a_limit_is_refused_before_it_is_read() {
        let huge = format!("Content-Length: {}\r\n\r\n", MAX_BODY_BYTES + 1).into_bytes();
        assert!(matches!(read(huge).await, Err(CodecError::Malformed(_))), "over the body limit, with no body sent at all");
        assert!(matches!(read(b"Content-Length: 99999999999999999999999\r\n\r\n".to_vec()).await, Err(CodecError::Malformed(_))), "too large to parse");
        let long_line = format!("X-Pad: {}\r\n\r\n", "a".repeat(MAX_HEADER_LINE + 10)).into_bytes();
        assert!(matches!(read(long_line).await, Err(CodecError::Malformed(_))), "a header line over the cap, with no newline needed");
        assert!(matches!(read(vec![b'x'; 100_000]).await, Err(CodecError::Malformed(_))), "endless line with no newline");
        let many = (0..MAX_HEADER_LINES + 1).map(|n| format!("H{n}: v\r\n")).collect::<String>() + "\r\n";
        assert!(matches!(read(many.into_bytes()).await, Err(CodecError::Malformed(_))), "too many headers");
    }

    #[tokio::test]
    async fn bad_headers_are_malformed_not_guessed_at() {
        for bad in [
            "Content-Length: 12abc\r\n\r\n{}",
            "Content-Length: -1\r\n\r\n{}",
            "Content-Length:\r\n\r\n{}",
            "Content-Length: 2\r\nContent-Length: 2\r\n\r\n{}",
            "no colon here\r\n\r\n",
            "\r\n{}",
            "Content-Type: x\r\n\r\n{}",
        ] {
            assert!(matches!(read(bad.as_bytes().to_vec()).await, Err(CodecError::Malformed(_))), "{bad:?}");
        }
        assert!(matches!(read(frame("not json")).await, Err(CodecError::Malformed(_))));
    }

    #[tokio::test]
    async fn a_connection_cut_short_is_closed_not_a_hang() {
        assert_eq!(read(Vec::new()).await, Err(CodecError::Closed));
        assert_eq!(read(b"Content-Length: 50\r\n\r\n{\"a\":".to_vec()).await, Err(CodecError::Closed), "body shorter than promised");
        assert_eq!(read(b"Content-Len".to_vec()).await, Err(CodecError::Closed), "cut inside a header");
    }
}
