//! Shell-like splitting for `remote_exec`. Not a full shell: it follows what decides whether text is a
//! command or data (quotes, `$'..'`, backslashes, `#` comments, `$( )`, backticks, `<( )`, `>( )`,
//! here-documents, here-strings, `|`, `|&`, `;`, `&&`, `||`, `&`, newlines and redirections) and nothing else.
//!
//! Where it cannot tell, it fails closed: an unterminated quote is read as a literal character, a
//! here-document with no closing line is also read as ordinary commands, and a newline after a pipe
//! continues the pipeline. All text arrives lower-cased (`remote_exec::check`).

use std::cell::OnceCell;

#[path = "remote_exec_heredoc.rs"]
mod heredoc;
#[path = "remote_exec_quotes.rs"]
mod quotes;
#[path = "remote_exec_stage.rs"]
mod stage;

/// Stands for a `$( )` or backtick substitution inside a word. A control character, because it cannot occur
/// in typed text and is not a shell metacharacter.
pub(super) const SUBST_MARK: char = '\u{1}';
/// Stands for a `<( )` or `>( )` process substitution inside a word.
pub(super) const PROCSUB_MARK: char = '\u{2}';

/// One command of a pipeline, with quotes removed from its words.
#[derive(Debug, Default, Clone)]
pub struct Stage {
    pub(super) words: Vec<String>,
    pub(super) subs: Vec<String>,
    /// `<( )` bodies: the command reads their output.
    pub(super) procs: Vec<String>,
    /// `>( )` bodies: their input is what this command writes.
    pub(super) sinks: Vec<String>,
    /// Redirection targets (`< /dev/tcp/host/80`), which are not arguments.
    pub(super) redirects: Vec<String>,
    /// Text fed to this command's stdin: a here-document body or a here-string.
    pub heredoc: Option<String>,
    /// A word used `$'..'` escapes (so `echo $'\x72\x6d'` is a decoder even though no `\x` is left).
    pub ansi_c: bool,
    /// A `(` opened right after a pipe, so this stage starts a subshell that the pipe feeds.
    pub(super) subshell: bool,
    /// Results of the two recursive questions, asked once per stage: the pipeline and group checks would
    /// otherwise ask them again for every later stage.
    pub(super) fetch_cache: OnceCell<bool>,
    pub(super) decode_cache: OnceCell<bool>,
}

pub type Pipeline = Vec<Stage>;

pub(super) struct Scanner {
    pub(super) chars: Vec<char>,
    pub(super) pos: usize,
    pub(super) out: Vec<Pipeline>,
    pub(super) pipeline: Pipeline,
    pub(super) stage: Stage,
    pub(super) word: String,
    pub(super) in_word: bool,
    /// The next word is a redirection target (`> file`), not an argument.
    pub(super) skip_next_word: bool,
    /// The next word is the text of a here-string (`<<< text`).
    pub(super) here_string: bool,
    /// The last operator was a pipe and no word has followed: a newline continues the pipeline.
    pub(super) pending_pipe: bool,
    /// Pending here-documents: delimiter, `<<-`, index into `out` and stage index of the command that declared it.
    pub(super) heredocs: Vec<(String, bool, usize, usize)>,
}

pub fn pipelines(text: &str) -> Vec<Pipeline> {
    let mut scanner = Scanner {
        chars: text.chars().collect(),
        pos: 0,
        out: Vec::new(),
        pipeline: Vec::new(),
        stage: Stage::default(),
        word: String::new(),
        in_word: false,
        skip_next_word: false,
        here_string: false,
        pending_pipe: false,
        heredocs: Vec::new(),
    };
    scanner.run();
    scanner.end_segment();
    scanner.out
}

impl Scanner {
    pub(super) fn peek(&self, ahead: usize) -> Option<char> {
        self.chars.get(self.pos + ahead).copied()
    }

    pub(super) fn push(&mut self, c: char) {
        self.word.push(c);
        self.in_word = true;
    }

    pub(super) fn end_word(&mut self) {
        if !self.in_word {
            return;
        }
        let word = std::mem::take(&mut self.word);
        if self.here_string {
            self.stage.heredoc = Some(word);
        } else if self.skip_next_word {
            self.stage.redirects.push(word);
        } else {
            self.stage.words.push(word);
        }
        self.skip_next_word = false;
        self.here_string = false;
        self.pending_pipe = false;
        self.in_word = false;
    }

    fn next_stage(&mut self) {
        self.end_word();
        self.pipeline.push(std::mem::take(&mut self.stage));
    }

    pub(super) fn end_segment(&mut self) {
        self.next_stage();
        self.skip_next_word = false;
        self.here_string = false;
        self.pending_pipe = false;
        let pipeline = std::mem::take(&mut self.pipeline);
        if pipeline
            .iter()
            .any(|stage| !stage.words.is_empty() || stage.heredoc.is_some())
        {
            self.out.push(pipeline);
        }
    }

    fn run(&mut self) {
        while let Some(c) = self.peek(0) {
            match c {
                '\\' => self.backslash(),
                '\'' => self.single_quote(),
                '"' => self.double_quote(),
                '$' => self.dollar(),
                '`' => self.backtick(),
                '<' | '>' => self.redirect(),
                '#' if !self.in_word => self.comment(),
                '\n' if self.pending_pipe && !self.in_word => self.pos += 1, // `curl x |` newline `bash`: still one pipeline
                '\n' => {
                    self.end_segment();
                    self.pos += 1;
                    self.read_heredocs();
                }
                ' ' | '\t' | '\r' | ';' | '(' | ')' | '|' | '&' => self.operator(c),
                _ => {
                    self.push(c);
                    self.pos += 1;
                }
            }
        }
    }

    fn backslash(&mut self) {
        match self.peek(1) {
            Some('\n') => self.pos += 2, // a line continuation
            Some(next) => {
                self.push(next);
                self.pos += 2;
            }
            None => self.pos += 1,
        }
    }

    fn comment(&mut self) {
        while self.peek(0).is_some_and(|ch| ch != '\n') {
            self.pos += 1;
        }
    }

    /// Whitespace and the operators that end a word, a command or a pipeline stage.
    fn operator(&mut self, c: char) {
        self.end_word();
        match c {
            // `curl x | ( bash )`: a group opened right after a pipe stays in that pipeline.
            '(' if self.stage.words.is_empty() && !self.pipeline.is_empty() => {
                self.stage.subshell = true
            }
            ';' | '(' | ')' => self.end_segment(),
            '|' => {
                self.next_stage();
                match self.peek(1) {
                    Some('|') => {
                        self.pos += 1;
                        self.end_segment();
                    }
                    Some('&') => {
                        self.pos += 1; // `|&` pipes stderr too
                        self.pending_pipe = true;
                    }
                    _ => self.pending_pipe = true,
                }
            }
            // `&>file` is a redirection; `&&` and a lone `&` end the command.
            '&' if self.peek(1) == Some('>') => {}
            '&' => {
                if self.peek(1) == Some('&') {
                    self.pos += 1;
                }
                self.end_segment();
            }
            _ => {}
        }
        self.pos += 1;
    }
}
