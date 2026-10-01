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
