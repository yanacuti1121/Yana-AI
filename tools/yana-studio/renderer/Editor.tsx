import { useEffect, useRef } from "react";
import { EditorView, basicSetup, minimalSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
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
        oneDark,
        ...(!optimized && /\.[cm]?[jt]sx?$/.test(filename)
          ? [javascript({ typescript: true, jsx: true })]
          : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) change.current(update.state.doc.toString());
        }),
        EditorView.editable.of(!readOnly),
        EditorView.theme({
          "&": { height: "100%", fontSize: "13px" },
          ".cm-scroller": {
            overflow: "auto",
            fontFamily: "SFMono-Regular, Consolas, monospace",
          },
        }),
      ],
    });
    return () => editor.destroy();
  }, [filename, optimized, readOnly]);
  return <div className="editor-host" ref={host} />;
}
