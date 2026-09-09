import { useEffect, useRef } from "react";
import { EditorView, basicSetup, minimalSetup } from "codemirror";
import { javascript } from "@codemirror/lang-javascript";

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
    const editor = new EditorView({
      doc: initial,
      parent: host.current,
      extensions: [
        optimized ? minimalSetup : basicSetup,
        ...(!optimized && /\.[cm]?[jt]sx?$/.test(filename)
          ? [javascript({ typescript: true, jsx: true })]
          : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) change.current(update.state.doc.toString());
        }),
        EditorView.editable.of(!readOnly),
        EditorView.theme({
          "&": {
            height: "100%",
            fontSize: "13px",
            color: "#3d4248",
            backgroundColor: "#fffefa",
          },
          ".cm-scroller": {
            overflow: "auto",
            fontFamily: "SFMono-Regular, Consolas, monospace",
          },
          ".cm-content": { caretColor: "#a95070" },
          ".cm-cursor": { borderLeftColor: "#a95070" },
          ".cm-gutters": {
            color: "#aaa49d",
            backgroundColor: "#f7f5f1",
            borderRight: "1px solid #ebe7e2",
          },
          ".cm-activeLine, .cm-activeLineGutter": {
            backgroundColor: "#f8edf1",
          },
          "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
            backgroundColor: "#edd6df !important",
          },
        }),
      ],
    });
    return () => editor.destroy();
  }, [filename, optimized, readOnly]);
  return <div className="editor-host" ref={host} />;
}
