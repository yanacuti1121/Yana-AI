import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Image,
  Layers3,
  Lock,
  LayoutTemplate,
  Minus,
  Monitor,
  Navigation,
  PanelTop,
  Plus,
  Redo2,
  RefreshCw,
  Send,
  Sparkles,
  Smartphone,
  Square,
  Tag,
  TextCursorInput,
  ToggleLeft,
  Trash2,
  Type,
  Undo2,
  Unlock,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { CanvasAiProposal, CanvasDocument } from "./types";
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
    kind: "textarea",
    label: "Text area",
    width: 260,
    height: 96,
    icon: TextCursorInput,
  },
  {
    kind: "select",
    label: "Select",
    width: 220,
    height: 48,
    icon: ChevronDown,
  },
  {
    kind: "checkbox",
    label: "Checkbox",
    width: 150,
    height: 34,
    icon: Square,
  },
  {
    kind: "radio",
    label: "Radio",
    width: 150,
    height: 34,
    icon: ToggleLeft,
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
  {
    kind: "sidebar",
    label: "Sidebar",
    width: 210,
    height: 420,
    icon: PanelTop,
  },
  {
    kind: "hero",
    label: "Hero",
    width: 620,
    height: 250,
    icon: LayoutTemplate,
  },
  { kind: "chip", label: "Chip", width: 94, height: 34, icon: Tag },
  { kind: "badge", label: "Badge", width: 82, height: 28, icon: Tag },
  { kind: "avatar", label: "Avatar", width: 56, height: 56, icon: Square },
  {
    kind: "search",
    label: "Search",
    width: 260,
    height: 44,
    icon: TextCursorInput,
  },
  { kind: "list", label: "List", width: 260, height: 180, icon: Layers3 },
  {
    kind: "table",
    label: "Table",
    width: 440,
    height: 220,
    icon: LayoutTemplate,
  },
  { kind: "modal", label: "Modal", width: 360, height: 230, icon: Square },
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
          .filter((part) => !part.hidden)
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
              Math.round(part.height) +
              (part.locked ? ", locked" : "") +
              (part.opacity !== undefined
                ? ", opacity " + Math.round(part.opacity * 100) + "%"
                : "") +
              (part.fill ? ", fill " + part.fill : ""),
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
  if (part.kind === "textarea")
    return <span className="canvas-input-preview multiline">{part.label}</span>;
  if (part.kind === "select")
    return (
      <span className="canvas-select-preview">
        {part.label} <ChevronDown size={14} />
      </span>
    );
  if (part.kind === "checkbox" || part.kind === "radio")
    return (
      <span className={`canvas-choice-preview ${part.kind}`}>
        <i /> {part.label}
      </span>
    );
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
  if (part.kind === "sidebar")
    return (
      <span className="canvas-sidebar-preview">
        <b>{part.label}</b>
        <i />
        <i />
        <i />
      </span>
    );
  if (part.kind === "hero")
    return (
      <span className="canvas-hero-preview">
        <small>WELCOME</small>
        <b>{part.label}</b>
        <i>Get started</i>
      </span>
    );
  if (part.kind === "chip" || part.kind === "badge")
    return <span>{part.label}</span>;
  if (part.kind === "avatar")
    return (
      <span className="canvas-avatar-preview">{part.label.slice(0, 1)}</span>
    );
  if (part.kind === "search")
    return <span className="canvas-input-preview">⌕&nbsp; {part.label}</span>;
  if (part.kind === "list")
    return (
      <span className="canvas-list-preview">
        <b>{part.label}</b>
        <i />
        <i />
        <i />
      </span>
    );
  if (part.kind === "table")
    return (
      <span className="canvas-table-preview">
        <b>{part.label}</b>
        <i />
        <i />
        <i />
      </span>
    );
  if (part.kind === "modal")
    return (
      <span className="canvas-modal-preview">
        <b>{part.label}</b>
        <small>Dialog content</small>
        <i>Confirm</i>
      </span>
    );
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
  const [zoom, setZoom] = useState(0.75);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiProposal, setAiProposal] = useState<CanvasAiProposal | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
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
  const resize = useRef<{
    id: string;
    pointerX: number;
    pointerY: number;
    width: number;
    height: number;
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
    setAiProposal(null);
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
  const duplicatePart = () => {
    if (!selectedPart) return;
    const duplicate = {
      ...copy(selectedPart),
      id: createId(),
      label: selectedPart.label + " copy",
      x: Math.min(screenWidth - selectedPart.width, selectedPart.x + 20),
      y: Math.min(screenHeight - selectedPart.height, selectedPart.y + 20),
      locked: false,
    };
    updateScreen((screen) => screen.parts.push(duplicate));
    setPartId(duplicate.id);
  };
  const alignPart = (
    horizontal?: "left" | "center" | "right",
    vertical?: "top" | "center" | "bottom",
  ) => {
    if (!selectedPart || selectedPart.locked) return;
    updatePart({
      ...(horizontal === "left"
        ? { x: 0 }
        : horizontal === "center"
          ? { x: (screenWidth - selectedPart.width) / 2 }
          : horizontal === "right"
            ? { x: screenWidth - selectedPart.width }
            : {}),
      ...(vertical === "top"
        ? { y: 0 }
        : vertical === "center"
          ? { y: (screenHeight - selectedPart.height) / 2 }
          : vertical === "bottom"
            ? { y: screenHeight - selectedPart.height }
            : {}),
    });
  };
  const duplicateScreen = () => {
    const duplicate = copy(activeScreen);
    duplicate.id = createId();
    duplicate.name = activeScreen.name + " copy";
    duplicate.parts = duplicate.parts.map((part) => ({
      ...part,
      id: createId(),
    }));
    commit((next) => ({ ...next, screens: [...next.screens, duplicate] }));
    setScreenId(duplicate.id);
    setPartId("");
  };
  const deleteScreen = () => {
    if (document.screens.length <= 1) return;
    const remaining = document.screens.filter(
      (screen) => screen.id !== activeScreen.id,
    );
    commit((next) => ({ ...next, screens: remaining }));
    setScreenId(remaining[0].id);
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
  const requestAiProposal = async () => {
    if (!aiInstruction.trim() || aiBusy) return;
    setAiBusy(true);
    setAiProposal(null);
    try {
      const proposal = await window.studio.designCanvasSuggest(
        root,
        document,
        aiInstruction,
        { screenId: activeScreen.id, ...(partId ? { partId } : {}) },
      );
      setAiProposal(proposal);
    } catch (error) {
      onError(String(error));
    } finally {
      setAiBusy(false);
    }
  };
  const applyAiProposal = () => {
    if (!aiProposal) return;
    commit((next) => {
      for (const operation of aiProposal.operations) {
        if (operation.type === "update_theme") {
          next.theme = { ...next.theme, ...operation.patch };
          continue;
        }
        const screen = next.screens.find(
          (entry) => entry.id === operation.screenId,
        );
        if (!screen) continue;
        if (operation.type === "add_part") {
          screen.parts.push({
            ...operation.part,
            id: createId(),
          });
          continue;
        }
        if (operation.type === "update_screen") {
          Object.assign(screen, operation.patch);
          continue;
        }
        const target = screen.parts.find(
          (part) => part.id === operation.partId,
        );
        if (!target) continue;
        if (operation.type === "delete_part") {
          screen.parts = screen.parts.filter(
            (part) => part.id !== operation.partId,
          );
        } else {
          Object.assign(target, operation.patch);
        }
      }
      return next;
    });
    setAiInstruction("");
    setPartId("");
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable='true']"))
        return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "d" && selectedPart) {
        event.preventDefault();
        duplicatePart();
      } else if (
        (event.key === "Delete" || event.key === "Backspace") &&
        selectedPart &&
        !selectedPart.locked
      ) {
        event.preventDefault();
        deletePart();
      } else if (
        selectedPart &&
        !selectedPart.locked &&
        event.key.startsWith("Arrow")
      ) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        updatePart({
          x: Math.max(
            0,
            Math.min(
              screenWidth - selectedPart.width,
              selectedPart.x +
                (event.key === "ArrowLeft"
                  ? -step
                  : event.key === "ArrowRight"
                    ? step
                    : 0),
            ),
          ),
          y: Math.max(
            0,
            Math.min(
              screenHeight - selectedPart.height,
              selectedPart.y +
                (event.key === "ArrowUp"
                  ? -step
                  : event.key === "ArrowDown"
                    ? step
                    : 0),
            ),
          ),
        });
      }
    };
    window.document.addEventListener("keydown", onKeyDown);
    return () => window.document.removeEventListener("keydown", onKeyDown);
  }, [selectedPart, screenWidth, screenHeight]);

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
          <button
            aria-label="Thu nhỏ canvas"
            disabled={zoom <= 0.4}
            onClick={() => setZoom((value) => Math.max(0.4, value - 0.1))}
          >
            <ZoomOut size={14} />
          </button>
          <button
            className="canvas-zoom-value"
            title="Đặt lại 100%"
            onClick={() => setZoom(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            aria-label="Phóng to canvas"
            disabled={zoom >= 1.5}
            onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))}
          >
            <ZoomIn size={14} />
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
              <button title="Nhân đôi màn hình" onClick={duplicateScreen}>
                <Copy size={14} />
              </button>
              <button
                title="Xóa màn hình"
                disabled={document.screens.length <= 1}
                onClick={deleteScreen}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <div className="canvas-scroll">
            <div
              style={{
                width: screenWidth * zoom,
                height: screenHeight * zoom,
              }}
              className="canvas-zoom-frame"
            >
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
                  transform: `scale(${zoom})`,
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
                    (event.clientX - bounds.left) / zoom,
                    (event.clientY - bounds.top) / zoom,
                  );
                }}
              >
                {activeScreen.parts
                  .filter((part) => !part.hidden)
                  .map((part) => (
                    <div
                      key={part.id}
                      className={
                        "canvas-part kind-" +
                        part.kind +
                        (part.id === partId ? " selected" : "") +
                        (part.locked ? " locked" : "")
                      }
                      style={{
                        left: part.x,
                        top: part.y,
                        width: part.width,
                        height: part.height,
                        opacity: part.opacity ?? 1,
                        backgroundColor: part.fill,
                        borderRadius: part.radius,
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPartId(part.id);
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setPartId(part.id);
                        if (part.locked) return;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        setPast((items) => [
                          ...items.slice(-49),
                          copy(document),
                        ]);
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
                        if (!drag.current || drag.current.id !== part.id)
                          return;
                        const nextX = Math.max(
                          0,
                          Math.min(
                            screenWidth - part.width,
                            drag.current.x +
                              (event.clientX - drag.current.pointerX) / zoom,
                          ),
                        );
                        const nextY = Math.max(
                          0,
                          Math.min(
                            screenHeight - part.height,
                            drag.current.y +
                              (event.clientY - drag.current.pointerY) / zoom,
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
                      {part.id === partId && !part.locked && (
                        <span
                          className="canvas-resize-handle"
                          role="separator"
                          aria-label="Thay đổi kích thước layer"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            event.currentTarget.setPointerCapture(
                              event.pointerId,
                            );
                            setPast((items) => [
                              ...items.slice(-49),
                              copy(document),
                            ]);
                            setFuture([]);
                            resize.current = {
                              id: part.id,
                              pointerX: event.clientX,
                              pointerY: event.clientY,
                              width: part.width,
                              height: part.height,
                            };
                          }}
                          onPointerMove={(event) => {
                            if (
                              !resize.current ||
                              resize.current.id !== part.id
                            )
                              return;
                            const width = Math.max(
                              20,
                              Math.min(
                                screenWidth - part.x,
                                resize.current.width +
                                  (event.clientX - resize.current.pointerX) /
                                    zoom,
                              ),
                            );
                            const height = Math.max(
                              8,
                              Math.min(
                                screenHeight - part.y,
                                resize.current.height +
                                  (event.clientY - resize.current.pointerY) /
                                    zoom,
                              ),
                            );
                            setDocument((current) => {
                              const next = copy(current);
                              const target = next.screens
                                .find((screen) => screen.id === activeScreen.id)
                                ?.parts.find((entry) => entry.id === part.id);
                              if (target) {
                                target.width = Math.round(width / 4) * 4;
                                target.height = Math.round(height / 4) * 4;
                              }
                              return next;
                            });
                          }}
                          onPointerUp={() => {
                            resize.current = null;
                          }}
                        />
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </main>
        <aside className="canvas-inspector">
          <section className="canvas-ai-panel">
            <div className="canvas-ai-title">
              <span>
                <Sparkles size={14} /> YANA AI
              </span>
              <small>
                {selectedPart ? "Đang chọn 1 layer" : "Toàn màn hình"}
              </small>
            </div>
            <textarea
              aria-label="Yêu cầu AI chỉnh Canvas"
              placeholder={
                selectedPart
                  ? `Ví dụ: đổi “${selectedPart.label}” thành nút chính màu xanh, bo 14px`
                  : "Ví dụ: tạo màn hình đăng nhập hiện đại, tông xanh ấm"
              }
              value={aiInstruction}
              disabled={aiBusy}
              onChange={(event) => setAiInstruction(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  (event.metaKey || event.ctrlKey) &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void requestAiProposal();
                }
              }}
            />
            <div className="canvas-ai-suggestions">
              {[
                selectedPart ? "Làm nổi bật hơn" : "Tạo landing page",
                selectedPart ? "Bo góc mềm hơn" : "Tạo màn đăng nhập",
                "Căn chỉnh gọn lại",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  disabled={aiBusy}
                  onClick={() => setAiInstruction(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <button
              className="canvas-ai-run primary"
              disabled={aiBusy || !aiInstruction.trim()}
              onClick={() => void requestAiProposal()}
            >
              <Sparkles size={14} />
              {aiBusy ? "Yana đang thiết kế…" : "Tạo đề xuất"}
            </button>
            {aiProposal && (
              <div className="canvas-ai-proposal" role="status">
                <b>{aiProposal.summary}</b>
                <span>{aiProposal.operations.length} thay đổi có kiểm tra</span>
                <div className="button-row">
                  <button onClick={() => setAiProposal(null)}>Bỏ qua</button>
                  <button className="primary" onClick={applyAiProposal}>
                    Áp dụng vào Canvas
                  </button>
                </div>
              </div>
            )}
          </section>
          <div className="section-label">
            <Layers3 size={13} /> LAYERS
          </div>
          <div className="canvas-layers">
            {[...activeScreen.parts].reverse().map((part) => (
              <div
                key={part.id}
                className={
                  "canvas-layer-row" +
                  (part.id === partId ? " selected" : "") +
                  (part.hidden ? " hidden" : "")
                }
              >
                <button onClick={() => setPartId(part.id)}>
                  <span>{part.label}</span>
                  <small>{part.kind}</small>
                </button>
                <button
                  aria-label={part.hidden ? "Hiện layer" : "Ẩn layer"}
                  title={part.hidden ? "Hiện layer" : "Ẩn layer"}
                  onClick={() => {
                    setPartId(part.id);
                    updateScreen((screen) => {
                      const target = screen.parts.find(
                        (item) => item.id === part.id,
                      );
                      if (target) target.hidden = !target.hidden;
                    });
                  }}
                >
                  {part.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button
                  aria-label={part.locked ? "Mở khóa layer" : "Khóa layer"}
                  title={part.locked ? "Mở khóa layer" : "Khóa layer"}
                  onClick={() => {
                    setPartId(part.id);
                    updateScreen((screen) => {
                      const target = screen.parts.find(
                        (item) => item.id === part.id,
                      );
                      if (target) target.locked = !target.locked;
                    });
                  }}
                >
                  {part.locked ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
              </div>
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
              <div className="canvas-align-grid" aria-label="Căn chỉnh">
                <button title="Căn trái" onClick={() => alignPart("left")}>
                  L
                </button>
                <button
                  title="Căn giữa ngang"
                  onClick={() => alignPart("center")}
                >
                  C
                </button>
                <button title="Căn phải" onClick={() => alignPart("right")}>
                  R
                </button>
                <button
                  title="Căn trên"
                  onClick={() => alignPart(undefined, "top")}
                >
                  T
                </button>
                <button
                  title="Căn giữa dọc"
                  onClick={() => alignPart(undefined, "center")}
                >
                  M
                </button>
                <button
                  title="Căn dưới"
                  onClick={() => alignPart(undefined, "bottom")}
                >
                  B
                </button>
              </div>
              <label>
                Màu nền
                <span className="canvas-color-control">
                  <input
                    type="color"
                    value={selectedPart.fill || document.theme.surface}
                    onChange={(event) =>
                      updatePart({ fill: event.target.value })
                    }
                  />
                  <button
                    title="Dùng màu mặc định"
                    onClick={() => updatePart({ fill: undefined })}
                  >
                    Reset
                  </button>
                </span>
              </label>
              <label>
                Độ mờ {Math.round((selectedPart.opacity ?? 1) * 100)}%
                <input
                  aria-label="Độ mờ layer"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={selectedPart.opacity ?? 1}
                  onChange={(event) =>
                    updatePart({ opacity: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                Bo góc
                <input
                  aria-label="Bo góc layer"
                  type="number"
                  min="0"
                  max="999"
                  value={selectedPart.radius ?? 12}
                  onChange={(event) =>
                    updatePart({
                      radius: Math.max(
                        0,
                        Math.min(999, Number(event.target.value)),
                      ),
                    })
                  }
                />
              </label>
              <div className="button-row">
                <button onClick={duplicatePart} title="Nhân đôi ⌘D">
                  <Copy size={14} />
                </button>
                <button
                  onClick={() => updatePart({ locked: !selectedPart.locked })}
                  title={selectedPart.locked ? "Mở khóa" : "Khóa"}
                >
                  {selectedPart.locked ? (
                    <Lock size={14} />
                  ) : (
                    <Unlock size={14} />
                  )}
                </button>
                <button onClick={() => moveLayer(1)} title="Đưa lên">
                  <ChevronUp size={14} />
                </button>
                <button onClick={() => moveLayer(-1)} title="Đưa xuống">
                  <ChevronDown size={14} />
                </button>
                <button
                  className="danger-button"
                  disabled={selectedPart.locked}
                  onClick={deletePart}
                >
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
            {activeScreen.parts
              .filter((part) => !part.hidden)
              .map((part) => (
                <div
                  key={part.id}
                  className={"canvas-part kind-" + part.kind}
                  style={{
                    left: part.x,
                    top: part.y,
                    width: part.width,
                    height: part.height,
                    opacity: part.opacity ?? 1,
                    backgroundColor: part.fill,
                    borderRadius: part.radius,
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
