import React, { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Code2,
  Copy,
  FileCode2,
  Files,
  Folder,
  FolderOpen,
  GitBranch,
  GitCompareArrows,
  ListTodo,
  LayoutTemplate,
  Maximize2,
  MessageSquare,
  Minimize2,
  MonitorSmartphone,
  PanelBottom,
  PanelLeft,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Shield,
  Square,
  TerminalSquare,
  X,
} from "lucide-react";
import { Settings } from "./Settings";
import { WorkspaceInspector } from "./WorkspaceInspector";
import { FilePicker } from "./FilePicker";
import { ModelManager } from "./ModelManager";
import type {
  AttachedFile,
  Chat,
  DiffComment,
  FileDocument,
  FileEntry,
  FilePage,
  GitState,
  Layout,
  Project,
  RunCommand,
  State,
  TerminalSession,
} from "./types";
import { Tasks } from "./Tasks";
import { Devices } from "./Devices";
import { Permissions } from "./Permissions";
import "./style.css";
import "./light-theme.css";
import { translate } from "./i18n";
import { renderMarkdown } from "./markdown";
import { AccountUnlock } from "./AccountSettings";
import { GovernancePopover } from "./GovernancePopover";
import { DesignCanvas } from "./DesignCanvas";
import { WelcomeOnboarding } from "./WelcomeOnboarding";

const Terminal = lazy(() =>
  import("./Terminal").then((module) => ({ default: module.Terminal })),
);
const Editor = lazy(() =>
  import("./Editor").then((module) => ({ default: module.Editor })),
);

const emptyGit: GitState = {
  branch: "",
  changes: [],
  worktrees: [],
  error: "",
};
type Surface =
  | "chat"
  | "files"
  | "design"
  | "settings"
  | "terminal"
  | "tasks"
  | "devices"
  | "permissions";
const MAX_ATTACH_FILES = 6;
const MAX_ATTACH_BYTES = 256 * 1024;
function App() {
  const [state, setState] = useState<State | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState("");
  const [surface, setSurface] = useState<Surface>("terminal");
  const [git, setGit] = useState<GitState>(emptyGit);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [filePage, setFilePage] = useState<FilePage | null>(null);
  const [fileQuery, setFileQuery] = useState("");
  const [directory, setDirectory] = useState("");
  const [opened, setOpened] = useState<{
    path: string;
    document: FileDocument;
  } | null>(null);
  const [draftFile, setDraftFile] = useState("");
  const [filesDragOver, setFilesDragOver] = useState(false);
  const [diff, setDiff] = useState<{ path: string; text: string } | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [diffComments, setDiffComments] = useState<DiffComment[]>([]);
  const [diffCommentLine, setDiffCommentLine] = useState<number | null>(null);
  const [diffCommentText, setDiffCommentText] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<
    Record<string, AttachedFile[]>
  >({});
  const [attachPickerOpen, setAttachPickerOpen] = useState(false);
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [runCommands, setRunCommands] = useState<RunCommand[]>([]);
  const [runCommandFormOpen, setRunCommandFormOpen] = useState(false);
  const [runCommandName, setRunCommandName] = useState("");
  const [runCommandText, setRunCommandText] = useState("");
  const [terminals, setTerminals] = useState<TerminalSession[]>([]);
  const [terminalId, setTerminalId] = useState("");
  // Starts closed: every addTerminal() callsite already does setDock(true),
  // so the dock only appears once there's an actual terminal to show. A
  // default of true left an empty panel + a resize handle with nothing to
  // resize sitting on screen on first launch, before any terminal exists.
  const [dock, setDock] = useState(false);
  const [maximize, setMaximize] = useState(false);
  const [split, setSplit] = useState(false);
  const [grid, setGrid] = useState(false);
  const [terminalEngaged, setTerminalEngaged] = useState(false);
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [layout, setLayout] = useState<Layout>({
    sidebar: 250,
    inspector: 330,
    dock: 280,
  });
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);
  const modelPopoverRef = useRef<HTMLDivElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);
  const chat = chats.find(
    (item) => item.id === chatId && item.root === project?.root,
  );
  const chatStopped = Boolean(
    chat?.error && /^Đã dừng theo yêu cầu/.test(chat.error),
  );
  const localChats = chats.filter((item) => item.root === project?.root);
  const localTerminals = terminals.filter(
    (item) => item.root === project?.root,
  );
  const terminal =
    localTerminals.find((item) => item.id === terminalId) || localTerminals[0];
  const secondary = split
    ? localTerminals.find((item) => item.id !== terminal?.id)
    : undefined;
  const terminalWorkspace = surface === "terminal";
  const expanded = maximize || terminalWorkspace;
  const dirty = Boolean(opened && draftFile !== opened.document.text);
  const run = async (operation: () => Promise<unknown>) => {
    try {
      await operation();
    } catch (error) {
      setNotice(String(error));
    }
  };
  const openChat = () => {
    setTerminalEngaged(false);
    setSurface("chat");
  };
  useEffect(() => {
    void window.studio
      .bootstrap()
      .then((value) => {
        setState(value);
        setChats(value.chats);
        setLayout(value.layout);
        setNotice(value.warning);
        if (value.projects[0]) setProject(value.projects[0]);
      })
      .catch((error) => setNotice(String(error)));
    return window.studio.on("chat:update", (updated) =>
      setChats((previous) =>
        previous.map((item) => (item.id === updated.id ? updated : item)),
      ),
    );
  }, []);
  useEffect(() => {
    if (!project) return;
    let active = true;
    setGit(emptyGit);
    setEntries([]);
    setFilePage(null);
    setFileQuery("");
    setDirectory("");
    setOpened(null);
    setDiff(null);
    const refresh = () => {
      void window.studio
        .gitStatus(project.root)
        .then((value) => {
          if (active) setGit(value);
        })
        .catch((error) => {
          if (active) setNotice(String(error));
        });
    };
    refresh();
    const timer = setInterval(refresh, 8000);
    void window.studio
      .listFiles(project.root, "", { limit: 200 })
      .then((value) => {
        if (active) {
          setEntries(value.entries);
          setFilePage(value);
        }
      })
      .catch((error) => {
        if (active) setNotice(String(error));
      });
    setChatId(chats.find((item) => item.root === project.root)?.id || "");
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [project?.root]);
  useEffect(() => {
    if (followOutput.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [chat?.messages.at(-1)?.content]);
  useEffect(() => {
    followOutput.current = true;
    bottom.current?.scrollIntoView({ block: "end" });
  }, [chatId]);
  useEffect(() => {
    if (surface !== "terminal") setTerminalEngaged(false);
  }, [surface]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((value) => !value);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "`") {
        event.preventDefault();
        setDock((value) => !value);
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "p" &&
        project
      ) {
        event.preventDefault();
        setQuickOpen((value) => !value);
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        /^[1-9]$/.test(event.key) &&
        project
      ) {
        const target = runCommands.find(
          (entry) => entry.shortcut === Number(event.key),
        );
        if (target) {
          event.preventDefault();
          void runPinnedCommand(target);
        }
      }
      if (event.key === "Escape") {
        setPalette(false);
        setDiff(null);
        setQuickOpen(false);
        setAttachPickerOpen(false);
        setModelPopoverOpen(false);
        // Cancel semantics only — dismisses the "save before closing?"
        // modal without discarding or closing the file, so this doesn't
        // conflict with Esc never being allowed to close a file on its own.
        setCloseConfirmOpen(false);
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "s" &&
        surface === "files" &&
        opened
      ) {
        event.preventDefault();
        void saveFile();
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "w" &&
        surface === "files" &&
        opened
      ) {
        event.preventDefault();
        closeFile();
      }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [surface, opened, draftFile, project, runCommands]);
  useEffect(() => {
    if (!modelPopoverOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!modelPopoverRef.current?.contains(event.target as Node))
        setModelPopoverOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [modelPopoverOpen]);
  useEffect(() => {
    if (!project) {
      setRunCommands([]);
      return;
    }
    let active = true;
    void window.studio
      .runCommandList(project.root)
      .then((value) => {
        if (active) setRunCommands(value);
      })
      .catch((error) => setNotice(String(error)));
    return () => {
      active = false;
    };
  }, [project?.root]);
  const switchProject = (next: Project, landing: Surface = "chat") => {
    if (
      dirty &&
      !window.confirm("File có thay đổi chưa lưu. Bỏ bản nháp và đổi project?")
    )
      return;
    setProject(next);
    setSurface(landing);
    setState(
      (previous) =>
        previous && {
          ...previous,
          projects: [
            next,
            ...previous.projects.filter((item) => item.root !== next.root),
          ],
        },
    );
  };
  const openProject = () =>
    run(async () => {
      const next = await window.studio.openProject();
      if (next) switchProject(next);
    });
  const newChat = () =>
    run(async () => {
      if (!project) return;
      const created = await window.studio.newChat(project.root);
      setChats((previous) => [...previous, created]);
      setChatId(created.id);
      openChat();
    });
  const removeChat = (id: string) =>
    run(async () => {
      if (!window.confirm("Xóa cuộc trò chuyện này? Không thể hoàn tác."))
        return;
      await window.studio.removeChat(id);
      setChats((previous) => previous.filter((item) => item.id !== id));
      if (chatId === id) setChatId("");
    });
  const addTerminal = () =>
    run(async () => {
      if (!project || busy) return;
      setBusy(true);
      try {
        const created = await window.studio.terminalCreate(project.root);
        setTerminals((previous) => [...previous, created]);
        setTerminalId(created.id);
        setDock(true);
        setTerminalEngaged(true);
      } finally {
        setBusy(false);
      }
    });
  const closeTerminal = (id: string) =>
    run(async () => {
      if (await window.studio.terminalClose(id))
        setTerminals((previous) => previous.filter((item) => item.id !== id));
    });
  const runPinnedCommand = (entry: RunCommand) =>
    run(async () => {
      if (!project || busy) return;
      setBusy(true);
      try {
        const created = await window.studio.terminalCreate(project.root);
        setTerminals((previous) => [...previous, created]);
        setTerminalId(created.id);
        setDock(true);
        setTerminalEngaged(true);
        await window.studio.terminalWrite(created.id, `${entry.command}\n`);
      } finally {
        setBusy(false);
      }
    });
  const createRunCommand = () =>
    run(async () => {
      if (!project) return;
      const next = await window.studio.runCommandCreate(project.root, {
        name: runCommandName,
        command: runCommandText,
      });
      setRunCommands(next);
      setRunCommandName("");
      setRunCommandText("");
      setRunCommandFormOpen(false);
    });
  const removeRunCommand = (id: string) =>
    run(async () => {
      if (!project) return;
      setRunCommands(await window.studio.runCommandRemove(project.root, id));
    });
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        !event.shiftKey ||
        surface === "settings"
      )
        return;
      if (event.key.toLowerCase() === "d") {
        event.preventDefault();
        setSurface("terminal");
        setGrid(true);
        setSplit(false);
        void addTerminal();
      } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        if (!localTerminals.length) return;
        const index = localTerminals.findIndex(
          (item) => item.id === terminal?.id,
        );
        const direction = event.key === "ArrowRight" ? 1 : -1;
        setTerminalId(
          localTerminals[
            (index + direction + localTerminals.length) % localTerminals.length
          ].id,
        );
        setDock(true);
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [surface, terminal?.id, localTerminals, project, busy]);
  const saveFile = () =>
    run(async () => {
      if (!project || !opened) return;
      const document = await window.studio.saveFile(
        project.root,
        opened.path,
        draftFile,
        opened.document.revision,
      );
      setOpened({ ...opened, document });
      setGit(await window.studio.gitStatus(project.root));
    });
  const loadDirectory = (relative: string, offset = 0, append = false) =>
    run(async () => {
      if (!project) return;
      const page = await window.studio.listFiles(project.root, relative, {
        offset,
        limit: 200,
      });
      setEntries((current) =>
        append ? [...current, ...page.entries] : page.entries,
      );
      setFilePage(page);
      setDirectory(relative);
      setFileQuery("");
    });
  const searchProjectFiles = (value: string) => {
    setFileQuery(value);
    if (!project) return;
    if (!value.trim()) {
      void loadDirectory(directory);
      return;
    }
    void run(async () => {
      setEntries(await window.studio.searchFiles(project.root, value, 250));
      setFilePage(null);
    });
  };
  const enterFile = (entry: FileEntry) =>
    run(async () => {
      if (!project) return;
      if (entry.directory) {
        await loadDirectory(entry.path);
        return;
      }
      if (dirty && !window.confirm("Bỏ bản nháp chưa lưu và mở file khác?"))
        return;
      const document = await window.studio.readFile(project.root, entry.path);
      setOpened({ path: entry.path, document });
      setDraftFile(document.text);
      setSurface("files");
    });
  const closeFile = () => {
    if (dirty) {
      setCloseConfirmOpen(true);
      return;
    }
    setOpened(null);
    setDraftFile("");
  };
  // Duplicates saveFile()'s IPC call instead of calling saveFile() itself:
  // saveFile() is wrapped in run(), which swallows its own errors, so a
  // failed save (e.g. a revision conflict) would still fall through to
  // closing the file below. Awaiting window.studio.saveFile directly here
  // means a failure throws into this function's own run() and stops before
  // the file closes — the modal stays open so the user can retry or cancel.
  const saveAndCloseFile = () =>
    run(async () => {
      if (!project || !opened) return;
      await window.studio.saveFile(
        project.root,
        opened.path,
        draftFile,
        opened.document.revision,
      );
      setGit(await window.studio.gitStatus(project.root));
      setCloseConfirmOpen(false);
      setOpened(null);
      setDraftFile("");
    });
  const discardAndCloseFile = () => {
    setCloseConfirmOpen(false);
    setOpened(null);
    setDraftFile("");
  };
  const openDroppedFile = async (root: string, relative: string) => {
    const document = await window.studio.readFile(root, relative);
    setOpened({ path: relative, document });
    setDraftFile(document.text);
    setSurface("files");
  };
  const handleFilesDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setFilesDragOver(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    void run(async () => {
      const result = await window.studio.openDroppedPath(
        project?.root || "",
        file,
      );
      if (result.kind === "project") {
        // The [project?.root] effect below already lists the new root's
        // files and resets stale editor/git state — no manual reload here.
        switchProject(result.project, "files");
        return;
      }
      if (result.project) switchProject(result.project, "files");
      await openDroppedFile(
        result.project?.root || project!.root,
        result.relative,
      );
    });
  };
  // band-app's clickable terminal file links (MIT — pattern reused,
  // not the code): a regex in Terminal.tsx finds path-shaped tokens in
  // PTY output, this resolves them the same safe way a drag-drop does —
  // openFilePath shares openDroppedPath's host-side realpath/containment
  // checks, just skipping the webUtils.getPathForFile step since a
  // terminal-parsed path is already a plain string.
  const openTerminalFileLink = (root: string, path: string) =>
    run(async () => {
      const result = await window.studio.openFilePath(root, path);
      if (result.kind === "project") {
        switchProject(result.project, "files");
        return;
      }
      if (result.project) switchProject(result.project, "files");
      await openDroppedFile(result.project?.root || root, result.relative);
    });
  const send = () =>
    run(async () => {
      if (!project) return;
      const draftKey = chat?.id || project.root;
      const message = drafts[draftKey] || "";
      if (!message.trim()) return;
      const files = attachments[draftKey] || [];
      // yana-rt's chat protocol takes a single text task, no separate
      // attachments channel — explicit context is folded in as fenced
      // blocks ahead of the user's own message, same as pasting file
      // content into the prompt by hand.
      const task = files.length
        ? files
            .map(
              (file) =>
                `[Attached: ${file.path}]\n\`\`\`\n${file.text}\n\`\`\``,
            )
            .join("\n\n") + `\n\n${message}`
        : message;
      let target = chat;
      if (!target) {
        target = await window.studio.newChat(project.root);
        setChats((previous) => [...previous, target!]);
        setChatId(target.id);
      }
      await window.studio.sendChat(target.id, task, message);
      setDrafts((previous) => ({ ...previous, [draftKey]: "" }));
      setAttachments((previous) => ({ ...previous, [draftKey]: [] }));
    });
  const attachPath = (path: string) =>
    run(async () => {
      if (!project) return;
      const draftKey = chat?.id || project.root;
      const current = attachments[draftKey] || [];
      if (current.some((file) => file.path === path)) return;
      if (current.length >= MAX_ATTACH_FILES) {
        setNotice(`Tối đa ${MAX_ATTACH_FILES} file đính kèm mỗi tin nhắn.`);
        return;
      }
      const document = await window.studio.readFile(project.root, path);
      const used = current.reduce((sum, file) => sum + file.bytes, 0);
      if (used + document.bytes > MAX_ATTACH_BYTES) {
        setNotice("Tổng dung lượng file đính kèm vượt quá 256 KiB.");
        return;
      }
      setAttachments({
        ...attachments,
        [draftKey]: [
          ...current,
          { path, text: document.text, bytes: document.bytes },
        ],
      });
    });
  const attachFile = (entry: FileEntry) => attachPath(entry.path);
  const removeAttachment = (path: string) => {
    const draftKey = chat?.id || project?.root || "";
    setAttachments({
      ...attachments,
      [draftKey]: (attachments[draftKey] || []).filter(
        (file) => file.path !== path,
      ),
    });
  };
  const resize = (
    name: keyof Layout,
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = name === "dock" ? event.clientY : event.clientX;
    const value = layout[name];
    let next = layout;
    const target = event.currentTarget;
    const app = target.closest<HTMLElement>(".app");
    let frame = 0;
    let pending = value;
    const render = () => {
      frame = 0;
      app?.style.setProperty(`--${name}`, `${pending}px`);
    };
    const move = (pointer: PointerEvent) => {
      const delta =
        (name === "dock" ? pointer.clientY : pointer.clientX) - start;
      const limits =
        name === "sidebar"
          ? [190, 340]
          : name === "inspector"
            ? [260, 480]
            : [150, Math.min(700, window.innerHeight - 260)];
      pending = Math.max(
        limits[0],
        Math.min(limits[1], value + delta * (name === "sidebar" ? 1 : -1)),
      );
      next = { ...layout, [name]: pending };
      if (!frame) frame = requestAnimationFrame(render);
    };
    const finish = () => {
      if (frame) cancelAnimationFrame(frame);
      render();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      setLayout(next);
      void run(() => window.studio.saveLayout(next));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };
  const showDiff = (file: string) =>
    run(async () => {
      if (!project) return;
      setDiff({
        path: file,
        text: await window.studio.gitDiff(project.root, file),
      });
      setDiffComments(await window.studio.diffCommentList(project.root, file));
      setDiffCommentLine(null);
      setDiffCommentText("");
    });
  const addDiffComment = (lineIndex: number, lineText: string) =>
    run(async () => {
      if (!project || !diff) return;
      setDiffComments(
        await window.studio.diffCommentCreate(project.root, diff.path, {
          lineIndex,
          lineText,
          text: diffCommentText,
        }),
      );
      setDiffCommentLine(null);
      setDiffCommentText("");
    });
  const removeDiffComment = (id: string) =>
    run(async () => {
      if (!project || !diff) return;
      setDiffComments(
        await window.studio.diffCommentRemove(project.root, diff.path, id),
      );
    });
  if (!state)
    return (
      <div className="boot">
        <div className="brand-symbol">Y</div>
        <h1>Yana Studio</h1>
        <p>{notice || "Đang mở workspace mới…"}</p>
      </div>
    );
  if (state.account.locked)
    return (
      <AccountUnlock state={state} onState={setState} onError={setNotice} />
    );
  if (
    state.account.configured &&
    (!state.onboardingCompleted || showOnboarding)
  )
    return (
      <WelcomeOnboarding
        locale={state.preferences.locale}
        displayName={state.account.displayName}
        onComplete={async () => {
          setState(await window.studio.completeOnboarding());
          setShowOnboarding(false);
        }}
        onOpenProject={async () => {
          const selected = await window.studio.openProject();
          if (selected) await switchProject(selected);
        }}
      />
    );
  const t = translate(state.preferences.locale);
  const commands = [
    { label: "Mở project…", icon: FolderOpen, action: openProject },
    { label: "Cuộc trò chuyện mới", icon: MessageSquare, action: newChat },
    { label: "Tạo terminal", icon: TerminalSquare, action: addTerminal },
    { label: "Files & Editor", icon: Files, action: () => setSurface("files") },
    {
      label: "Design Canvas",
      icon: LayoutTemplate,
      action: () => setSurface("design"),
    },
    { label: "Tasks", icon: ListTodo, action: () => setSurface("tasks") },
    {
      label: "Devices",
      icon: MonitorSmartphone,
      action: () => setSurface("devices"),
    },
    {
      label: "Permissions",
      icon: Shield,
      action: () => setSurface("permissions"),
    },
    {
      label: "Cài đặt — model, runtime và kết nối",
      icon: Settings2,
      action: () => setSurface("settings"),
    },
    {
      label: "Ẩn / hiện terminal",
      icon: PanelBottom,
      action: () => setDock((value) => !value),
    },
  ];
  const draftKey = chat?.id || project?.root || "none";
  const copyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setNotice("Đã sao chép nội dung.");
    } catch {
      setNotice("Không thể sao chép nội dung trên thiết bị này.");
    }
  };
  const reuseMessage = (content: string) => {
    setDrafts((previous) => ({ ...previous, [draftKey]: content }));
    requestAnimationFrame(() => composerInput.current?.focus());
  };
  const visibleMessageContent = (message: Chat["messages"][number]) =>
    message.role === "user"
      ? message.userInput || message.content
      : message.content;
  const openedAttached = Boolean(
    opened &&
    (attachments[draftKey] || []).some((file) => file.path === opened.path),
  );
  return (
    <div
      className="app"
      style={
        {
          "--sidebar": `${layout.sidebar}px`,
          "--inspector": `${layout.inspector}px`,
          "--dock": `${layout.dock}px`,
        } as React.CSSProperties
      }
    >
      <header className="titlebar">
        <div className="title-brand">
          <span className="brand-symbol small">Y</span>
          <strong>Yana Studio</strong>
          <span className="version-label">NEW</span>
        </div>
        <div className="breadcrumb">
          <Folder size={14} />
          <span>{project?.name || t("noWorkspace")}</span>
          <ChevronRight size={12} />
          <span className="muted">{git.branch || "Local"}</span>
        </div>
        <button className="global-search" onClick={() => setPalette(true)}>
          <Search size={14} />
          <span>{t("search")}</span>
          <kbd>⌘ K</kbd>
        </button>
        <button
          className="settings-shortcut"
          title={t("settings")}
          onClick={() => setSurface("settings")}
        >
          <Settings2 size={16} />
          <span>{t("settings")}</span>
        </button>
      </header>
      <div
        className={`workspace ${surface === "settings" ? "settings-mode" : ""}`}
      >
        <aside className="sidebar">
          <button className="project-switch" onClick={openProject}>
            <FolderOpen size={20} />
            <div>
              <strong>{project?.name || "Mở project"}</strong>
              <small>{project?.root || "Bắt đầu từ thư mục của anh"}</small>
            </div>
            <ChevronDown size={14} />
          </button>
          <div className="section-label">{t("workspace")}</div>
          <nav>
            <button
              className={surface === "chat" ? "selected" : ""}
              onClick={openChat}
            >
              <MessageSquare size={17} />
              <span>{t("chat")}</span>
              <kbd>{localChats.length || ""}</kbd>
            </button>
            <button
              className={surface === "files" ? "selected" : ""}
              onClick={() => {
                // Re-clicking "Files & Editor" while already there and a
                // file is open reads as "take me back to the browser", not
                // a no-op — closeFile() itself pops the save-confirm modal
                // first if the file is dirty, same as the X button.
                if (surface === "files" && opened) closeFile();
                setSurface("files");
              }}
            >
              <Files size={17} />
              <span>{t("files")}</span>
            </button>
            <button
              className={surface === "design" ? "selected" : ""}
              onClick={() => setSurface("design")}
            >
              <LayoutTemplate size={17} />
              <span>Thiết kế</span>
            </button>
            <button
              className={surface === "tasks" ? "selected" : ""}
              onClick={() => setSurface("tasks")}
            >
              <ListTodo size={17} />
              <span>Tasks</span>
            </button>
            <button
              className={surface === "devices" ? "selected" : ""}
              onClick={() => setSurface("devices")}
            >
              <MonitorSmartphone size={17} />
              <span>Devices</span>
            </button>
            <button
              className={surface === "permissions" ? "selected" : ""}
              onClick={() => setSurface("permissions")}
            >
              <Shield size={17} />
              <span>Permissions</span>
            </button>
            <button
              onClick={() => {
                setSurface("terminal");
                setDock(true);
              }}
              className={terminalWorkspace ? "selected" : ""}
            >
              <TerminalSquare size={17} />
              <span>{t("terminal")}</span>
              <kbd>{localTerminals.length || ""}</kbd>
            </button>
          </nav>
          <div className="section-label">
            {t("worktrees")} <GitBranch size={13} />
          </div>
          <div className="worktrees">
            {git.worktrees.length ? (
              git.worktrees.map((tree) => (
                <div
                  className={`tree-item ${tree.root === project?.root ? "current" : ""}`}
                  key={tree.root}
                  title={tree.root}
                >
                  <GitBranch size={14} />
                  <div>
                    <strong>{tree.branch}</strong>
                    <small>{tree.root.split(/[\\/]/).at(-1)}</small>
                  </div>
                  {tree.root === project?.root && <span className="dot blue" />}
                </div>
              ))
            ) : (
              <p className="empty-small">
                {project
                  ? "Không có worktree Git để hiển thị."
                  : "Mở project để xem nhánh."}
              </p>
            )}
          </div>
          <div className="section-label">
            {t("recentProjects")}{" "}
            <button onClick={openProject} aria-label="Open project">
              <Plus size={14} />
            </button>
          </div>
          <div className="recent">
            {state.projects.map((item) => (
              <button
                className={item.root === project?.root ? "current" : ""}
                key={item.root}
                title={item.root}
                onClick={() =>
                  void run(async () =>
                    switchProject(await window.studio.recentProject(item.root)),
                  )
                }
              >
                <Folder size={14} />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
          <div className="sidebar-bottom">
            <button
              className={surface === "settings" ? "selected" : ""}
              onClick={() => setSurface("settings")}
            >
              <Settings2 size={17} />
              <span>{t("settings")}</span>
            </button>
            <div className="runtime-chip">
              <Shield size={16} />
              <div>
                <strong>
                  {state.runtime ? t("runtimeReady") : t("runtimeNeeded")}
                </strong>
                <small>{t("noBypass")}</small>
              </div>
            </div>
          </div>
        </aside>
        <div
          className="resize-handle side"
          role="separator"
          aria-label="Resize sidebar"
          onPointerDown={(event) => resize("sidebar", event)}
        />
        {surface === "settings" && (
          <main className="settings-container">
            <Settings
              state={state}
              onState={setState}
              onClose={openChat}
              onError={setNotice}
              projectRoot={project?.root || ""}
              onOpenTerminal={(command) => {
                setSurface("terminal");
                setDock(true);
                void run(async () => {
                  let target = terminal;
                  if (!target && project) {
                    target = await window.studio.terminalCreate(project.root);
                    setTerminals((previous) => [...previous, target!]);
                    setTerminalId(target.id);
                  }
                  if (target && command)
                    await window.studio.terminalWrite(target.id, command);
                });
              }}
              onShowOnboarding={() => setShowOnboarding(true)}
            />
          </main>
        )}
        <>
          <main className={`main-column ${expanded ? "dock-max" : ""}`}>
            <section className="center" hidden={expanded}>
              <div className="tabs">
                <button
                  className={surface === "chat" ? "active" : ""}
                  onClick={openChat}
                >
                  <MessageSquare size={14} />
                  <span className="tab-label">Workspace</span>
                </button>
                {localChats.slice(-8).map((item) => (
                  <button
                    key={item.id}
                    className={
                      chat?.id === item.id && surface === "chat" ? "active" : ""
                    }
                    title={item.title}
                    onClick={() => {
                      setChatId(item.id);
                      openChat();
                    }}
                  >
                    {item.running && <span className="dot blue" />}
                    <span className="tab-label">{item.title}</span>
                    <span
                      className="tab-close"
                      role="button"
                      aria-label={`Xóa "${item.title}"`}
                      title="Xóa cuộc trò chuyện"
                      onClick={(event) => {
                        event.stopPropagation();
                        void removeChat(item.id);
                      }}
                    >
                      <X size={12} />
                    </span>
                  </button>
                ))}
                <button
                  className="tab-new"
                  title="New conversation"
                  onClick={newChat}
                  disabled={!project}
                >
                  <Plus size={15} />
                </button>
              </div>
              {surface === "tasks" ? (
                <Tasks root={project?.root || ""} onError={setNotice} />
              ) : surface === "devices" ? (
                <Devices onError={setNotice} />
              ) : surface === "permissions" ? (
                <Permissions root={project?.root || ""} onError={setNotice} />
              ) : surface === "design" ? (
                <DesignCanvas
                  root={project?.root || ""}
                  onError={setNotice}
                  onPrompt={(prompt) => {
                    setDrafts((previous) => ({
                      ...previous,
                      [draftKey]: prompt,
                    }));
                    openChat();
                    requestAnimationFrame(() => composerInput.current?.focus());
                  }}
                />
              ) : surface === "files" ? (
                <div
                  className={`files-workspace ${filesDragOver ? "drag-over" : ""}`}
                  onDragOver={(event) => {
                    if (!event.dataTransfer.types.includes("Files")) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    setFilesDragOver(true);
                  }}
                  onDragLeave={(event) => {
                    if (
                      event.currentTarget.contains(event.relatedTarget as Node)
                    )
                      return;
                    setFilesDragOver(false);
                  }}
                  onDrop={handleFilesDrop}
                >
                  {filesDragOver && (
                    <div className="files-dropzone-overlay">
                      <FileCode2 size={28} />
                      <strong>Thả để mở file hoặc project</strong>
                      <span>Thả folder để mở làm project mới</span>
                    </div>
                  )}
                  <div className="file-tree">
                    <div className="section-label">
                      FILES{" "}
                      <button
                        title="Parent directory"
                        onClick={() =>
                          void run(async () => {
                            if (!project) return;
                            const parent = directory
                              .split(/[\\/]/)
                              .slice(0, -1)
                              .join("/");
                            await loadDirectory(parent);
                          })
                        }
                      >
                        <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <small className="directory-label">
                      {directory || project?.name || "Open a project"}
                    </small>
                    <label className="file-search">
                      <Search size={13} />
                      <input
                        value={fileQuery}
                        placeholder="Tìm file trong project"
                        onChange={(event) =>
                          searchProjectFiles(event.target.value)
                        }
                      />
                    </label>
                    {entries.map((entry) => (
                      <button
                        key={entry.path}
                        className={opened?.path === entry.path ? "current" : ""}
                        onClick={() => void enterFile(entry)}
                      >
                        {entry.directory ? (
                          <Folder size={14} />
                        ) : (
                          <FileCode2 size={14} />
                        )}
                        <span>{entry.name}</span>
                      </button>
                    ))}
                    {filePage?.hasMore && (
                      <button
                        className="load-more-files"
                        onClick={() =>
                          void loadDirectory(
                            directory,
                            filePage.offset + filePage.entries.length,
                            true,
                          )
                        }
                      >
                        Hiện thêm · {entries.length}/{filePage.total}
                      </button>
                    )}
                  </div>
                  <div className="file-content">
                    {opened ? (
                      <>
                        <div className="editor-toolbar">
                          <span>
                            {opened.path}
                            {dirty ? " •" : ""}
                            {opened.document.optimized && (
                              <b className="large-file-badge">
                                {opened.document.truncated
                                  ? "WINDOW"
                                  : "LARGE FILE"}{" "}
                                · syntax off ·{" "}
                                {Math.ceil(opened.document.totalBytes / 1024)}{" "}
                                KiB
                              </b>
                            )}
                          </span>
                          <div className="editor-actions">
                            {opened.document.truncated && (
                              <>
                                <button
                                  disabled={opened.document.offset === 0}
                                  onClick={() =>
                                    void run(async () => {
                                      if (!project) return;
                                      const document =
                                        await window.studio.readFileWindow(
                                          project.root,
                                          opened.path,
                                          opened.document.offset - 256 * 1024,
                                        );
                                      setOpened({ ...opened, document });
                                      setDraftFile(document.text);
                                    })
                                  }
                                >
                                  Vùng trước
                                </button>
                                <button
                                  disabled={
                                    opened.document.offset +
                                      opened.document.bytes >=
                                    opened.document.totalBytes
                                  }
                                  onClick={() =>
                                    void run(async () => {
                                      if (!project) return;
                                      const document =
                                        await window.studio.readFileWindow(
                                          project.root,
                                          opened.path,
                                          opened.document.offset +
                                            opened.document.bytes,
                                        );
                                      setOpened({ ...opened, document });
                                      setDraftFile(document.text);
                                    })
                                  }
                                >
                                  Vùng sau
                                </button>
                              </>
                            )}
                            <button
                              disabled={!dirty || opened.document.readOnly}
                              onClick={saveFile}
                            >
                              <Check size={14} /> Lưu <kbd>⌘S</kbd>
                            </button>
                            <button
                              aria-label="Đóng file, quay lại danh sách"
                              title="Đóng file"
                              onClick={closeFile}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                        <Suspense
                          fallback={
                            <p className="empty-small">Đang mở editor…</p>
                          }
                        >
                          <Editor
                            filename={opened.path}
                            key={`${opened.path}:${opened.document.revision}`}
                            initial={draftFile}
                            optimized={opened.document.optimized}
                            readOnly={opened.document.readOnly}
                            onChange={setDraftFile}
                          />
                        </Suspense>
                      </>
                    ) : (
                      <div className="empty-editor">
                        <Code2 size={30} />
                        <h2>Editor nằm ngay trong app</h2>
                        <p>Chọn một file bên trái. Không cần code-server.</p>
                        <p className="muted">
                          File ≤ 8 MiB sửa trực tiếp · File lớn mở theo cửa sổ
                          256 KiB để không làm treo app.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className="conversation"
                    onPointerDown={() => setTerminalEngaged(false)}
                    onScroll={(event) => {
                      const element = event.currentTarget;
                      followOutput.current =
                        element.scrollHeight -
                          element.scrollTop -
                          element.clientHeight <
                        100;
                    }}
                  >
                    <div className="conversation-heading">
                      <div className="conversation-title">
                        <span className="eyebrow">PHIÊN LÀM VIỆC</span>
                        <strong>
                          {chat?.title || project?.name || "Workspace"}
                        </strong>
                        <small>
                          {git.branch || "Local"} · {chat?.messages.length || 0}{" "}
                          tin nhắn
                        </small>
                      </div>
                      <div className="conversation-heading-actions">
                        <span
                          className="model-pill"
                          title={state.profile.model}
                        >
                          {state.profile.model || "Chưa chọn model"}
                        </span>
                        <button onClick={newChat} disabled={!project}>
                          <Plus size={13} /> Phiên mới
                        </button>
                      </div>
                    </div>
                    {!chat?.messages.length && (
                      <div className="welcome">
                        <div className="welcome-mark">
                          <Code2 size={26} />
                        </div>
                        <h1>Mình xây gì tiếp theo?</h1>
                        <p>
                          Một không gian cho code, terminal và AI.
                          <br />
                          Quyền thực thi vẫn do anh quyết định.
                        </p>
                        <div className="suggestions">
                          <button
                            disabled={!project}
                            onClick={() =>
                              setDrafts({
                                ...drafts,
                                [draftKey]:
                                  "Khảo sát cấu trúc project này. Chỉ đọc, chưa thay đổi file.",
                              })
                            }
                          >
                            <Files size={17} />
                            <strong>Hiểu project</strong>
                            <small>Đọc cấu trúc & ngữ cảnh</small>
                          </button>
                          <button
                            onClick={() => {
                              setSurface("files");
                            }}
                          >
                            <Code2 size={17} />
                            <strong>Mở editor</strong>
                            <small>Xem và sửa file thật</small>
                          </button>
                          <button disabled={!project} onClick={addTerminal}>
                            <TerminalSquare size={17} />
                            <strong>Mở terminal</strong>
                            <small>Shell của anh, không trung gian</small>
                          </button>
                        </div>
                        {!project && (
                          <button className="primary" onClick={openProject}>
                            <FolderOpen size={16} /> Mở workspace
                          </button>
                        )}
                      </div>
                    )}
                    {chat?.messages.map((message, index) => (
                      <article
                        className={`message ${message.role}`}
                        key={index}
                      >
                        <div className="message-avatar">
                          {message.role === "user" ? "A" : "Y"}
                        </div>
                        <div className="message-content">
                          <div className="message-label">
                            <strong>
                              {message.role === "user" ? "Anh" : "Yana"}
                            </strong>
                            <span>
                              {message.role === "assistant"
                                ? "Governed runtime"
                                : "Human"}
                            </span>
                            <div className="message-actions">
                              {visibleMessageContent(message) && (
                                <button
                                  aria-label="Sao chép tin nhắn"
                                  title="Sao chép"
                                  onClick={() =>
                                    void copyMessage(
                                      visibleMessageContent(message),
                                    )
                                  }
                                >
                                  <Copy size={12} />
                                </button>
                              )}
                              {message.role === "user" &&
                                visibleMessageContent(message) && (
                                  <button
                                    aria-label="Dùng lại nội dung trong ô nhập"
                                    title="Dùng lại trong ô nhập"
                                    onClick={() =>
                                      reuseMessage(
                                        visibleMessageContent(message),
                                      )
                                    }
                                  >
                                    <RotateCcw size={12} />
                                  </button>
                                )}
                            </div>
                          </div>
                          <div className="message-body">
                            {visibleMessageContent(message) ? (
                              message.role === "assistant" ? (
                                <div
                                  className="markdown-body"
                                  // Sanitized by renderMarkdown() (marked +
                                  // DOMPurify, see owasp-llm-output-law.md) —
                                  // never render raw marked.parse() output.
                                  dangerouslySetInnerHTML={{
                                    __html: renderMarkdown(
                                      visibleMessageContent(message),
                                    ),
                                  }}
                                />
                              ) : (
                                visibleMessageContent(message)
                              )
                            ) : message.errorDetail ? (
                              <div className="message-error-card">
                                <strong>Provider request failed</strong>
                                <span>
                                  Provider: {message.errorDetail.provider}
                                </span>
                                <span>Model: {message.errorDetail.model}</span>
                                <span>
                                  Reason: {message.errorDetail.reason}
                                </span>
                                {/model_not_found|does not exist|not available/i.test(
                                  message.errorDetail.reason,
                                ) && (
                                  <div className="model-error-action">
                                    <span>
                                      Model này không còn dùng được với key hiện
                                      tại. Đồng bộ để lấy danh sách thật của tài
                                      khoản này.
                                    </span>
                                    <button
                                      onClick={() => setSurface("settings")}
                                    >
                                      Mở AI Models
                                    </button>
                                  </div>
                                )}
                                {message.errorDetail.exitCode !== null && (
                                  <span>
                                    Runtime exit: {message.errorDetail.exitCode}
                                  </span>
                                )}
                              </div>
                            ) : chat.running ? (
                              "Đang chờ runtime…"
                            ) : (
                              "Chưa có nội dung trả về."
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                    {chat?.messages.length ? (
                      <div
                        className={`turn-status ${chat.running ? "running" : chatStopped ? "stopped" : chat.error ? "failed" : "completed"}`}
                        role="status"
                      >
                        <span className="turn-status-primary">
                          {chat.running ? (
                            <RefreshCw size={13} />
                          ) : chat.error ? (
                            <Circle size={13} />
                          ) : (
                            <Check size={13} />
                          )}
                          {chat.running
                            ? "Yana đang xử lý"
                            : chatStopped
                              ? "Lượt chạy đã dừng"
                              : chat.error
                                ? "Lượt chạy cần xử lý"
                                : "Lượt chạy hoàn tất"}
                        </span>
                        <span>
                          {chat.profile?.provider || state.profile.provider} ·{" "}
                          {chat.profile?.model || state.profile.model}
                        </span>
                        <span>
                          {chat.usage
                            ? `${chat.usage.input + chat.usage.output} tokens`
                            : `${chat.events.length} sự kiện runtime`}
                        </span>
                      </div>
                    ) : null}
                    {chat?.events.length ? (
                      <details className="runtime-events">
                        <summary>
                          <GitCompareArrows size={14} /> {chat.events.length} sự
                          kiện runtime · dữ liệu thật
                        </summary>
                        {chat.events.slice(-12).map((event, index) => (
                          <div key={index}>
                            <span className="event-kind">{event.kind}</span>
                            <code>{event.tool || event.call_id || ""}</code>
                            <span>{event.summary || event.reason || ""}</span>
                          </div>
                        ))}
                      </details>
                    ) : null}
                    {chat?.approval && (
                      <div className="approval card">
                        <h3>
                          <Shield size={17} /> Cần anh phê duyệt
                        </h3>
                        <code>{chat.approval.capability}</code>
                        <div className="approval-contract">
                          {chat.approval.risk_tier ? (
                            <span>Risk: {chat.approval.risk_tier}</span>
                          ) : (
                            <span>Risk tier: runtime chưa cung cấp</span>
                          )}
                          {chat.approval.approver ? (
                            <span>Approver: {chat.approval.approver}</span>
                          ) : (
                            <span>Approver contract: human:&lt;name&gt;</span>
                          )}
                        </div>
                        <p>{chat.approval.reason}</p>
                        <div className="button-row">
                          <button
                            className="primary"
                            disabled={
                              chat.running ||
                              chat.profile?.provider === "custom"
                            }
                            onClick={() =>
                              void run(() =>
                                window.studio.decideApproval(chat.id, true),
                              )
                            }
                          >
                            Cho phép một lần
                          </button>
                          <button
                            disabled={
                              chat.running ||
                              chat.profile?.provider === "custom"
                            }
                            onClick={() =>
                              void run(() =>
                                window.studio.decideApproval(chat.id, false),
                              )
                            }
                          >
                            Từ chối
                          </button>
                        </div>
                        {chat.profile?.provider === "custom" && (
                          <p className="muted">
                            Runtime hiện chưa hỗ trợ resume approval cho custom
                            provider. Không thao tác nào được tự cấp phép.
                          </p>
                        )}
                      </div>
                    )}
                    {chat?.error &&
                      chat.messages.at(-1)?.errorDetail?.reason !==
                        chat.error && (
                        <div
                          className={`inline-error ${chatStopped ? "inline-info" : ""}`}
                          role={chatStopped ? "status" : "alert"}
                        >
                          {chat.error}
                        </div>
                      )}
                    <div ref={bottom} />
                  </div>
                  <div
                    className="composer"
                    onPointerDown={() => setTerminalEngaged(false)}
                  >
                    {(attachments[draftKey] || []).length > 0 && (
                      <div className="composer-attachments">
                        {(attachments[draftKey] || []).map((file) => (
                          <span className="attachment-chip" key={file.path}>
                            <FileCode2 size={12} />
                            {file.path}
                            <button
                              aria-label={`Remove ${file.path}`}
                              onClick={() => removeAttachment(file.path)}
                            >
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <textarea
                      ref={composerInput}
                      aria-label="Message to Yana"
                      placeholder={
                        project
                          ? "Trao đổi với Yana…"
                          : "Mở project để bắt đầu…"
                      }
                      disabled={!project || Boolean(chat?.approval)}
                      value={drafts[draftKey] || ""}
                      onChange={(event) =>
                        setDrafts({
                          ...drafts,
                          [draftKey]: event.target.value,
                        })
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          !event.shiftKey &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault();
                          if (!chat?.running) void send();
                        }
                      }}
                    />
                    <div className="composer-toolbar">
                      <div className="composer-shortcuts">
                        <button
                          className="composer-add"
                          aria-label="Thêm file làm ngữ cảnh"
                          title="Thêm file làm ngữ cảnh"
                          disabled={!project}
                          onClick={() => setAttachPickerOpen(true)}
                        >
                          <Plus size={16} />
                        </button>
                        <button
                          aria-label="Mở Tệp và Trình sửa"
                          title="Mở Tệp và Trình sửa"
                          disabled={!project}
                          onClick={() => setSurface("files")}
                        >
                          <Files size={14} /> Tệp
                        </button>
                        <button
                          className={openedAttached ? "context-active" : ""}
                          aria-label="Đính kèm file code đang mở"
                          aria-pressed={openedAttached}
                          title={
                            openedAttached
                              ? `${opened?.path} đã có trong ngữ cảnh`
                              : opened
                                ? `Đính kèm ${opened.path}`
                                : "Mở một file trước để đính kèm nhanh"
                          }
                          disabled={!opened}
                          onClick={() => opened && attachPath(opened.path)}
                        >
                          <Code2 size={14} /> Code
                        </button>
                        <button
                          aria-label="Hiện Terminal"
                          title="Hiện Terminal"
                          disabled={!project || busy}
                          onClick={() => {
                            setTerminalEngaged(true);
                            if (localTerminals.length) {
                              setDock(true);
                              setTerminalId(
                                terminal?.id || localTerminals[0].id,
                              );
                            } else {
                              void addTerminal();
                            }
                          }}
                        >
                          <TerminalSquare size={14} /> Terminal
                        </button>
                      </div>
                      <GovernancePopover
                        root={project?.root || ""}
                        onError={setNotice}
                        onOpenPermissions={() => setSurface("permissions")}
                      />
                      <div className="model-pill-anchor" ref={modelPopoverRef}>
                        <button
                          className="composer-model-button"
                          onClick={() => setModelPopoverOpen((value) => !value)}
                          title="Chọn model"
                        >
                          {state.profile.model || state.profile.provider}{" "}
                          <ChevronDown size={13} />
                        </button>
                        {modelPopoverOpen && (
                          <div className="model-popover">
                            <ModelManager
                              compact
                              state={state}
                              onState={setState}
                              onError={setNotice}
                              onManage={() => {
                                setModelPopoverOpen(false);
                                setSurface("settings");
                              }}
                            />
                          </div>
                        )}
                      </div>
                      {chat?.running ? (
                        <button
                          className="stop-button"
                          onClick={() =>
                            void run(() => window.studio.stopChat(chat.id))
                          }
                        >
                          <Square size={14} /> Dừng
                        </button>
                      ) : (
                        <button
                          className="send-button"
                          aria-label="Send message"
                          disabled={
                            !project ||
                            !drafts[draftKey]?.trim() ||
                            Boolean(chat?.approval)
                          }
                          onClick={send}
                        >
                          <ArrowUpRight size={19} />
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>
            <div
              className="resize-handle horizontal"
              hidden={!dock || expanded}
              role="separator"
              aria-label="Resize terminal dock"
              onPointerDown={(event) => resize("dock", event)}
            />
            <section
              className={`terminal-dock ${terminalEngaged ? "engaged" : "ambient"}`}
              hidden={!dock}
              onPointerDown={() => setTerminalEngaged(true)}
            >
              <div className="terminal-tabs">
                <TerminalSquare size={14} />
                {localTerminals.map((item) => (
                  <div
                    className={`terminal-tab ${terminal?.id === item.id ? "active" : ""}`}
                    key={item.id}
                  >
                    <button
                      onClick={() => {
                        setTerminalEngaged(true);
                        setTerminalId(item.id);
                      }}
                    >
                      {item.label}
                    </button>
                    <button
                      aria-label={`Close ${item.label}`}
                      onClick={() => void closeTerminal(item.id)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button
                  aria-label="New terminal"
                  disabled={!project || busy}
                  onClick={addTerminal}
                >
                  <Plus size={16} />
                </button>
                <span className="human-label">HUMAN SHELL</span>
                <button
                  title="Split terminals"
                  disabled={localTerminals.length < 2}
                  aria-pressed={split && !grid}
                  onClick={() => {
                    setGrid(false);
                    setSplit((value) => !value);
                  }}
                >
                  <PanelLeft size={15} />
                </button>
                <button
                  title="Tile all terminals"
                  aria-label="Tile all terminals"
                  aria-pressed={grid}
                  disabled={localTerminals.length < 2}
                  onClick={() => {
                    setGrid((value) => !value);
                    setSplit(false);
                  }}
                >
                  Lưới
                </button>
                <button
                  title="Maximize terminal"
                  onClick={() => {
                    if (terminalWorkspace) {
                      openChat();
                      setMaximize(false);
                    } else setMaximize((value) => !value);
                  }}
                >
                  {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
                <button
                  title="Hide terminal"
                  onClick={() => {
                    setDock(false);
                    setMaximize(false);
                    if (terminalWorkspace) openChat();
                  }}
                >
                  <ChevronDown size={15} />
                </button>
              </div>
              {dock && (
                <div className="pinned-commands">
                  {runCommands.map((entry) => (
                    <div className="pinned-command" key={entry.id}>
                      <button
                        title={entry.command}
                        disabled={!project || busy}
                        onClick={() => void runPinnedCommand(entry)}
                      >
                        <kbd>⌘{entry.shortcut}</kbd> {entry.name}
                      </button>
                      <button
                        aria-label={`Remove ${entry.name}`}
                        onClick={() => void removeRunCommand(entry.id)}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                  {runCommandFormOpen ? (
                    <div className="pinned-command-form">
                      <input
                        autoFocus
                        placeholder="Tên (Dev)"
                        value={runCommandName}
                        onChange={(event) =>
                          setRunCommandName(event.target.value)
                        }
                      />
                      <input
                        placeholder="Lệnh shell (npm run dev)"
                        value={runCommandText}
                        onChange={(event) =>
                          setRunCommandText(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void createRunCommand();
                          if (event.key === "Escape")
                            setRunCommandFormOpen(false);
                        }}
                      />
                      <button
                        disabled={
                          !runCommandName.trim() || !runCommandText.trim()
                        }
                        onClick={() => void createRunCommand()}
                      >
                        <Check size={13} />
                      </button>
                    </div>
                  ) : (
                    runCommands.length < 9 && (
                      <button
                        title="Ghim lệnh mới"
                        disabled={!project}
                        onClick={() => setRunCommandFormOpen(true)}
                      >
                        <Plus size={13} />
                      </button>
                    )
                  )}
                </div>
              )}
              <div
                className={`terminal-content ${grid ? "tiled" : secondary ? "split" : ""}`}
                style={
                  grid
                    ? {
                        gridTemplateColumns: `repeat(${Math.min(3, Math.ceil(Math.sqrt(localTerminals.length)))}, minmax(0, 1fr))`,
                        gridTemplateRows: `repeat(${Math.ceil(localTerminals.length / Math.min(3, Math.ceil(Math.sqrt(localTerminals.length)))) || 1}, minmax(120px, 1fr))`,
                      }
                    : undefined
                }
              >
                {!localTerminals.length && (
                  <div className="terminal-empty">
                    <TerminalSquare size={22} />
                    <span>{t("terminalEmpty")}</span>
                    <button disabled={!project} onClick={addTerminal}>
                      {t("openTerminal")} <Plus size={14} />
                    </button>
                  </div>
                )}
                {terminals.map((item) => (
                  <Suspense
                    key={item.id}
                    fallback={
                      <div className="terminal-empty">
                        {t("terminalOpening")}
                      </div>
                    }
                  >
                    <Terminal
                      session={item}
                      visible={
                        item.root === project?.root &&
                        (grid ||
                          item.id === terminal?.id ||
                          item.id === secondary?.id)
                      }
                      active={item.id === terminal?.id && terminalEngaged}
                      onActivate={() => {
                        setTerminalEngaged(true);
                        setTerminalId(item.id);
                      }}
                      onError={setNotice}
                      onOpenFile={(root, path) =>
                        void openTerminalFileLink(root, path)
                      }
                      locale={state.preferences.locale}
                    />
                  </Suspense>
                ))}
              </div>
            </section>
            {!dock && (
              <button className="show-dock" onClick={() => setDock(true)}>
                <PanelBottom size={15} /> Hiện terminal
              </button>
            )}
          </main>
          <div
            className="resize-handle side inspector-resize"
            role="separator"
            aria-label="Resize inspector"
            onPointerDown={(event) => resize("inspector", event)}
          />
          <aside className="inspector" hidden>
            <div className="inspector-heading">
              <span>Workspace</span>
              <button
                title="Refresh Git"
                disabled={!project}
                onClick={() =>
                  void run(async () => {
                    if (project)
                      setGit(await window.studio.gitStatus(project.root));
                  })
                }
              >
                <RefreshCw size={14} />
              </button>
            </div>
            <section>
              <div className="section-label">PROJECT</div>
              <div className="card project-card">
                <Folder size={22} />
                <div>
                  <strong>{project?.name || "Chưa mở project"}</strong>
                  <small>{project?.root || "Chọn folder trên máy"}</small>
                </div>
              </div>
              <div className="project-facts">
                <span>
                  <GitBranch size={13} /> {git.branch || "—"}
                </span>
                <span>{git.changes.length} changes</span>
              </div>
            </section>
            <section>
              <div className="section-label">
                CHANGES <span className="count">{git.changes.length}</span>
              </div>
              {git.error ? (
                <p className="muted empty-small">{git.error}</p>
              ) : git.changes.length ? (
                <div className="changes-list">
                  {git.changes.map((change) => (
                    <button
                      key={change.path}
                      title={change.path}
                      onClick={() => void showDiff(change.path)}
                    >
                      <FileCode2 size={13} />
                      <span>{change.path}</span>
                      <code>{change.status.trim()}</code>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="empty-small">
                  {project ? "Không có thay đổi Git." : "Chưa có project."}
                </p>
              )}
            </section>
            <section>
              <div className="section-label">
                ACTIVITY{" "}
                <span className="live-label">
                  <Circle size={7} /> Runtime
                </span>
              </div>
              {chat?.events.length ? (
                <div className="activity-list">
                  {chat.events
                    .slice(-8)
                    .reverse()
                    .map((event, index) => (
                      <div key={index}>
                        <time>
                          {event.time
                            ? new Date(event.time).toLocaleTimeString("vi", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : ""}
                        </time>
                        <span>
                          {event.kind?.replaceAll("_", " ")}
                          <small>{event.tool || event.summary || ""}</small>
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="empty-small">
                  Chưa có sự kiện runtime. Không suy diễn tiến độ từ nội dung
                  chat hoặc terminal.
                </p>
              )}
            </section>
            <section className="authority-note">
              <Shield size={16} />
              <div>
                <strong>Human-governed</strong>
                <p>AI không sử dụng shell của anh để vượt qua phê duyệt.</p>
                {chat?.usage && (
                  <small>
                    Input {chat.usage.input.toLocaleString()} · Output{" "}
                    {chat.usage.output.toLocaleString()} tokens
                  </small>
                )}
              </div>
            </section>
          </aside>
          <WorkspaceInspector
            state={state}
            project={project}
            git={git}
            chat={chat}
            attachmentCount={(attachments[draftKey] || []).length}
            terminalCount={localTerminals.length}
            onState={setState}
            onError={setNotice}
            onRefresh={() => {
              if (project)
                void run(async () =>
                  setGit(await window.studio.gitStatus(project.root)),
                );
            }}
            onDiff={(path) => void showDiff(path)}
            onManageModels={() => setSurface("settings")}
          />
        </>
      </div>
      <footer className="statusbar">
        <span>
          <span className="brand-dot" /> Yana Studio <b>{state.version}</b>
        </span>
        <span>{state.platform}</span>
        <span className="status-right">
          {runsCount(chats)} AI đang chạy · {terminals.length} terminals
          <span className="dot blue" /> Local workspace
        </span>
      </footer>
      {notice && (
        <div className="toast" role="alert">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="Dismiss">
            <X size={15} />
          </button>
        </div>
      )}
      {palette && (
        <div className="modal-backdrop" onClick={() => setPalette(false)}>
          <div
            className="palette"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="palette-search">
              <Search size={19} />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Anh muốn làm gì?"
              />
              <kbd>ESC</kbd>
            </div>
            {commands
              .filter((command) =>
                command.label
                  .toLocaleLowerCase()
                  .includes(query.toLocaleLowerCase()),
              )
              .map((command) => (
                <button
                  key={command.label}
                  onClick={() => {
                    setPalette(false);
                    setQuery("");
                    void command.action();
                  }}
                >
                  <command.icon size={17} />
                  {command.label}
                  <ChevronRight size={14} />
                </button>
              ))}
          </div>
        </div>
      )}
      {diff && (
        <div
          className="modal-backdrop"
          onClick={() => {
            setDiff(null);
            setDiffCommentLine(null);
          }}
        >
          <div
            className="diff-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Git diff"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <GitCompareArrows size={16} />
              <strong>{diff.path}</strong>
              <button
                aria-label="Close diff"
                onClick={() => {
                  setDiff(null);
                  setDiffCommentLine(null);
                }}
              >
                <X size={17} />
              </button>
            </header>
            <pre>
              {diff.text.split("\n").map((line, index) => {
                const lineComments = diffComments.filter(
                  (comment) => comment.lineIndex === index,
                );
                return (
                  <div className="diff-line-group" key={index}>
                    <div
                      className={
                        "diff-line " +
                        (line.startsWith("+")
                          ? "added"
                          : line.startsWith("-")
                            ? "removed"
                            : line.startsWith("@@")
                              ? "diff-hunk"
                              : "")
                      }
                    >
                      <button
                        className="diff-comment-add"
                        title="Thêm comment vào dòng này"
                        disabled={!line.trim()}
                        onClick={() => {
                          setDiffCommentLine(index);
                          setDiffCommentText("");
                        }}
                      >
                        <Plus size={11} />
                      </button>
                      <span>{line || " "}</span>
                    </div>
                    {lineComments.map((comment) => (
                      <div className="diff-comment-card" key={comment.id}>
                        <p>{comment.text}</p>
                        <button
                          aria-label="Xóa comment"
                          onClick={() => void removeDiffComment(comment.id)}
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                    {diffCommentLine === index && (
                      <div className="diff-comment-form">
                        <textarea
                          autoFocus
                          value={diffCommentText}
                          placeholder="Ghi chú review cho dòng này…"
                          onChange={(event) =>
                            setDiffCommentText(event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.stopPropagation();
                              setDiffCommentLine(null);
                            }
                          }}
                        />
                        <div className="button-row">
                          <button
                            className="primary"
                            disabled={!diffCommentText.trim()}
                            onClick={() => void addDiffComment(index, line)}
                          >
                            <Check size={12} />
                          </button>
                          <button onClick={() => setDiffCommentLine(null)}>
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </pre>
          </div>
        </div>
      )}
      {closeConfirmOpen && opened && (
        <div
          className="modal-backdrop"
          onClick={() => setCloseConfirmOpen(false)}
        >
          <div
            className="card close-confirm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Lưu thay đổi trước khi đóng?</h3>
            <p>
              <code>{opened.path}</code> có thay đổi chưa lưu. Thay đổi sẽ mất
              nếu chọn “Không lưu”.
            </p>
            <div className="button-row">
              <button
                className="primary"
                onClick={() => void saveAndCloseFile()}
              >
                <Check size={14} /> Lưu
              </button>
              <button className="danger-button" onClick={discardAndCloseFile}>
                Không lưu
              </button>
              <button onClick={() => setCloseConfirmOpen(false)}>Hủy</button>
            </div>
          </div>
        </div>
      )}
      {attachPickerOpen && project && (
        <FilePicker
          root={project.root}
          title="Đính kèm file làm context…"
          onClose={() => setAttachPickerOpen(false)}
          onPick={(entry) => {
            setAttachPickerOpen(false);
            void attachFile(entry);
          }}
        />
      )}
      {quickOpen && project && (
        <FilePicker
          root={project.root}
          title="Mở file nhanh (⌘P)…"
          onClose={() => setQuickOpen(false)}
          onPick={(entry) => {
            setQuickOpen(false);
            void enterFile(entry);
          }}
        />
      )}
    </div>
  );
}
function runsCount(chats: Chat[]) {
  return chats.filter((chat) => chat.running).length;
}
createRoot(document.getElementById("root")!).render(<App />);
