import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  Image,
  Layers3,
  LayoutTemplate,
  Minus,
  Monitor,
  Navigation,
  PanelTop,
  Plus,
  Redo2,
  RefreshCw,
  Send,
  Smartphone,
  Square,
  Tag,
  TextCursorInput,
  ToggleLeft,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import type { CanvasDocument } from "./types";
import "./design-canvas.css";

type CanvasPart = CanvasDocument["screens"][number]["parts"][number];
type PartKind = CanvasPart["kind"];

const PART_LIBRARY: Array<{
  kind: PartKind;
  label: string;
  width: number;
  height: number;
  icon: typeof Square;
}> = [
  { kind: "button", label: "Button", width: 132, height: 44, icon: Square },
  { kind: "text", label: "Heading", width: 240, height: 46, icon: Type },
  {
    kind: "input",
    label: "Text field",
    width: 250,
    height: 52,
    icon: TextCursorInput,
  },
  {
    kind: "card",
    label: "Content card",
    width: 260,
    height: 150,
    icon: LayoutTemplate,
  },
  { kind: "tabs", label: "Tabs", width: 280, height: 44, icon: PanelTop },
  { kind: "nav", label: "App bar", width: 300, height: 58, icon: Navigation },
  { kind: "chip", label: "Chip", width: 94, height: 34, icon: Tag },
  { kind: "image", label: "Image", width: 240, height: 150, icon: Image },
  { kind: "divider", label: "Divider", width: 260, height: 8, icon: Minus },
  { kind: "switch", label: "Switch", width: 150, height: 38, icon: ToggleLeft },
];

const copy = <Value,>(value: Value): Value => structuredClone(value);
const createId = () => crypto.randomUUID();

function createDocument(): CanvasDocument {
  return {
    version: 1,
    name: "Yana app concept",
    theme: {
      accent: "#b55d7a",
      surface: "#fffaf4",
      foreground: "#36322f",
      shape: "rounded",
      font: "system",
      motion: "standard",
    },
    screens: [
      {
        id: createId(),
        name: "Home",
        device: "desktop",
        background: "#f7f3ed",
        parts: [],
      },
    ],
  };
}

function promptFor(document: CanvasDocument, themeFromProject: boolean) {
  const theme = document.theme;
  const screens = document.screens.map((screen) => {
    const parts = screen.parts.length
      ? screen.parts
          .map(
            (part) =>
              "- " +
              part.kind +
              ': "' +
              part.label +
              '" at (' +
              Math.round(part.x) +
              ", " +
              Math.round(part.y) +
              "), size " +
              Math.round(part.width) +
              "×" +
              Math.round(part.height),
          )
          .join("\n")
      : "- Empty screen";
    return (
      "Screen " +
      screen.name +
      " (" +
      screen.device +
      ", background " +
      screen.background +
      "):\n" +
      parts
    );
  });
  return [
    "Build the following interface inside the current project.",
    "Design: " + document.name,
    "Theme: accent " +
      theme.accent +
      ", surface " +
      theme.surface +
      ", foreground " +
      theme.foreground +
      ", " +
      theme.shape +
      " shapes, " +
      theme.font +
      " font, " +
      theme.motion +
      " motion." +
      (themeFromProject
        ? " These colors were read from this project's own CSS — match the existing design system exactly, don't invent a new palette."
        : ""),
    ...screens,
    "Keep the implementation responsive, accessible and consistent with the existing project architecture.",
  ].join("\n\n");
}

function PartPreview({ part, accent }: { part: CanvasPart; accent: string }) {
  if (part.kind === "text") return <strong>{part.label}</strong>;
  if (part.kind === "input")
    return <span className="canvas-input-preview">{part.label}</span>;
  if (part.kind === "card")
    return (
      <span className="canvas-card-preview">
        <b>{part.label}</b>
        <i />
        <i />
      </span>
    );
  if (part.kind === "tabs")
    return (
      <span className="canvas-tabs-preview">
        <b>{part.label}</b>
        <span>Details</span>
        <span>More</span>
      </span>
    );
  if (part.kind === "nav")
    return (
      <span className="canvas-nav-preview">
        <b>{part.label}</b>
        <span>•••</span>
      </span>
    );
  if (part.kind === "chip") return <span>{part.label}</span>;
  if (part.kind === "image")
    return (
      <span className="canvas-image-preview">
        <Image size={24} />
        <small>{part.label}</small>
      </span>
    );
  if (part.kind === "divider")
    return <span className="canvas-divider-preview" />;
  if (part.kind === "switch")
    return (
      <span className="canvas-switch-preview">
        {part.label}
        <i style={{ background: accent }} />
      </span>
    );
  return <span>{part.label}</span>;
}

export function DesignCanvas({
  root,
  onPrompt,
  onError,
}: {
  root: string;
  onPrompt: (prompt: string) => void;
  onError: (message: string) => void;
}) {
  const [document, setDocument] = useState<CanvasDocument>(createDocument);
  const [loadedRoot, setLoadedRoot] = useState("");
  const [screenId, setScreenId] = useState("");
  const [partId, setPartId] = useState("");
  const [past, setPast] = useState<CanvasDocument[]>([]);
  const [future, setFuture] = useState<CanvasDocument[]>([]);
  const [preview, setPreview] = useState(false);
  // Session-only, never persisted with the document (Design Canvas's saved
  // schema stays untouched) — just tracks whether *this* session pulled the
  // theme from the project's own CSS, so promptFor() can say so.
  const [tokensFromProject, setTokensFromProject] = useState(false);
  const [syncingTokens, setSyncingTokens] = useState(false);
  const latestDocument = useRef(document);
  const loadedRootRef = useRef("");
  const drag = useRef<{
    id: string;
    pointerX: number;
    pointerY: number;
    x: number;
    y: number;
  } | null>(null);
  const activeScreen =
    document.screens.find((screen) => screen.id === screenId) ||
    document.screens[0];
  const selectedPart = activeScreen?.parts.find((part) => part.id === partId);
  const screenWidth = activeScreen?.device === "phone" ? 360 : 900;
  const screenHeight = activeScreen?.device === "phone" ? 720 : 560;

  useEffect(() => {
    latestDocument.current = document;
  }, [document]);

  useEffect(() => {
    if (!root) return;
    setLoadedRoot("");
    window.studio
      .designCanvasLoad(root)
      .then((saved) => {
        const next = saved || createDocument();
        setDocument(next);
        setScreenId(next.screens[0].id);
        setPartId("");
        setPast([]);
        setFuture([]);
        loadedRootRef.current = root;
        setLoadedRoot(root);
      })
      .catch((error) => onError(String(error)));
  }, [root]);

  useEffect(
    () => () => {
      if (root && loadedRootRef.current === root)
        void window.studio
          .designCanvasSave(root, latestDocument.current)
          .catch((error) => onError(String(error)));
    },
    [root],
  );

  useEffect(() => {
    if (!root || loadedRoot !== root) return;
    const timer = window.setTimeout(() => {
      void window.studio
        .designCanvasSave(root, document)
        .catch((error) => onError(String(error)));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [document, loadedRoot, root]);

  const commit = (update: (current: CanvasDocument) => CanvasDocument) => {
    setDocument((current) => {
      setPast((items) => [...items.slice(-49), copy(current)]);
      setFuture([]);
      return update(copy(current));
    });
  };
  const syncProjectTokens = async () => {
    if (!root || syncingTokens) return;
    setSyncingTokens(true);
    try {
      const found = await window.studio.scanDesignTokens(root);
      if (!found.accent && !found.surface && !found.foreground) {
        onError(
          "Không tìm thấy design token nào trong project (CSS custom properties kiểu --accent, --background, --foreground).",
        );
        return;
      }
      commit((next) => ({
        ...next,
        theme: {
          ...next.theme,
          accent: found.accent?.value || next.theme.accent,
          surface: found.surface?.value || next.theme.surface,
          foreground: found.foreground?.value || next.theme.foreground,
        },
      }));
      setTokensFromProject(true);
    } catch (error) {
      onError(String(error));
    } finally {
      setSyncingTokens(false);
    }
  };
  const updateScreen = (
    update: (screen: CanvasDocument["screens"][number]) => void,
  ) =>
    commit((next) => {
      const screen = next.screens.find((item) => item.id === activeScreen.id);
      if (screen) update(screen);
      return next;
    });
  const addPart = (kind: PartKind, x?: number, y?: number) => {
    const definition = PART_LIBRARY.find((item) => item.kind === kind);
    if (!definition || !activeScreen) return;
    const nextPart: CanvasPart = {
      id: createId(),
      kind,
      label: definition.label,
      x: Math.max(12, x ?? (screenWidth - definition.width) / 2),
      y: Math.max(12, y ?? (screenHeight - definition.height) / 2),
      width: definition.width,
      height: definition.height,
    };
    updateScreen((screen) => screen.parts.push(nextPart));
    setPartId(nextPart.id);
  };
  const updatePart = (patch: Partial<CanvasPart>) =>
    updateScreen((screen) => {
      const part = screen.parts.find((item) => item.id === partId);
      if (part) Object.assign(part, patch);
    });
  const deletePart = () => {
    updateScreen((screen) => {
      screen.parts = screen.parts.filter((part) => part.id !== partId);
    });
    setPartId("");
  };
  const moveLayer = (direction: -1 | 1) =>
    updateScreen((screen) => {
      const index = screen.parts.findIndex((part) => part.id === partId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= screen.parts.length) return;
      [screen.parts[index], screen.parts[target]] = [
        screen.parts[target],
        screen.parts[index],
      ];
    });
  const undo = () =>
    setPast((items) => {
      const previous = items.at(-1);
      if (!previous) return items;
      setFuture((entries) => [copy(document), ...entries].slice(0, 50));
      setDocument(previous);
      return items.slice(0, -1);
    });
  const redo = () =>
    setFuture((items) => {
      const next = items[0];
      if (!next) return items;
      setPast((entries) => [...entries.slice(-49), copy(document)]);
      setDocument(next);
      return items.slice(1);
    });
  const generatedPrompt = useMemo(
    () => promptFor(document, tokensFromProject),
    [document, tokensFromProject],
  );

  if (!root)
    return (
      <div className="canvas-empty">
        <LayoutTemplate size={30} />
        <h2>Mở project để bắt đầu thiết kế</h2>
        <p>Canvas được lưu cùng workspace và backup của Yana Studio.</p>
      </div>
    );

  return (
    <div className="design-canvas">
      <header className="canvas-toolbar">
        <div>
          <span className="eyebrow">YANA DESIGN</span>
          <input
            aria-label="Tên thiết kế"
            value={document.name}
            onChange={(event) =>
              commit((next) => ({ ...next, name: event.target.value }))
            }
          />
        </div>
        <nav>
          <button aria-label="Hoàn tác" disabled={!past.length} onClick={undo}>
            <Undo2 size={14} />
          </button>
          <button aria-label="Làm lại" disabled={!future.length} onClick={redo}>
            <Redo2 size={14} />
          </button>
          <button onClick={() => setPreview(true)}>
            <Eye size={14} /> Xem thử
          </button>
          <button
            onClick={() =>
              void navigator.clipboard
                .writeText(generatedPrompt)
                .catch(() => onError("Không thể sao chép prompt."))
            }
          >
            <Copy size={14} /> Prompt
          </button>
          <button className="primary" onClick={() => onPrompt(generatedPrompt)}>
            <Send size={14} /> Gửi sang Yana
          </button>
        </nav>
      </header>
      <div className="canvas-layout">
        <aside className="canvas-palette">
          <div className="section-label">THÀNH PHẦN</div>
          <div className="canvas-part-grid">
            {PART_LIBRARY.map((definition) => (
              <button
                key={definition.kind}
                draggable
                onDragStart={(event) =>
                  event.dataTransfer.setData(
                    "application/x-yana-part",
                    definition.kind,
                  )
                }
                onClick={() => addPart(definition.kind)}
              >
                <definition.icon size={17} />
                <span>{definition.label}</span>
              </button>
            ))}
          </div>
          <div className="section-label">MÀN HÌNH</div>
          <div className="canvas-screen-list">
            {document.screens.map((screen) => (
              <button
                key={screen.id}
                className={screen.id === activeScreen.id ? "selected" : ""}
                onClick={() => {
                  setScreenId(screen.id);
                  setPartId("");
                }}
              >
                {screen.device === "phone" ? (
                  <Smartphone size={15} />
                ) : (
                  <Monitor size={15} />
                )}
                <span>{screen.name}</span>
                <small>{screen.parts.length}</small>
              </button>
            ))}
            <button
              onClick={() => {
                const screen = {
                  id: createId(),
                  name: "Screen " + (document.screens.length + 1),
                  device: "phone" as const,
                  background: "#f7f3ed",
                  parts: [],
                };
                commit((next) => ({
                  ...next,
                  screens: [...next.screens, screen],
                }));
                setScreenId(screen.id);
              }}
            >
              <Plus size={15} /> Thêm màn hình
            </button>
          </div>
        </aside>
        <main className="canvas-stage">
          <div className="canvas-stage-meta">
            <input
              aria-label="Tên màn hình"
              value={activeScreen.name}
              onChange={(event) =>
                updateScreen((screen) => {
                  screen.name = event.target.value;
                })
              }
            />
            <div>
              <button
                className={activeScreen.device === "desktop" ? "active" : ""}
                onClick={() =>
                  updateScreen((screen) => {
                    screen.device = "desktop";
                  })
                }
              >
                <Monitor size={14} /> Desktop
              </button>
              <button
                className={activeScreen.device === "phone" ? "active" : ""}
                onClick={() =>
                  updateScreen((screen) => {
                    screen.device = "phone";
                  })
                }
              >
                <Smartphone size={14} /> Phone
              </button>
            </div>
          </div>
          <div className="canvas-scroll">
            <div
              className={
                "canvas-screen canvas-screen-" +
                activeScreen.device +
                " shape-" +
                document.theme.shape
              }
              style={{
                width: screenWidth,
                height: screenHeight,
                background: activeScreen.background,
                color: document.theme.foreground,
                fontFamily:
                  document.theme.font === "serif"
                    ? "Georgia, serif"
                    : document.theme.font === "mono"
                      ? "ui-monospace, monospace"
                      : "Inter, system-ui, sans-serif",
                ["--canvas-accent" as string]: document.theme.accent,
                ["--canvas-surface" as string]: document.theme.surface,
              }}
              onClick={() => setPartId("")}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const kind = event.dataTransfer.getData(
                  "application/x-yana-part",
                ) as PartKind;
                const bounds = event.currentTarget.getBoundingClientRect();
                addPart(
                  kind,
                  event.clientX - bounds.left,
                  event.clientY - bounds.top,
                );
              }}
            >
              {activeScreen.parts.map((part) => (
                <div
                  key={part.id}
                  className={
                    "canvas-part kind-" +
                    part.kind +
                    (part.id === partId ? " selected" : "")
                  }
                  style={{
                    left: part.x,
                    top: part.y,
                    width: part.width,
                    height: part.height,
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPartId(part.id);
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setPast((items) => [...items.slice(-49), copy(document)]);
                    setFuture([]);
                    drag.current = {
                      id: part.id,
                      pointerX: event.clientX,
                      pointerY: event.clientY,
                      x: part.x,
                      y: part.y,
                    };
                  }}
                  onPointerMove={(event) => {
                    if (!drag.current || drag.current.id !== part.id) return;
                    const nextX = Math.max(
                      0,
                      Math.min(
                        screenWidth - part.width,
                        drag.current.x + event.clientX - drag.current.pointerX,
                      ),
                    );
                    const nextY = Math.max(
                      0,
                      Math.min(
                        screenHeight - part.height,
                        drag.current.y + event.clientY - drag.current.pointerY,
                      ),
                    );
                    setDocument((current) => {
                      const next = copy(current);
                      const screen = next.screens.find(
                        (entry) => entry.id === activeScreen.id,
                      );
                      const target = screen?.parts.find(
                        (entry) => entry.id === part.id,
                      );
                      if (target) {
                        target.x = Math.round(nextX / 4) * 4;
                        target.y = Math.round(nextY / 4) * 4;
                      }
                      return next;
                    });
                  }}
                  onPointerUp={() => {
                    drag.current = null;
                  }}
                >
                  <PartPreview part={part} accent={document.theme.accent} />
                </div>
              ))}
            </div>
          </div>
        </main>
        <aside className="canvas-inspector">
          <div className="section-label">
            <Layers3 size={13} /> LAYERS
          </div>
          <div className="canvas-layers">
            {[...activeScreen.parts].reverse().map((part) => (
              <button
                key={part.id}
                className={part.id === partId ? "selected" : ""}
                onClick={() => setPartId(part.id)}
              >
                <span>{part.label}</span>
                <small>{part.kind}</small>
              </button>
            ))}
          </div>
          {selectedPart ? (
            <section className="canvas-properties">
              <div className="section-label">THUỘC TÍNH</div>
              <label>
                Nội dung
                <input
                  value={selectedPart.label}
                  onChange={(event) =>
                    updatePart({ label: event.target.value })
                  }
                />
              </label>
              <div className="canvas-number-grid">
                {(["x", "y", "width", "height"] as const).map((field) => (
                  <label key={field}>
                    {field.toUpperCase()}
                    <input
                      type="number"
                      min={field === "width" ? 20 : field === "height" ? 8 : 0}
                      value={Math.round(selectedPart[field])}
                      onChange={(event) =>
                        updatePart({
                          [field]: Math.max(
                            field === "width" ? 20 : field === "height" ? 8 : 0,
                            Number(event.target.value),
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="button-row">
                <button onClick={() => moveLayer(1)} title="Đưa lên">
                  <ChevronUp size={14} />
                </button>
                <button onClick={() => moveLayer(-1)} title="Đưa xuống">
                  <ChevronDown size={14} />
                </button>
                <button className="danger-button" onClick={deletePart}>
                  <Trash2 size={14} /> Xóa
                </button>
              </div>
            </section>
          ) : (
            <section className="canvas-properties">
              <div className="section-label">THEME</div>
              <button
                className="sync-project-theme"
                disabled={!root || syncingTokens}
                onClick={() => void syncProjectTokens()}
                title="Đọc màu accent/nền/chữ từ CSS thật của project"
              >
                <RefreshCw size={13} />
                {syncingTokens ? "Đang đọc…" : "Đồng bộ theme từ project"}
              </button>
              {tokensFromProject && (
                <small className="sync-project-theme-hint">
                  Theme này lấy từ CSS thật của project.
                </small>
              )}
              <label>
                Accent
                <input
                  type="color"
                  value={document.theme.accent}
                  onChange={(event) => {
                    setTokensFromProject(false);
                    commit((next) => ({
                      ...next,
                      theme: { ...next.theme, accent: event.target.value },
                    }));
                  }}
                />
              </label>
              <label>
                Surface
                <input
                  type="color"
                  value={document.theme.surface}
                  onChange={(event) => {
                    setTokensFromProject(false);
                    commit((next) => ({
                      ...next,
                      theme: { ...next.theme, surface: event.target.value },
                    }));
                  }}
                />
              </label>
              <label>
                Chữ
                <input
                  type="color"
                  value={document.theme.foreground}
                  onChange={(event) => {
                    setTokensFromProject(false);
                    commit((next) => ({
                      ...next,
                      theme: { ...next.theme, foreground: event.target.value },
                    }));
                  }}
                />
              </label>
              <label>
                Background
                <input
                  type="color"
                  value={activeScreen.background}
                  onChange={(event) =>
                    updateScreen((screen) => {
                      screen.background = event.target.value;
                    })
                  }
                />
              </label>
              <label>
                Bo góc
                <select
                  value={document.theme.shape}
                  onChange={(event) =>
                    commit((next) => ({
                      ...next,
                      theme: {
                        ...next.theme,
                        shape: event.target
                          .value as CanvasDocument["theme"]["shape"],
                      },
                    }))
                  }
                >
                  <option value="compact">Gọn</option>
                  <option value="rounded">Bo nhẹ</option>
                  <option value="pill">Pill</option>
                </select>
              </label>
              <label>
                Font
                <select
                  value={document.theme.font}
                  onChange={(event) =>
                    commit((next) => ({
                      ...next,
                      theme: {
                        ...next.theme,
                        font: event.target
                          .value as CanvasDocument["theme"]["font"],
                      },
                    }))
                  }
                >
                  <option value="system">System</option>
                  <option value="serif">Serif</option>
                  <option value="mono">Mono</option>
                </select>
              </label>
              <label>
                Chuyển động
                <select
                  value={document.theme.motion}
                  onChange={(event) =>
                    commit((next) => ({
                      ...next,
                      theme: {
                        ...next.theme,
                        motion: event.target
                          .value as CanvasDocument["theme"]["motion"],
                      },
                    }))
                  }
                >
                  <option value="standard">Tiêu chuẩn</option>
                  <option value="expressive">Sinh động</option>
                  <option value="reduced">Giảm chuyển động</option>
                </select>
              </label>
            </section>
          )}
        </aside>
      </div>
      {preview && (
        <div
          className="canvas-preview-overlay"
          role="dialog"
          aria-label="Xem thử thiết kế"
        >
          <button
            className="canvas-preview-close"
            aria-label="Đóng xem thử"
            onClick={() => setPreview(false)}
          >
            <X size={18} />
          </button>
          <div
            className={
              "canvas-preview-device shape-" +
              document.theme.shape +
              " canvas-preview-" +
              activeScreen.device
            }
            style={{
              background: activeScreen.background,
              color: document.theme.foreground,
              ["--canvas-accent" as string]: document.theme.accent,
              ["--canvas-surface" as string]: document.theme.surface,
            }}
          >
            {activeScreen.parts.map((part) => (
              <div
                key={part.id}
                className={"canvas-part kind-" + part.kind}
                style={{
                  left: part.x,
                  top: part.y,
                  width: part.width,
                  height: part.height,
                }}
              >
                <PartPreview part={part} accent={document.theme.accent} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
