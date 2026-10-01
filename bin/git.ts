import { spawnSync } from "node:child_process";

export const git = (...gitArgs: string[]) =>
  spawnSync("git", gitArgs, { stdio: "inherit" });
