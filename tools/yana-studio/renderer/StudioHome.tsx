import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Files,
  FolderOpen,
  GitBranch,
  LayoutTemplate,
  ListTodo,
  MessageSquare,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import type {
  Chat,
  GitState,
  Locale,
  Project,
  State,
  TerminalSession,
} from "./types";

type HomeCopy = {
  eyebrow: string;
  greeting: { morning: string; afternoon: string; evening: string };
  intro: string;
  noProject: string;
  openProject: string;
  openProjectHint: string;
  workspace: string;
  noWorkspace: string;
  activity: string;
  quickStart: string;
  recentProjects: string;
  noRecentProjects: string;
  runtimeReady: string;
  runtimeNeeded: string;
  branch: string;
  changes: string;
  conversations: string;
  terminals: string;
  cleanWorkspace: string;
  needsAttention: string;
  actions: {
    chat: { label: string; description: string };
    files: { label: string; description: string };
    design: { label: string; description: string };
    tasks: { label: string; description: string };
  };
};

const copy: Record<Locale, HomeCopy> = {
  vi: {
    eyebrow: "YANA STUDIO · LOCAL WORKSPACE",
    greeting: {
      morning: "Chào buổi sáng",
      afternoon: "Chào buổi chiều",
      evening: "Chào buổi tối",
    },
    intro:
      "Mở một project, giữ ngữ cảnh liền mạch và biến ý tưởng thành thay đổi có kiểm soát.",
    noProject: "Bắt đầu bằng một project thật.",
    openProject: "Mở Workspace",
    openProjectHint:
      "Chọn thư mục để Yana đọc cấu trúc, Git và ngữ cảnh làm việc.",
    workspace: "Workspace hiện tại",
    noWorkspace: "Chưa có project nào đang mở",
    activity: "Nhịp làm việc",
    quickStart: "Bắt đầu nhanh",
    recentProjects: "Project gần đây",
    noRecentProjects: "Những project anh mở sẽ xuất hiện tại đây.",
    runtimeReady: "Runtime đã sẵn sàng",
    runtimeNeeded: "Cần chọn runtime",
    branch: "Nhánh Git",
    changes: "Thay đổi",
    conversations: "Cuộc trò chuyện",
    terminals: "Terminal",
    cleanWorkspace: "Workspace sạch",
    needsAttention: "Cần xem lại",
    actions: {
      chat: {
        label: "Trò chuyện",
        description: "Bắt đầu một phiên AI có ngữ cảnh",
      },
      files: {
        label: "Tệp & Editor",
        description: "Đọc, so sánh và chỉnh sửa mã",
      },
      design: {
        label: "Design Canvas",
        description: "Phác giao diện trước khi code",
      },
      tasks: {
        label: "Tasks",
        description: "Theo dõi việc đang mở và bước tiếp theo",
      },
    },
  },
  en: {
    eyebrow: "YANA STUDIO · LOCAL WORKSPACE",
    greeting: {
      morning: "Good morning",
      afternoon: "Good afternoon",
      evening: "Good evening",
    },
    intro:
      "Open a real project, keep its context continuous, and turn ideas into governed changes.",
    noProject: "Start with a real project.",
    openProject: "Open Workspace",
    openProjectHint:
      "Choose a folder so Yana can read its structure, Git state, and working context.",
    workspace: "Current workspace",
    noWorkspace: "No project is open yet",
    activity: "Working pulse",
    quickStart: "Quick start",
    recentProjects: "Recent projects",
    noRecentProjects: "Projects you open will appear here.",
    runtimeReady: "Runtime ready",
    runtimeNeeded: "Choose a runtime",
    branch: "Git branch",
    changes: "Changes",
    conversations: "Conversations",
    terminals: "Terminals",
    cleanWorkspace: "Workspace clean",
    needsAttention: "Needs review",
    actions: {
      chat: { label: "Chat", description: "Start a context-aware AI session" },
      files: {
        label: "Files & Editor",
        description: "Read, compare, and edit source",
      },
      design: {
        label: "Design Canvas",
        description: "Shape an interface before code",
      },
      tasks: { label: "Tasks", description: "Track open work and next steps" },
    },
  },
  ko: {
    eyebrow: "YANA STUDIO · LOCAL WORKSPACE",
    greeting: {
      morning: "좋은 아침입니다",
      afternoon: "좋은 오후입니다",
      evening: "좋은 저녁입니다",
    },
    intro:
      "실제 프로젝트를 열고, 문맥을 이어가며, 아이디어를 통제된 변경으로 만드세요.",
    noProject: "실제 프로젝트로 시작하세요.",
    openProject: "워크스페이스 열기",
    openProjectHint:
      "폴더를 선택하면 Yana가 구조, Git 상태와 작업 문맥을 읽습니다.",
    workspace: "현재 워크스페이스",
    noWorkspace: "열려 있는 프로젝트가 없습니다",
    activity: "작업 흐름",
    quickStart: "빠른 시작",
    recentProjects: "최근 프로젝트",
    noRecentProjects: "열었던 프로젝트가 여기에 표시됩니다.",
    runtimeReady: "런타임 준비됨",
    runtimeNeeded: "런타임을 선택하세요",
    branch: "Git 브랜치",
    changes: "변경 사항",
    conversations: "대화",
    terminals: "터미널",
    cleanWorkspace: "워크스페이스가 깨끗합니다",
    needsAttention: "검토 필요",
    actions: {
      chat: { label: "채팅", description: "문맥 기반 AI 세션을 시작하세요" },
      files: {
        label: "파일 및 편집기",
        description: "소스를 읽고 비교하고 편집하세요",
      },
      design: {
        label: "Design Canvas",
        description: "코드 전에 인터페이스를 설계하세요",
      },
      tasks: {
        label: "작업",
        description: "열린 작업과 다음 단계를 확인하세요",
      },
    },
  },
};

type StudioHomeProps = {
  state: State;
  project: Project | null;
  git: GitState;
  chats: Chat[];
  terminals: TerminalSession[];
  onOpenProject: () => void;
  onSelectProject: (project: Project) => void;
  onOpenChat: () => void;
  onOpenFiles: () => void;
  onOpenDesign: () => void;
  onOpenTasks: () => void;
};

function greetingKey(date: Date): "morning" | "afternoon" | "evening" {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export function StudioHome({
  state,
  project,
  git,
  chats,
  terminals,
  onOpenProject,
  onSelectProject,
  onOpenChat,
  onOpenFiles,
  onOpenDesign,
  onOpenTasks,
}: StudioHomeProps) {
  const [now, setNow] = useState(() => new Date());
  const text = copy[state.preferences.locale];
  const hasProject = Boolean(project);
  const localChats = chats.filter((item) => item.root === project?.root);
  const localTerminals = terminals.filter(
    (item) => item.root === project?.root,
  );
  const changedFiles = git.changes.length;
  const displayName = state.account.displayName || "Yana";
  const greeting = text.greeting[greetingKey(now)];
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(
        state.preferences.locale === "ko"
          ? "ko-KR"
          : state.preferences.locale === "vi"
            ? "vi-VN"
            : "en-US",
        { weekday: "long", month: "long", day: "numeric" },
      ).format(now),
    [now, state.preferences.locale],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const actions = [
    {
      key: "chat",
      icon: MessageSquare,
      onClick: onOpenChat,
      disabled: !hasProject,
    },
    { key: "files", icon: Files, onClick: onOpenFiles, disabled: !hasProject },
    {
      key: "design",
      icon: LayoutTemplate,
      onClick: onOpenDesign,
      disabled: !hasProject,
    },
    {
      key: "tasks",
      icon: ListTodo,
      onClick: onOpenTasks,
      disabled: !hasProject,
    },
  ] as const;

  return (
    <div className="studio-home" data-testid="studio-home">
      <section className="studio-home-hero">
        <div
          className="studio-home-orb studio-home-orb-one"
          aria-hidden="true"
        />
        <div
          className="studio-home-orb studio-home-orb-two"
          aria-hidden="true"
        />
        <div className="studio-home-hero-copy">
          <p className="studio-home-eyebrow">{text.eyebrow}</p>
          <h1>
            {greeting}, <span>{displayName}</span>
          </h1>
          <p>{hasProject ? text.intro : text.noProject}</p>
          <div className="studio-home-hero-meta">
            <span>
              <Sparkles size={14} />{" "}
              {state.runtime ? text.runtimeReady : text.runtimeNeeded}
            </span>
            <span>{date}</span>
          </div>
        </div>
        <div className="studio-home-hero-action">
          <button className="primary studio-home-open" onClick={onOpenProject}>
            <FolderOpen size={17} /> {text.openProject}
            <ArrowUpRight size={15} />
          </button>
          <small>{text.openProjectHint}</small>
        </div>
      </section>

      <section className="studio-home-grid">
        <article className="studio-home-panel studio-home-workspace">
          <div className="studio-home-panel-heading">
            <div>
              <span className="studio-home-kicker">{text.workspace}</span>
              <h2>{project?.name || text.noWorkspace}</h2>
            </div>
            <FolderOpen size={20} />
          </div>
          {project ? (
            <>
              <p className="studio-home-path">{project.root}</p>
              <div className="studio-home-status-row">
                <span>
                  <GitBranch size={14} /> {git.branch || "Local"}
                </span>
                <span className={changedFiles ? "attention" : "success"}>
                  {changedFiles ? (
                    <Sparkles size={14} />
                  ) : (
                    <CheckCircle2 size={14} />
                  )}
                  {changedFiles
                    ? `${changedFiles} ${text.changes.toLowerCase()}`
                    : text.cleanWorkspace}
                </span>
              </div>
            </>
          ) : (
            <div className="studio-home-empty-workspace">
              <p>{text.openProjectHint}</p>
              <button onClick={onOpenProject}>
                <FolderOpen size={15} /> {text.openProject}
              </button>
            </div>
          )}
        </article>

        <article className="studio-home-panel studio-home-activity">
          <div className="studio-home-panel-heading">
            <div>
              <span className="studio-home-kicker">{text.activity}</span>
              <h2>{project?.name || "Yana Studio"}</h2>
            </div>
            <TerminalSquare size={20} />
          </div>
          <div className="studio-home-metrics">
            <div>
              <strong>{git.branch || "—"}</strong>
              <span>{text.branch}</span>
            </div>
            <div>
              <strong>{changedFiles}</strong>
              <span>{text.changes}</span>
            </div>
            <div>
              <strong>{localChats.length}</strong>
              <span>{text.conversations}</span>
            </div>
            <div>
              <strong>{localTerminals.length}</strong>
              <span>{text.terminals}</span>
            </div>
          </div>
          <div className="studio-home-activity-note">
            <span className={changedFiles ? "attention-dot" : "ready-dot"} />
            {changedFiles ? text.needsAttention : text.cleanWorkspace}
          </div>
        </article>
      </section>

      <section className="studio-home-section">
        <div className="studio-home-section-heading">
          <div>
            <span className="studio-home-kicker">{text.quickStart}</span>
            <h2>{project ? project.name : "Yana Studio"}</h2>
          </div>
          <span>{hasProject ? text.intro : text.openProjectHint}</span>
        </div>
        <div className="studio-home-actions">
          {actions.map((action) => {
            const Icon = action.icon;
            const detail = text.actions[action.key];
            return (
              <button
                className="studio-home-action"
                disabled={action.disabled}
                key={action.key}
                onClick={action.onClick}
              >
                <span className="studio-home-action-icon">
                  <Icon size={20} />
                </span>
                <span>
                  <strong>{detail.label}</strong>
                  <small>{detail.description}</small>
                </span>
                <ArrowUpRight size={15} />
              </button>
            );
          })}
        </div>
      </section>

      <section className="studio-home-section studio-home-recent-section">
        <div className="studio-home-section-heading">
          <div>
            <span className="studio-home-kicker">{text.recentProjects}</span>
            <h2>{state.projects.length}</h2>
          </div>
          <button className="studio-home-text-action" onClick={onOpenProject}>
            <FolderOpen size={14} /> {text.openProject}
          </button>
        </div>
        {state.projects.length ? (
          <div className="studio-home-recents">
            {state.projects.slice(0, 6).map((item) => (
              <button
                className={item.root === project?.root ? "current" : ""}
                key={item.root}
                onClick={() => onSelectProject(item)}
                title={item.root}
              >
                <FolderOpen size={16} />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.root}</small>
                </span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
        ) : (
          <div className="studio-home-empty">{text.noRecentProjects}</div>
        )}
      </section>
    </div>
  );
}
