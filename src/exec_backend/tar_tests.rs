//! Tests for the tar writer and the strict reader (WS6 E2).

use super::staging::StagingLimits;
use super::tar::{put_checksum, put_octal, read_archive, write_archive};
use std::path::Path;

const BLOCK: usize = 512;

fn put(dir: &Path, relative: &str, text: &str) {
    let path = dir.join(relative);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

/// One entry written by hand, so malformed archives can be made.
fn entry(name: &str, kind: u8, data: &[u8]) -> Vec<u8> {
    let mut header = [0u8; BLOCK];
    header[..name.len().min(100)].copy_from_slice(&name.as_bytes()[..name.len().min(100)]);
    put_octal(&mut header[100..108], 0o644);
    put_octal(&mut header[124..136], data.len() as u64);
    header[156] = kind;
    header[257..263].copy_from_slice(b"ustar\0");
    put_checksum(&mut header);
    let mut out = header.to_vec();
    out.extend_from_slice(data);
    out.extend(vec![0u8; (BLOCK - data.len() % BLOCK) % BLOCK]);
    out
}

fn archive(entries: &[Vec<u8>]) -> Vec<u8> {
    let mut all: Vec<u8> = entries.concat();
    all.extend(vec![0u8; BLOCK * 2]);
    all
}

type Read = (tempfile::TempDir, Result<super::tar::ArchiveReport, crate::capability::CapabilityError>);

fn read(bytes: &[u8], limits: StagingLimits) -> Read {
    let dest = tempfile::tempdir().unwrap();
    let result = read_archive(&mut &bytes[..], dest.path(), limits);
    (dest, result)
}

#[test]
fn what_is_written_is_read_back_including_long_paths_and_the_execute_bit() {
    let src = tempfile::tempdir().unwrap();
    let long = format!("{}/{}/file.txt", "d".repeat(80), "e".repeat(80));
    put(src.path(), "a.txt", "alpha");
    put(src.path(), "sub/b.txt", "bravo");
    put(src.path(), &long, "long");
    put(src.path(), "empty.txt", "");
    put(src.path(), "exact.bin", &"x".repeat(BLOCK));
    #[cfg(unix)]
    std::fs::set_permissions(src.path().join("a.txt"), std::os::unix::fs::PermissionsExt::from_mode(0o755)).unwrap();
    let files: Vec<String> = ["a.txt", "sub/b.txt", long.as_str(), "empty.txt", "exact.bin"].iter().map(|s| s.to_string()).collect();
    let mut bytes = Vec::new();
    write_archive(src.path(), &files, &mut bytes).unwrap();
    assert_eq!(bytes.len() % BLOCK, 0);
    let (dest, result) = read(&bytes, StagingLimits::default());
    assert_eq!(result.unwrap().files, 5);
    for (path, text) in [("a.txt", "alpha"), ("sub/b.txt", "bravo"), (long.as_str(), "long"), ("empty.txt", "")] {
        assert_eq!(std::fs::read_to_string(dest.path().join(path)).unwrap(), text, "{path}");
    }
    assert_eq!(std::fs::read(dest.path().join("exact.bin")).unwrap().len(), BLOCK);
    #[cfg(unix)]
    assert_eq!(std::os::unix::fs::PermissionsExt::mode(&std::fs::metadata(dest.path().join("a.txt")).unwrap().permissions()) & 0o111, 0o111);
}

#[test]
fn a_path_too_long_for_a_header_is_refused_when_writing() {
    let src = tempfile::tempdir().unwrap();
    let mut sink = Vec::new();
    let long = format!("{}/x.txt", "d".repeat(300));
    assert!(write_archive(src.path(), &[long], &mut sink).is_err());
}

#[test]
fn the_system_tar_reads_our_archive_and_we_read_the_system_tar() {
    let src = tempfile::tempdir().unwrap();
    put(src.path(), "one.txt", "1");
    put(src.path(), "dir/two.txt", "22");
    let mut bytes = Vec::new();
    write_archive(src.path(), &["one.txt".to_string(), "dir/two.txt".to_string()], &mut bytes).unwrap();
    let file = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(file.path(), &bytes).unwrap();
    let listing = std::process::Command::new("tar").arg("-tf").arg(file.path()).output().unwrap();
    let names = String::from_utf8_lossy(&listing.stdout).to_string();
    assert!(listing.status.success() && names.contains("one.txt") && names.contains("dir/two.txt"), "{names} {}", String::from_utf8_lossy(&listing.stderr));
    let made = std::process::Command::new("tar").args(["--format=ustar", "-cf", "-", "-C"]).arg(src.path()).arg(".").output().unwrap();
    assert!(made.status.success(), "{}", String::from_utf8_lossy(&made.stderr));
    let (dest, result) = read(&made.stdout, StagingLimits::default());
    assert_eq!(result.unwrap().files, 2);
    assert_eq!(std::fs::read_to_string(dest.path().join("dir/two.txt")).unwrap(), "22");
}

#[test]
fn names_that_could_escape_or_confuse_are_refused() {
    for name in ["/etc/passwd", "../escape.txt", "a/../../escape.txt", "a//b.txt", "./", "", "a/./b.txt", "tab\there", "back\\slash"] {
        let (dest, result) = read(&archive(&[entry(name, b'0', b"x")]), StagingLimits::default());
        assert!(result.is_err(), "{name:?}");
        assert_eq!(std::fs::read_dir(dest.path()).unwrap().count(), 0, "{name:?} created something");
    }
}

#[test]
fn links_and_special_entries_are_counted_never_created() {
    let bytes = archive(&[entry("link", b'2', b""), entry("hard", b'1', b""), entry("dev", b'3', b""), entry("fifo", b'6', b""), entry("real.txt", b'0', b"ok")]);
    let (dest, result) = read(&bytes, StagingLimits::default());
    let report = result.unwrap();
    assert_eq!((report.files, report.skipped), (1, 4));
    let names: Vec<String> = std::fs::read_dir(dest.path()).unwrap().map(|e| e.unwrap().file_name().to_string_lossy().to_string()).collect();
    assert_eq!(names, ["real.txt"]);
}

#[test]
fn extended_gnu_and_unknown_headers_are_refused() {
    for kind in [b'x', b'g', b'L', b'K', b'S', b'Z'] {
        let (_dest, result) = read(&archive(&[entry("pax", kind, b"")]), StagingLimits::default());
        assert!(result.is_err(), "{}", kind as char);
    }
}

#[test]
fn a_damaged_or_cut_short_stream_is_an_error_and_not_a_partial_success() {
    let good = archive(&[entry("a.txt", b'0', b"hello")]);
    // Bad checksum.
    let mut bad = good.clone();
    bad[10] ^= 0xff;
    assert!(read(&bad, StagingLimits::default()).1.is_err());
    // No terminator (the connection dropped between entries).
    let no_end = entry("a.txt", b'0', b"hello");
    assert!(read(&no_end, StagingLimits::default()).1.unwrap_err().to_string().contains("ended early"));
    // Cut inside a file's data.
    assert!(read(&good[..BLOCK + 2], StagingLimits::default()).1.is_err());
    // Empty input.
    assert!(read(&[], StagingLimits::default()).1.is_err());
    // A size field in the base-256 form.
    let mut big = entry("a.txt", b'0', b"x");
    big[124] = 0x80;
    assert!(read(&archive(&[big]), StagingLimits::default()).1.is_err());
}

#[test]
fn limits_apply_before_anything_large_is_written() {
    let small = StagingLimits { max_files: 2, max_bytes: 10, max_depth: 16 };
    let too_big = archive(&[entry("a.txt", b'0', &[b'x'; 50])]);
    assert!(read(&too_big, small).1.unwrap_err().to_string().contains("more than the limit"));
    let many = archive(&[entry("a", b'0', b"1"), entry("b", b'0', b"1"), entry("c", b'0', b"1")]);
    assert!(read(&many, small).1.is_err());
    // A header that claims a huge size and carries no data: refused by size, never read.
    let mut lie = entry("a.txt", b'0', b"");
    put_octal(&mut lie[124..136], 1 << 30);
    let mut head = [0u8; BLOCK];
    head.copy_from_slice(&lie[..BLOCK]);
    put_checksum(&mut head);
    lie[..BLOCK].copy_from_slice(&head);
    assert!(read(&archive(&[lie]), small).1.is_err());
}

#[test]
fn the_same_path_twice_is_refused() {
    let twice = archive(&[entry("a.txt", b'0', b"1"), entry("a.txt", b'0', b"2")]);
    assert!(read(&twice, StagingLimits::default()).1.is_err());
}

#[test]
fn what_a_build_fills_on_the_other_side_is_skipped_without_counting_or_writing() {
    let big = vec![b'x'; 5000];
    let bytes = archive(&[
        entry("node_modules/pkg/index.js", b'0', &big),
        entry("target/debug/app", b'0', &big),
        entry(".git/config", b'0', b"evil"),
        entry(".yana-ai/leases.json", b'0', b"evil"),
        entry("deploy/server.pem", b'0', b"key"),
        entry("ok.txt", b'0', b"fine"),
    ]);
    let tight = StagingLimits { max_files: 3, max_bytes: 100, max_depth: 16 };
    let (dest, result) = read(&bytes, tight);
    let report = result.unwrap();
    assert_eq!((report.files, report.skipped), (1, 5));
    assert_eq!(std::fs::read_dir(dest.path()).unwrap().count(), 1, "only ok.txt exists");
}

#[test]
fn folders_cannot_be_multiplied_by_deep_names() {
    let limits = StagingLimits { max_files: 100, max_bytes: 1 << 20, max_depth: 4 };
    let deep = entry("a/b/c/d/e/f/g.txt", b'0', b"x");
    assert!(read(&archive(&[deep]), limits).1.unwrap_err().to_string().contains("deeper"));
    // Many directory entries, each with a deep path, cost against the same limit.
    let mut entries = Vec::new();
    for n in 0..60 {
        entries.push(entry(&format!("d{n}/x/y"), b'5', b""));
    }
    assert!(read(&archive(&entries), limits).1.unwrap_err().to_string().contains("folders"));
}

#[test]
fn a_name_with_bytes_after_its_end_and_a_header_without_the_ustar_mark_are_refused() {
    let mut hidden = entry("a", b'0', b"x");
    hidden[5] = b'z';
    put_checksum_in(&mut hidden);
    assert!(read(&archive(&[hidden]), StagingLimits::default()).1.is_err());
    let mut plain = entry("a.txt", b'0', b"x");
    plain[257..262].copy_from_slice(b"\0\0\0\0\0");
    put_checksum_in(&mut plain);
    assert!(read(&archive(&[plain]), StagingLimits::default()).1.is_err());
}

fn put_checksum_in(entry: &mut [u8]) {
    let mut head = [0u8; BLOCK];
    head.copy_from_slice(&entry[..BLOCK]);
    put_checksum(&mut head);
    entry[..BLOCK].copy_from_slice(&head);
}
