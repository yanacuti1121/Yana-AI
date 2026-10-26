//! Here-documents: reading the delimiter after `<<` and the body lines after the next newline.

use super::Scanner;

impl Scanner {
    pub(super) fn heredoc_delimiter(&mut self, dash: bool) {
        while self.peek(0).is_some_and(|c| c == ' ' || c == '\t') {
            self.pos += 1;
        }
        let mut delimiter = String::new();
        while let Some(c) = self
            .peek(0)
            .filter(|c| !c.is_whitespace() && !matches!(c, ';' | '|' | '&' | ')'))
        {
            self.pos += 1;
            if !matches!(c, '\'' | '"' | '\\') {
                delimiter.push(c);
            }
        }
        if delimiter.is_empty() || delimiter.starts_with(|c: char| c.is_ascii_digit()) {
            return; // `1<<2`, `let x=1<<2`: a shift, not a here-document
        }
        // The command is pushed to `out` when its line ends; remember where it will be.
        self.heredocs
            .push((delimiter, dash, self.out.len(), self.pipeline.len()));
    }

    /// After a newline: reads here-document bodies and attaches each to the command that declared it.
    pub(super) fn read_heredocs(&mut self) {
        for (delimiter, dash, out_index, stage_index) in std::mem::take(&mut self.heredocs) {
            let body = self.heredoc_body(&delimiter, dash);
            if let Some(stage) = self
                .out
                .get_mut(out_index)
                .and_then(|pipeline| pipeline.get_mut(stage_index))
            {
                stage.heredoc = Some(body);
            }
        }
    }

    fn heredoc_body(&mut self, delimiter: &str, dash: bool) -> String {
        let mut body = String::new();
        let start = self.pos;
        while self.pos < self.chars.len() {
            let end = self.chars[self.pos..]
                .iter()
                .position(|&c| c == '\n')
                .map_or(self.chars.len(), |n| self.pos + n);
            let line: String = self.chars[self.pos..end].iter().collect();
            self.pos = (end + 1).min(self.chars.len());
            let compare = if dash {
                line.trim_start_matches('\t')
            } else {
                line.as_str()
            };
            if compare == delimiter {
                return body;
            }
            body.push_str(&line);
            body.push('\n');
        }
        // No closing line: it was not a here-document (`[[ a << b ]]`). Read the lines as commands.
        self.pos = start;
        String::new()
    }
}
