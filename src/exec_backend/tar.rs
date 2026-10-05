//! A small tar (USTAR) writer and a strict reader, for moving the private copy to and from a
//! remote machine over `ssh` without a tar crate (WS6 E2).
//!
//! The writer only writes plain files. The reader is for bytes that come from another machine
//! and so are not trusted: it accepts plain files and directories, counts and skips links and
//! special entries (they are never created), refuses extended or GNU headers, and refuses any
//! name that is absolute, has `.` or `..` parts, is not UTF-8, or has a control character. Sizes
//! and entry counts are limited before anything is written, a bad checksum or a stream cut short
//! is an error, and nothing is ever created as a link.

use super::staging::StagingLimits;
use crate::capability::CapabilityError;
use std::io::{Read, Write};
use std::path::Path;

const BLOCK: usize = 512;
/// Longest name the plain USTAR header can carry (prefix 155, `/`, name 100).
const MAX_NAME: usize = 255;

fn invalid(detail: impl Into<String>) -> CapabilityError {
    CapabilityError::InvalidInput { detail: detail.into() }
}

pub(super) fn put_octal(field: &mut [u8], value: u64) {
    let last = field.len() - 1;
    let text = format!("{value:0last$o}");
    field[..last].copy_from_slice(text.as_bytes());
    field[last] = 0;
}

/// Fill the checksum field: six octal digits, a NUL and a space.
pub(super) fn put_checksum(header: &mut [u8; BLOCK]) {
    let text = format!("{:06o}", checksum(header));
    header[148..154].copy_from_slice(text.as_bytes());
    header[154] = 0;
    header[155] = b' ';
}

pub(super) fn checksum(header: &[u8; BLOCK]) -> u32 {
    header.iter().enumerate().map(|(i, b)| if (148..156).contains(&i) { 32 } else { u32::from(*b) }).sum()
}

/// Split a path into the USTAR `prefix` and `name` fields.
fn split_name(name: &str) -> Result<(&str, &str), CapabilityError> {
    if name.len() <= 100 {
        return Ok(("", name));
    }
    if name.len() > MAX_NAME {
        return Err(invalid(format!("the path {name:?} is too long for a tar header")));
    }
    for (index, _) in name.match_indices('/') {
        let (prefix, rest) = (&name[..index], &name[index + 1..]);
        if prefix.len() <= 155 && rest.len() <= 100 && !rest.is_empty() {
            return Ok((prefix, rest));
        }
    }
    Err(invalid(format!("the path {name:?} cannot be split to fit a tar header")))
}

/// Write `files` (relative paths under `dir`, all plain files) as one archive.
pub(super) fn write_archive(dir: &Path, files: &[String], out: &mut dyn Write) -> Result<(), CapabilityError> {
    let io = |error: std::io::Error| CapabilityError::Io { detail: format!("cannot write the archive: {error}") };
    for relative in files {
        let source = dir.join(relative);
        let mut input = super::staging::open_plain(&source).map_err(io)?;
        let meta = input.metadata().map_err(io)?;
        if !meta.is_file() {
            return Err(invalid(format!("{relative} is not a plain file")));
        }
        let (prefix, name) = split_name(relative)?;
        let mut header = [0u8; BLOCK];
        header[..name.len()].copy_from_slice(name.as_bytes());
        #[cfg(unix)]
        let mode = u64::from(super::staging::plain_mode(std::os::unix::fs::PermissionsExt::mode(&meta.permissions())));
        #[cfg(not(unix))]
        let mode = 0o644u64;
        put_octal(&mut header[100..108], mode);
        put_octal(&mut header[108..116], 0);
        put_octal(&mut header[116..124], 0);
        put_octal(&mut header[124..136], meta.len());
        put_octal(&mut header[136..148], 0);
        header[156] = b'0';
        header[257..263].copy_from_slice(b"ustar\0");
        header[263..265].copy_from_slice(b"00");
        header[345..345 + prefix.len()].copy_from_slice(prefix.as_bytes());
        put_checksum(&mut header);
        out.write_all(&header).map_err(io)?;
        let copied = std::io::copy(&mut (&mut input).take(meta.len()), out).map_err(io)?;
        if copied != meta.len() {
            return Err(invalid(format!("{relative} changed size while it was archived")));
        }
        let pad = (BLOCK - (copied as usize % BLOCK)) % BLOCK;
        out.write_all(&vec![0u8; pad]).map_err(io)?;
    }
    out.write_all(&[0u8; BLOCK * 2]).map_err(io)?;
    out.flush().map_err(io)
}

/// What reading an archive did.
#[derive(Debug, Default, PartialEq, Eq)]
pub(super) struct ArchiveReport {
    pub files: usize,
    pub bytes: u64,
    /// Entries that were links, devices or the like: counted, never created.
    pub skipped: usize,
}

fn read_octal(field: &[u8]) -> Result<u64, CapabilityError> {
    if field.first().is_some_and(|b| b & 0x80 != 0) {
        return Err(invalid("a tar entry uses a size format that is not accepted"));
    }
    let text: String = field.iter().take_while(|b| **b != 0).map(|b| *b as char).collect();
    let text = text.trim();
    if text.is_empty() {
        return Ok(0);
    }
    u64::from_str_radix(text, 8).map_err(|_| invalid("a tar header has a number that is not octal"))
}

fn field_text(field: &[u8]) -> Result<&str, CapabilityError> {
    let end = field.iter().position(|b| *b == 0).unwrap_or(field.len());
    if field[end..].iter().any(|b| *b != 0) {
        return Err(invalid("a tar entry name has bytes after its end"));
    }
    std::str::from_utf8(&field[..end]).map_err(|_| invalid("a tar entry name is not UTF-8"))
}

/// A name from an archive as a clean relative path, or why not.
fn clean_name(raw: &str) -> Result<String, CapabilityError> {
    let name = raw.strip_prefix("./").unwrap_or(raw);
    let name = name.trim_end_matches('/');
    let bad = name.is_empty()
        || name.starts_with('/')
        || name.contains(|c: char| c.is_control() || c == '\\')
        || name.split('/').any(|part| part.is_empty() || part == "." || part == "..");
    if bad {
        return Err(invalid(format!("the archive has a path that is not accepted: {raw:?}")));
    }
    Ok(name.to_string())
}

fn check_depth(relative: &str, limits: StagingLimits) -> Result<(), CapabilityError> {
    if relative.split('/').count() > limits.max_depth + 1 {
        return Err(invalid("the archive nests deeper than the limit allows: nothing was copied back"));
    }
    Ok(())
}

/// Read and drop `size` bytes and the padding after them.
fn discard(input: &mut impl Read, size: u64) -> Result<(), CapabilityError> {
    let total = size + ((BLOCK as u64 - size % BLOCK as u64) % BLOCK as u64);
    let copied = std::io::copy(&mut input.take(total), &mut std::io::sink()).map_err(|error| CapabilityError::Io { detail: format!("cannot read the archive: {error}") })?;
    if copied != total {
        return Err(invalid("the archive ended early: nothing was copied back"));
    }
    Ok(())
}

/// Read an archive from `input` into the empty directory `dest`, within `limits`.
pub(super) fn read_archive(input: &mut impl Read, dest: &Path, limits: StagingLimits) -> Result<ArchiveReport, CapabilityError> {
    let io = |error: std::io::Error| CapabilityError::Io { detail: format!("cannot read the archive: {error}") };
    let truncated = || invalid("the archive ended early: nothing was copied back");
    let mut report = ArchiveReport::default();
    let (mut entries, mut zero_blocks, mut dirs) = (0usize, 0usize, 0usize);
    loop {
        let mut header = [0u8; BLOCK];
        input.read_exact(&mut header).map_err(|error| if error.kind() == std::io::ErrorKind::UnexpectedEof { truncated() } else { io(error) })?;
        if header.iter().all(|b| *b == 0) {
            zero_blocks += 1;
            if zero_blocks == 2 {
                return Ok(report);
            }
            continue;
        }
        zero_blocks = 0;
        entries += 1;
        if entries > limits.max_files.saturating_mul(2) {
            return Err(invalid("the archive has far more entries than the limit allows"));
        }
        if u64::from(checksum(&header)) != read_octal(&header[148..156])? {
            return Err(invalid("the archive has a bad checksum"));
        }
        if &header[257..262] != b"ustar" {
            return Err(invalid("the archive is not in the plain ustar format"));
        }
        let size = read_octal(&header[124..136])?;
        let name = {
            let prefix = field_text(&header[345..500])?;
            let name = field_text(&header[..100])?;
            if prefix.is_empty() { name.to_string() } else { format!("{prefix}/{name}") }
        };
        let kind = header[156];
        match kind {
            b'0' | 0 => {
                let relative = clean_name(&name)?;
                check_depth(&relative, limits)?;
                if super::staging::excluded(&relative).is_some() {
                    // Never written, never counted: a build on the other side may fill these.
                    discard(input, size)?;
                    report.skipped += 1;
                    continue;
                }
                if report.files >= limits.max_files || report.bytes.saturating_add(size) > limits.max_bytes {
                    return Err(invalid("the archive holds more than the limit allows: nothing was copied back"));
                }
                dirs += relative.matches('/').count();
                if dirs > limits.max_files {
                    return Err(invalid("the archive makes more folders than the limit allows: nothing was copied back"));
                }
                write_entry(input, dest, &relative, size, read_octal(&header[100..108])?)?;
                report.files += 1;
                report.bytes += size;
                let skip = (BLOCK - (size as usize % BLOCK)) % BLOCK;
                let mut pad = vec![0u8; skip];
                input.read_exact(&mut pad).map_err(|error| if error.kind() == std::io::ErrorKind::UnexpectedEof { truncated() } else { io(error) })?;
            }
            b'5' => {
                // `tar -c .` lists the top directory itself as "./": nothing to make.
                if !matches!(name.trim_end_matches('/'), "" | ".") {
                    let relative = clean_name(&name)?;
                    check_depth(&relative, limits)?;
                    if super::staging::excluded(&relative).is_none() {
                        dirs += 1 + relative.matches('/').count();
                        if dirs > limits.max_files {
                            return Err(invalid("the archive makes more folders than the limit allows: nothing was copied back"));
                        }
                        std::fs::create_dir_all(dest.join(relative)).map_err(io)?;
                    }
                }
            }
            b'1' | b'2' | b'3' | b'4' | b'6' | b'7' => {
                // Linked and special entries carry no data blocks; they are never created.
                report.skipped += 1;
            }
            _ => return Err(invalid("the archive has an entry of a kind that is not accepted (extended or GNU header)")),
        }
    }
}

fn write_entry(input: &mut impl Read, dest: &Path, relative: &str, size: u64, mode: u64) -> Result<(), CapabilityError> {
    let io = |error: std::io::Error| CapabilityError::Io { detail: format!("cannot extract {relative}: {error}") };
    let target = dest.join(relative);
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(io)?;
    }
    let mut output = std::fs::OpenOptions::new().write(true).create_new(true).open(&target).map_err(io)?;
    let copied = std::io::copy(&mut input.take(size), &mut output).map_err(io)?;
    if copied != size {
        return Err(invalid("the archive ended early: nothing was copied back"));
    }
    #[cfg(unix)]
    {
        let mode = super::staging::plain_mode(mode as u32);
        std::fs::set_permissions(&target, std::os::unix::fs::PermissionsExt::from_mode(mode)).map_err(io)?;
    }
    #[cfg(not(unix))]
    let _ = mode;
    Ok(())
}
