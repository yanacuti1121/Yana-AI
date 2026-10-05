//! A reader that refuses to buffer without limit (WS3 T1).
//!
//! rmcp reads a server's output one line at a time into memory, and its default
//! frame limit is `usize::MAX`: a server that never sends a newline, or floods
//! the pipe, would grow this process until a time limit stops it. Wrapping the
//! server's stdout here turns that into a prompt, bounded failure: a line longer
//! than `max_line` bytes, or more than `max_total` bytes overall, makes the next
//! read fail, which ends the session.

use std::io;
use std::pin::Pin;
use std::task::{Context, Poll};
use tokio::io::{AsyncRead, ReadBuf};

/// Longest single message accepted from a server.
pub const MAX_LINE_BYTES: usize = 1024 * 1024;
/// Most a server may send over one session.
pub const MAX_TOTAL_BYTES: usize = 16 * 1024 * 1024;

pub struct BoundedReader<R> {
    inner: R,
    max_line: usize,
    max_total: usize,
    line: usize,
    total: usize,
}

impl<R> BoundedReader<R> {
    pub fn new(inner: R, max_line: usize, max_total: usize) -> Self {
        Self { inner, max_line, max_total, line: 0, total: 0 }
    }
}

fn too_much(what: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, format!("the MCP server sent more than allowed ({what})"))
}

impl<R: AsyncRead + Unpin> AsyncRead for BoundedReader<R> {
    fn poll_read(mut self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &mut ReadBuf<'_>) -> Poll<io::Result<()>> {
        let before = buf.filled().len();
        let polled = Pin::new(&mut self.inner).poll_read(cx, buf);
        if let Poll::Ready(Ok(())) = &polled {
            let fresh = buf.filled()[before..].to_vec();
            self.total += fresh.len();
            let mut over = (self.total > self.max_total).then(|| too_much("total size"));
            for byte in &fresh {
                self.line = if *byte == b'\n' { 0 } else { self.line + 1 };
                if over.is_none() && self.line > self.max_line {
                    over = Some(too_much("one message"));
                }
            }
            if let Some(error) = over {
                // An error must not hand back data: take the fresh bytes out again.
                buf.set_filled(before);
                return Poll::Ready(Err(error));
            }
        }
        polled
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::AsyncReadExt;

    async fn read_all(data: Vec<u8>, max_line: usize, max_total: usize) -> io::Result<Vec<u8>> {
        let mut reader = BoundedReader::new(io::Cursor::new(data), max_line, max_total);
        let mut out = Vec::new();
        reader.read_to_end(&mut out).await.map(|_| out)
    }

    #[tokio::test]
    async fn ordinary_lines_pass_through_unchanged() {
        let data = b"{\"a\":1}\n{\"b\":2}\n".to_vec();
        assert_eq!(read_all(data.clone(), 100, 1000).await.unwrap(), data);
    }

    #[tokio::test]
    async fn a_line_over_the_limit_fails_even_without_a_newline() {
        let error = read_all(vec![b'x'; 5000], 1000, 1_000_000).await.unwrap_err();
        assert_eq!(error.kind(), io::ErrorKind::InvalidData);
        assert!(read_all(vec![b'x'; 1000], 1000, 1_000_000).await.is_ok(), "exactly the limit is fine");
    }

    #[tokio::test]
    async fn the_line_count_resets_at_each_newline() {
        let mut data = Vec::new();
        for _ in 0..50 {
            data.extend(vec![b'y'; 90]);
            data.push(b'\n');
        }
        assert!(read_all(data, 100, 1_000_000).await.is_ok(), "many short lines are not one long one");
    }

    #[tokio::test]
    async fn the_total_is_capped_even_when_every_line_is_short() {
        let data = b"abcdefghi\n".repeat(1000);
        let error = read_all(data, 100, 5000).await.unwrap_err();
        assert!(error.to_string().contains("total size"), "{error}");
    }
}
