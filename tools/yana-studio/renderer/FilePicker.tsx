import { useEffect, useRef, useState } from "react";
import { FileCode2, Search } from "lucide-react";
import type { FileEntry } from "./types";

// Shared file-search modal — backs both the ⌘P quick-open (pick to open in
// the editor) and the composer's attach-file picker (pick to attach as
// context). Reuses the same searchFiles/listFiles IPC the sidebar file
// search already calls; this only adds a keyboard-navigable modal shell
// around it, matching phasr's Cmd+P pattern (MIT, see feature-gap report).
export function FilePicker({
  root,
  title,
  onPick,
  onClose,
}: {
  root: string;
  title: string;
  onPick: (entry: FileEntry) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FileEntry[]>([]);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const found = query.trim()
        ? await window.studio.searchFiles(root, query.trim(), 30)
        : (await window.studio.listFiles(root, "", { limit: 30 })).entries;
      if (active) {
        setResults(found.filter((entry) => !entry.directory));
        setIndex(0);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [root, query]);

  const pick = (entry: FileEntry | undefined) => {
    if (entry) onPick(entry);
  };

  return (
    <div className="file-picker-backdrop" onClick={onClose}>
      <div className="file-picker" onClick={(event) => event.stopPropagation()}>
        <div className="file-picker-header">
          <Search size={14} />
          <input
            ref={inputRef}
            value={query}
            placeholder={title}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              else if (event.key === "ArrowDown") {
                event.preventDefault();
                setIndex((value) => Math.min(value + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setIndex((value) => Math.max(value - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                pick(results[index]);
              }
            }}
          />
        </div>
        <div className="file-picker-list">
          {results.length === 0 ? (
            <p className="empty-small">Không tìm thấy file nào.</p>
          ) : (
            results.map((entry, position) => (
              <button
                key={entry.path}
                className={position === index ? "active" : ""}
                onMouseEnter={() => setIndex(position)}
                onClick={() => pick(entry)}
              >
                <FileCode2 size={14} />
                <span>{entry.path}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
