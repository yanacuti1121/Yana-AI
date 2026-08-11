//! Unicode-safe multiline editor state for the terminal composer.

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TextInput {
    value: String,
    cursor: usize,
}

impl TextInput {
    pub fn new(value: impl Into<String>) -> Self {
        let value = value.into();
        let cursor = value.chars().count();
        Self { value, cursor }
    }

    pub fn as_str(&self) -> &str {
        &self.value
    }

    pub fn is_empty(&self) -> bool {
        self.value.is_empty()
    }

    pub fn cursor(&self) -> usize {
        self.cursor
    }

    pub fn take_trimmed(&mut self) -> String {
        let text = self.value.trim().to_string();
        self.clear();
        text
    }

    pub fn clear(&mut self) {
        self.value.clear();
        self.cursor = 0;
    }

    pub fn set(&mut self, value: impl Into<String>) {
        *self = Self::new(value);
    }

    pub fn insert(&mut self, character: char) {
        let byte = self.byte_index();
        self.value.insert(byte, character);
        self.cursor += 1;
    }

    pub fn insert_str(&mut self, text: &str) {
        let byte = self.byte_index();
        self.value.insert_str(byte, text);
        self.cursor += text.chars().count();
    }

    pub fn backspace(&mut self) {
        if self.cursor == 0 {
            return;
        }
        let end = self.byte_index();
        self.cursor -= 1;
        let start = self.byte_index();
        self.value.replace_range(start..end, "");
    }

    pub fn delete(&mut self) {
        if self.cursor >= self.value.chars().count() {
            return;
        }
        let start = self.byte_index();
        self.cursor += 1;
        let end = self.byte_index();
        self.cursor -= 1;
        self.value.replace_range(start..end, "");
    }

    pub fn move_left(&mut self) {
        self.cursor = self.cursor.saturating_sub(1);
    }

    pub fn move_right(&mut self) {
        self.cursor = (self.cursor + 1).min(self.value.chars().count());
    }

    pub fn move_home(&mut self) {
        let before: String = self.value.chars().take(self.cursor).collect();
        self.cursor = before
            .rfind('\n')
            .map_or(0, |index| before[..=index].chars().count());
    }

    pub fn move_end(&mut self) {
        let after: String = self.value.chars().skip(self.cursor).collect();
        self.cursor += after.find('\n').map_or_else(
            || after.chars().count(),
            |index| after[..index].chars().count(),
        );
    }

    pub fn move_word_left(&mut self) {
        let chars: Vec<char> = self.value.chars().collect();
        while self.cursor > 0 && chars[self.cursor - 1].is_whitespace() {
            self.cursor -= 1;
        }
        while self.cursor > 0 && !chars[self.cursor - 1].is_whitespace() {
            self.cursor -= 1;
        }
    }

    pub fn move_word_right(&mut self) {
        let chars: Vec<char> = self.value.chars().collect();
        while self.cursor < chars.len() && !chars[self.cursor].is_whitespace() {
            self.cursor += 1;
        }
        while self.cursor < chars.len() && chars[self.cursor].is_whitespace() {
            self.cursor += 1;
        }
    }

    pub fn visual_cursor(&self) -> (u16, u16) {
        let before: String = self.value.chars().take(self.cursor).collect();
        let row = before
            .chars()
            .filter(|character| *character == '\n')
            .count() as u16;
        let column = before
            .rsplit('\n')
            .next()
            .unwrap_or_default()
            .chars()
            .count() as u16;
        (column, row)
    }

    pub fn line_count(&self) -> u16 {
        self.value
            .chars()
            .filter(|character| *character == '\n')
            .count() as u16
            + 1
    }

    fn byte_index(&self) -> usize {
        self.value
            .char_indices()
            .nth(self.cursor)
            .map_or(self.value.len(), |(index, _)| index)
    }
}

#[cfg(test)]
mod tests {
    use super::TextInput;

    #[test]
    fn edits_unicode_without_splitting_codepoints() {
        let mut input = TextInput::new("Việt Nam 한국 🌿");
        input.move_word_left();
        input.backspace();
        input.insert('나');
        assert_eq!(input.as_str(), "Việt Nam 한국나🌿");
    }

    #[test]
    fn supports_multiline_home_end_and_cursor_position() {
        let mut input = TextInput::new("first\nsecond");
        input.move_home();
        assert_eq!(input.cursor(), 6);
        input.move_right();
        input.move_end();
        assert_eq!(input.visual_cursor(), (6, 1));
        assert_eq!(input.line_count(), 2);
    }
}
