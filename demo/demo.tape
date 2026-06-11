# YAMTAM ENGINE — vhs tape (github.com/charmbracelet/vhs)
# Regenerate the README demo GIF deterministically:
#   vhs demo/demo.tape          (run from the repo root)
# Output lands at docs/demo.gif — same path the README references.

Output docs/demo.gif

Set Shell bash
Set FontSize 16
Set Width 864
Set Height 576
Set Padding 12
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms

Hide
Type "clear"
Enter
Show

Type "bash demo/demo.sh"
Enter
# demo.sh paces itself with sleeps — total runtime ≈ 22s
Sleep 24s
