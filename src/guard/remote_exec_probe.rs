//! Questions asked about a stage: does it download, decode, hide its command name, or read a program from stdin.

use super::classify::{fed_inline_reads_stdin, reads_program_from_stdin};
use super::parse::{self, Stage, PROCSUB_MARK, SUBST_MARK};
use super::rules::decodes;
use super::{name_of, DECODE_PIPE, FETCHERS, FETCH_PIPE, MAX_DEPTH};

/// Which substitution bodies of a stage to look into.
#[derive(Clone, Copy)]
pub(super) enum Bodies {
    Substitutions,
    Process,
    Both,
}

/// A stage inside one of `stage`'s substitution bodies satisfies `test`.
pub(super) fn in_bodies(
    stage: &Stage,
    depth: usize,
    which: Bodies,
    test: &dyn Fn(&Stage, usize) -> bool,
) -> bool {
    let subs = stage.substitutions();
    let procs = stage.process_substitutions();
    let bodies: Vec<&str> = match which {
        Bodies::Substitutions => subs.collect(),
        Bodies::Process => procs.collect(),
        Bodies::Both => subs.chain(procs).collect(),
    };
    depth < MAX_DEPTH
        && bodies.iter().any(|body| {
            parse::pipelines(body)
                .iter()
                .flatten()
                .any(|inner| test(inner, depth + 1))
        })
}

/// The stage downloads, directly or through a `$( )` / `<( )` it contains.
pub(super) fn fetches(stage: &Stage, depth: usize) -> bool {
    name_of(stage).is_some_and(|name| FETCHERS.contains(&name))
        || in_bodies(stage, depth, Bodies::Both, &fetches)
}

pub(super) fn decodes_deep(stage: &Stage, depth: usize) -> bool {
    decodes(stage) || in_bodies(stage, depth, Bodies::Both, &decodes_deep)
}

/// The command word comes from a variable or a substitution, so what runs is not visible.
pub(super) fn opaque(stage: &Stage) -> bool {
    stage.command().is_some_and(|(word, _)| {
        word.contains(['$', '{', '*', '?', SUBST_MARK, PROCSUB_MARK])
            || (word.len() > 1 && word.contains('['))
    })
}

/// Cached: the pipeline and group checks would otherwise ask this again for every later stage.
pub(super) fn feeds_remote(stage: &Stage) -> bool {
    *stage
        .fetch_cache
        .get_or_init(|| fetches(stage, 0) || opaque(stage))
}

pub(super) fn feeds_decoded(stage: &Stage) -> bool {
    *stage.decode_cache.get_or_init(|| decodes_deep(stage, 0))
}

/// The stage, or an inline script it hands to a shell, reads a program from stdin.
pub(super) fn consumes_stdin_program(stage: &Stage) -> bool {
    reads_program_from_stdin(stage)
        || opaque(stage)
        || fed_inline_reads_stdin(stage, &|inner| {
            parse::pipelines(inner)
                .iter()
                .flatten()
                .any(|s| reads_program_from_stdin(s) || opaque(s))
        })
}

/// `curl x | tee >(bash)`: a `>( )` body reads what the stage (or the pipe before it) writes.
pub(super) fn judge_sinks(stage: &Stage, before: &[Stage]) -> Option<&'static str> {
    let reads = stage.sinks().any(|body| {
        parse::pipelines(body)
            .iter()
            .flatten()
            .any(consumes_stdin_program)
    });
    if !reads {
        return None;
    }
    let sources = || before.iter().chain([stage]);
    if sources().any(feeds_remote) {
        Some(FETCH_PIPE)
    } else {
        sources().any(feeds_decoded).then_some(DECODE_PIPE)
    }
}
