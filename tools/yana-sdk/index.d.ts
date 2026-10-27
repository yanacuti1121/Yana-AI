export interface SdkOptions {
  yanaRtBin?: string;
  cwd?: string;
}

export interface RewindOptions extends SdkOptions {
  file?: string;
  dryRun?: boolean;
}

export interface CompileSopOptions extends SdkOptions {
  vars?: string[];
  outDir?: string;
}

export interface BlindRubricOptions extends SdkOptions {
  diffBase?: string;
  dir?: string;
}

export interface MemoryDreamOptions extends SdkOptions {
  apply?: boolean;
}

export interface QueryOptions extends SdkOptions {
  prompt: string;
  provider?: string;
  model?: string;
  history?: Array<{ role: string; content: string }>;
  apiKey?: string;
}

export interface ResumeApprovalOptions extends SdkOptions {
  approvalId: string;
  decision: 'allow_once' | 'deny';
  decidedBy?: string;
  provider?: string;
  apiKey?: string;
}

export function resolveYanaRtBin(explicitBin?: string): string;
export function createCheckpoint(root: string, label?: string, opts?: SdkOptions): {
  capability: 'checkpoint.snapshot';
  id: number;
  label: string;
};
export function listCheckpoints(root: string, opts?: SdkOptions): {
  capability: 'checkpoint.list';
  checkpoints: Array<{ id: number; commit: string; label: string; created_at: string }>;
};
export function rewindFiles(root: string, checkpointId: number | string, opts?: RewindOptions): Record<string, unknown>;
export function workspaceRefresh(root: string, ignore?: string[], opts?: SdkOptions): Record<string, unknown>;
export function compileSop(file: string, opts?: CompileSopOptions): Record<string, unknown>;
export function blindRubric(specFile: string, opts?: BlindRubricOptions): Record<string, unknown>;
export function doctorHarness(dir?: string, opts?: SdkOptions): Record<string, unknown>;
export function memoryDream(opts?: MemoryDreamOptions): Record<string, unknown>;
export function graphWiki(dir?: string, outDir?: string, opts?: SdkOptions): Record<string, unknown>;
export function query(opts: QueryOptions): AsyncGenerator<Record<string, unknown>, void, unknown>;
export function resumeApproval(opts: ResumeApprovalOptions): AsyncGenerator<Record<string, unknown>, void, unknown>;
