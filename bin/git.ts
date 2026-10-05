import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
} from "node:child_process";

export const git = (...gitArgs: string[]) =>
  spawnSync("git", gitArgs, { stdio: "inherit" });

export const gitIn = (cwd: string, ...gitArgs: string[]) =>
  spawnSync("git", gitArgs, { stdio: "inherit", cwd });

export const gitCapture = (
  gitArgs: string[],
  options?: Omit<SpawnSyncOptionsWithStringEncoding, "encoding">,
) => spawnSync("git", gitArgs, { encoding: "utf-8", ...options });
