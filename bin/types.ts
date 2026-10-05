export interface AddArgs {
  files?: string[];
}

export interface CommitArgs {
  type?: string;
  scope?: string;
  subject?: string[];
}

export interface PushArgs {
  args?: string[];
}

export interface StatusArgs {
  args?: string[];
  interactive?: boolean;
  i?: boolean;
  raw?: boolean;
}

export interface StatusFile {
  path: string;
  status: string;
  code: string;
}

export interface ParsedStatus {
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  staged: StatusFile[];
  unstaged: StatusFile[];
  untracked: string[];
  conflicts: StatusFile[];
  isClean: boolean;
}

export interface LogArgs {
  args?: string[];
  maxCount?: number;
  n?: number;
  interactive?: boolean;
  i?: boolean;
  stat?: boolean;
  graph?: boolean;
  g?: boolean;
  raw?: boolean;
  author?: string;
  grep?: string;
}

export interface CommitInfo {
  hash: string;
  author: string;
  date: string;
  subject: string;
  refs: string;
}

export interface SubmoduleArgs {
  action?: string;
  target?: string;
  extra?: string[];
  branch?: string;
  b?: string;
  url?: string;
  yes?: boolean;
  y?: boolean;
}

export interface SubmoduleInfo {
  name: string;
  path: string;
  url: string;
  branch?: string;
  commit?: string;
  statusPrefix?: string;
}

export interface PackageJson {
  name: string;
  version: string;
  description?: string;
  [key: string]: unknown;
}

export type CommitType =
  | "feat"
  | "fix"
  | "docs"
  | "style"
  | "refactor"
  | "perf"
  | "test"
  | "chore"
  | (string & {});
