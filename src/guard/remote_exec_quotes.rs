//! Quote, substitution, redirection and here-document scanning for `remote_exec_parse`.

use super::{Scanner, PROCSUB_MARK, SUBST_MARK};

/// `\xHH` takes up to two hex digits; `\NNN` up to three octal digits (the first is the escape character).
const HEX_ESCAPE: (u32, usize) = (16, 2);
const OCTAL_ESCAPE: (u32, usize) = (8, 3);
/// The longest run of redirection symbols read as one operator (`<<<`, `<<-`).
const MAX_OPERATOR_SYMBOLS: usize = 3;

impl Scanner {
    pub(super) fn single_quote(&mut self) {
        let start = self.pos;
        self.pos += 1;
        let mut text = String::new();
        while let Some(c) = self.peek(0) {
            self.pos += 1;
            if c == '\'' {
                self.in_word = true;
                self.word.push_str(&text);
                return;
            }
            text.push(c);
        }
        self.unterminated(start);
    }

    pub(super) fn double_quote(&mut self) {
        let start = self.pos;
        self.pos += 1;
        let mut text = String::new();
        while let Some(c) = self.peek(0) {
            match c {
                '"' => {
                    self.pos += 1;
                    self.in_word = true;
                    self.word.push_str(&text);
                    return;
                }
                '\\' => {
                    let next = self.peek(1).unwrap_or('\\');
                    if !['"', '\\', '$', '`'].contains(&next) {
                        text.push('\\');
                    }
                    text.push(next);
                    self.pos += 2;
                }
                '$' if self.peek(1) == Some('(') => text.push(self.substitution()),
                '`' => text.push(self.backtick_body()),
                _ => {
                    text.push(c);
                    self.pos += 1;
                }
            }
        }
        self.unterminated(start);
    }

    /// Fail closed: an opening quote with no partner is a literal character, and the text after it is
    /// scanned as ordinary command text.
    pub(super) fn unterminated(&mut self, start: usize) {
        let quote = self.chars[start];
        self.pos = start + 1;
        self.push(quote);
    }

    pub(super) fn dollar(&mut self) {
        match self.peek(1) {
            Some('(') => {
                let marker = self.substitution();
                self.push(marker);
            }
            Some('\'') => self.ansi_c(),
            _ => {
                self.push('$');
                self.pos += 1;
            }
        }
    }

    /// `$'...'`: backslash escapes are decoded (so `$'b\x61sh'` reads as `bash`).
    fn ansi_c(&mut self) {
        let start = self.pos;
        self.pos += 2;
        let mut text = String::new();
        while let Some(c) = self.peek(0) {
            self.pos += 1;
            match c {
                '\'' => {
                    self.in_word = true;
                    self.word.push_str(&text);
                    return;
                }
                '\\' => {
                    let escaped = self.peek(0).unwrap_or('\\');
                    self.pos += 1;
                    self.stage.ansi_c = true;
                    text.push(self.decode_escape(escaped));
                }
                _ => text.push(c),
            }
        }
        self.unterminated(start);
    }

    fn decode_escape(&mut self, first: char) -> char {
        let (radix, max) = match first {
            'x' => HEX_ESCAPE,
            '0'..='7' => OCTAL_ESCAPE,
            'n' => return '\n',
            't' => return '\t',
            _ => return first,
        };
        let mut digits = String::new();
        if radix == OCTAL_ESCAPE.0 {
            digits.push(first);
        }
        while digits.len() < max {
            match self.peek(0) {
                Some(d) if d.is_digit(radix) => {
                    digits.push(d);
                    self.pos += 1;
                }
                _ => break,
            }
        }
        u32::from_str_radix(&digits, radix)
            .ok()
            .and_then(char::from_u32)
            .unwrap_or('?')
    }

    /// Reads `$( ... )`, records the body and returns the marker that stands for it in a word.
    fn substitution(&mut self) -> char {
        self.pos += 2;
        let body = self.balanced_parens();
        self.stage.subs.push(body);
        SUBST_MARK
    }

    pub(super) fn backtick(&mut self) {
        let marker = self.backtick_body();
        self.push(marker);
    }

    fn backtick_body(&mut self) -> char {
        self.pos += 1;
        let mut body = String::new();
        while let Some(c) = self.peek(0) {
            self.pos += 1;
            if c == '`' {
                break;
            }
            body.push(c);
        }
        self.stage.subs.push(body);
        SUBST_MARK
    }

    /// Text up to the `)` that closes an already-opened `(`, following quotes and nested parentheses.
    fn balanced_parens(&mut self) -> String {
        let mut depth = 1;
        let mut body = String::new();
        while let Some(c) = self.peek(0) {
            self.pos += 1;
            match c {
                '(' => depth += 1,
                ')' => depth -= 1,
                '\'' | '"' => {
                    self.copy_quoted(c, &mut body);
                    continue;
                }
                _ => {}
            }
            if depth == 0 {
                break;
            }
            body.push(c);
        }
        body
    }

    /// Copies a quoted span (opening quote already read) to `body`, escapes inside double quotes included.
    fn copy_quoted(&mut self, quote: char, body: &mut String) {
        body.push(quote);
        while let Some(inner) = self.peek(0) {
            self.pos += 1;
            body.push(inner);
            if inner == quote {
                return;
            }
            if inner == '\\' && quote == '"' {
                if let Some(escaped) = self.peek(0) {
                    self.pos += 1;
                    body.push(escaped);
                }
            }
        }
    }

    /// `<`, `>`, `<<`, `<<-`, `<<<`, `>>`, `>&`, `&>` and process substitution `<( )` / `>( )`.
    pub(super) fn redirect(&mut self) {
        if self.peek(1) == Some('(') {
            self.end_word(); // `bash<(curl x)`: the name ends where the substitution starts
            return self.process_substitution();
        }
        if self.in_word && self.word.chars().all(|c| c.is_ascii_digit()) {
            self.word.clear(); // the file descriptor in `2>`
            self.in_word = false;
        } else {
            self.end_word();
        }
        let mut symbols = String::new();
        while let Some(c) = self.peek(0).filter(|c| matches!(c, '<' | '>' | '&' | '-')) {
            symbols.push(c);
            self.pos += 1;
            if symbols.len() >= MAX_OPERATOR_SYMBOLS {
                break;
            }
        }
        match symbols.as_str() {
            "<<" | "<<-" => self.heredoc_delimiter(symbols.len() == MAX_OPERATOR_SYMBOLS),
            "<<<" => self.here_string = true,
            s if s.ends_with('&') => {
                // `2>&1`, `>&-`: a file-descriptor target, no word follows
                while self.peek(0).is_some_and(|c| c.is_ascii_digit() || c == '-') {
                    self.pos += 1;
                }
            }
            _ => self.skip_next_word = true,
        }
    }

    fn process_substitution(&mut self) {
        let output = self.peek(0) == Some('>');
        self.pos += 2;
        let body = self.balanced_parens();
        // `prog < <(cmd)` feeds cmd's output to prog's stdin as data; `bash <(cmd)` runs it as a script.
        if output {
            self.stage.sinks.push(body); // `tee >(bash)`: the body reads what this command writes
        } else if self.skip_next_word {
            self.stage.subs.push(body);
        } else {
            self.stage.procs.push(body);
        }
        self.push(PROCSUB_MARK);
    }
}
