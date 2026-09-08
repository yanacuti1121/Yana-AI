export type Project = { root: string; name: string };
export type Profile = { provider: string; model: string; baseUrl: string };
export type Layout = { sidebar: number; inspector: number; dock: number };
export type Preferences = { locale: "vi" | "ko" | "en" };
export type Locale = Preferences["locale"];
export type FileEntry = { name: string; path: string; directory: boolean };
export type FilePage = {
  entries: FileEntry[];
  offset: number;
  total: number;
  hasMore: boolean;
};
export type FileDocument = {
  text: string;
  revision: string;
  bytes: number;
  optimized: boolean;
  readOnly: boolean;
  truncated: boolean;
  offset: number;
  totalBytes: number;
};
export type LocalModelRuntime = {
  provider: string;
  name: string;
  endpoint: string;
  latencyMs: number;
  models: string[];
  status: "ready" | "offline";
  error: string;
};
export type ProviderCatalogEntry = {
  id: string;
  label: string;
  company: string;
  kind: "cloud" | "local" | "custom";
  requiresKey: boolean;
  envVar: string;
  defaultModel: string;
  baseUrl?: string;
  discoverable?: boolean;
  canonical: boolean;
  models: string[];
};
export type TerminalSession = { id: string; root: string; label: string };
export type RuntimeEvent = {
  type: string;
  kind?: string;
  time?: string;
  tool?: string;
  summary?: string;
  reason?: string;
  call_id?: string;
  ok?: boolean;
};
export type Chat = {
  id: string;
  root: string;
  title: string;
  messages: { role: "user" | "assistant"; content: string }[];
  events: RuntimeEvent[];
  running: boolean;
  error: string;
  approval: null | {
    approval_id: string;
    capability: string;
    reason: string;
    risk_tier?: "Low" | "Medium" | "High";
    access_mode?: "ReadOnly" | "Mutating";
    approver?: string;
  };
  profile?: Profile;
  usage?: { input: number; output: number };
};
export type GitState = {
  branch: string;
  changes: { status: string; path: string }[];
  worktrees: { root: string; branch: string }[];
  error: string;
};
export type State = {
  projects: Project[];
  chats: Chat[];
  profile: Profile;
  layout: Layout;
  preferences: Preferences;
  runtime: string;
  hasKey: boolean;
  configuredProviders: string[];
  providerCatalog: ProviderCatalogEntry[];
  credentialStorage: string;
  warning: string;
  version: string;
  platform: string;
  account: {
    configured: boolean;
    locked: boolean;
    mode: "none" | "local" | "google";
    email: string;
    displayName: string;
  };
};
export type DataOverview = {
  total_bytes: number;
  workspace: { files: number; bytes: number };
  credentials: { files: number; bytes: number };
  memory: { status: string; files: number; bytes: number };
  cache: { status: string; files: number; bytes: number };
};
export type SystemOverview = {
  capabilities: {
    name: string;
    description: string;
    accessMode: "ReadOnly" | "Mutating";
    riskTier: "Low" | "Medium" | "High";
    approval: "None" | "HumanApprovalPerCall";
    available: boolean;
  }[];
  runtime: {
    available: boolean;
    mcp: boolean;
    discord: boolean;
    error: string;
  };
  discord: {
    configured: boolean;
    channels: number;
    users: number;
    configPath: string;
    warning: string;
  };
  externalTools: {
    command: string;
    label: string;
    available: boolean;
    path: string;
  }[];
  commands: {
    source: string;
    commands: { category: string; command: string; description: string }[];
    error: string;
  };
  host: string;
};
export type Events = {
  "integrations:update": IntegrationConnection[];
  "terminal:data": { id: string; data: string; sequence: number };
  "terminal:exit": { id: string; exitCode: number };
  "chat:update": Chat;
  "host:notice": string;
};
declare global {
  interface Window {
    studio: {
      bootstrap(): Promise<State>;
      dataOverview(): Promise<DataOverview>;
      exportPortableData(): Promise<string | null>;
      choosePortableData(): Promise<State>;
      importPortableData(file: File): Promise<State>;
      accountCreateLocal(value: {
        email: string;
        displayName: string;
        password: string;
      }): Promise<State>;
      accountUseGoogle(): Promise<State>;
      accountUnlock(password: string): Promise<State>;
      accountLock(): Promise<State>;
      systemOverview(projectRoot: string): Promise<SystemOverview>;
      integrationList(): Promise<IntegrationConnection[]>;
      integrationConfigureGithub(
        clientId: string,
      ): Promise<IntegrationConnection[]>;
      integrationConnect(key: string): Promise<IntegrationConnection[]>;
      integrationCancel(key: string): Promise<void>;
      integrationDisconnect(key: string): Promise<IntegrationConnection[]>;
      integrationRevoke(key: string): Promise<IntegrationConnection[]>;
      openProject(): Promise<Project | null>;
      recentProject(root: string): Promise<Project>;
      listFiles(
        root: string,
        relative: string,
        options?: { offset?: number; limit?: number; query?: string },
      ): Promise<FilePage>;
      searchFiles(
        root: string,
        query: string,
        limit?: number,
      ): Promise<FileEntry[]>;
      readFile(root: string, relative: string): Promise<FileDocument>;
      readFileWindow(
        root: string,
        relative: string,
        offset: number,
      ): Promise<FileDocument>;
      saveFile(
        root: string,
        relative: string,
        text: string,
        revision: string,
      ): Promise<FileDocument>;
      gitStatus(root: string): Promise<GitState>;
      gitDiff(root: string, relative: string): Promise<string>;
      terminalCreate(root: string): Promise<TerminalSession>;
      terminalSubscribe(id: string): Promise<void>;
      terminalWrite(id: string, text: string): Promise<void>;
      terminalResize(id: string, cols: number, rows: number): Promise<void>;
      terminalAck(id: string, sequence: number): Promise<void>;
      terminalClose(id: string): Promise<boolean>;
      saveLayout(layout: Layout): Promise<Layout>;
      savePreferences(preferences: Preferences): Promise<State>;
      saveProfile(profile: Profile, key: string): Promise<State>;
      clearProviderKey(provider: string): Promise<State>;
      discoverModels(profile: Profile, key: string): Promise<string[]>;
      inspectLocalModels(): Promise<LocalModelRuntime[]>;
      chooseRuntime(): Promise<string | null>;
      newChat(root: string): Promise<Chat>;
      sendChat(id: string, task: string): Promise<boolean>;
      stopChat(id: string): Promise<boolean>;
      decideApproval(id: string, decision: boolean): Promise<boolean>;
      on<Key extends keyof Events>(
        channel: Key,
        callback: (event: Events[Key]) => void,
      ): () => void;
    };
  }
}
export type IntegrationConnection = {
  user_code?: string | null;
  key: string;
  provider: string;
  name: string;
  purpose: string;
  scopes: string[];
  status: string;
  enabled: boolean;
  setup?: string;
  error?: string;
  display_name?: string;
  email?: string;
  account_id?: string;
  secure_storage: boolean;
  expires_at?: number;
  created_at?: number;
  updated_at?: number;
};
