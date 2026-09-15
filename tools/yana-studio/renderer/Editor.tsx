import { useEffect, useRef } from "react";
import { EditorView, basicSetup, minimalSetup } from "codemirror";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";

function languageFor(filename: string) {
  const extension = filename.toLowerCase().match(/(\.[^.]+)$/)?.[1] || "";

  if (/\.[cm]?[jt]sx?$/.test(filename))
    return javascript({ typescript: true, jsx: true });
  if ([".rs"].includes(extension)) return rust();
  if ([".json", ".jsonc"].includes(extension)) return json();
  if ([".css", ".scss", ".less"].includes(extension)) return css();
  if ([".html", ".htm", ".svg", ".xml"].includes(extension)) return html();
  if ([".md", ".mdx"].includes(extension)) return markdown();
  if ([".yaml", ".yml"].includes(extension)) return yaml();
  if ([".py", ".pyi"].includes(extension)) return python();
  if ([".sh", ".bash", ".zsh", ".fish"].includes(extension))
    return StreamLanguage.define(shell);
  return null;
}

export function Editor({
  initial,
  filename,
  optimized,
  readOnly,
  onChange,
}: {
  initial: string;
  filename: string;
  optimized: boolean;
  readOnly: boolean;
  onChange: (text: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    if (!host.current) return;
    const language = optimized ? null : languageFor(filename);
    const editor = new EditorView({
      doc: initial,
      parent: host.current,
      extensions: [
        optimized ? minimalSetup : basicSetup,
        ...(language ? [language] : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) change.current(update.state.doc.toString());
        }),
        EditorView.editable.of(!readOnly),
        EditorView.theme({
          "&": {
            height: "100%",
            fontSize: "13px",
            color: "var(--editor-foreground)",
            backgroundColor: "var(--editor-background)",
          },
          ".cm-scroller": {
            overflow: "auto",
            fontFamily: "SFMono-Regular, Consolas, monospace",
          },
          ".cm-content": { caretColor: "var(--editor-caret)" },
          ".cm-cursor": { borderLeftColor: "var(--editor-caret)" },
          ".cm-gutters": {
            color: "var(--editor-gutter)",
            backgroundColor: "var(--editor-gutter-background)",
            borderRight: "1px solid var(--editor-border)",
          },
          ".cm-activeLine, .cm-activeLineGutter": {
            backgroundColor: "var(--editor-active-line)",
          },
          "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
            backgroundColor: "var(--editor-selection) !important",
          },
        }),
      ],
    });
    return () => editor.destroy();
  }, [filename, optimized, readOnly]);
  return <div className="editor-host" ref={host} />;
}
