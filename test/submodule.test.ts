import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  getGitRoot,
  getSubmodules,
  addSubmodule,
  deleteSubmodule,
  editSubmodule,
  listSubmodules,
  syncSubmodules,
} from "../bin/command/submodule.ts";

const TEST_BASE_DIR = path.resolve("./.test-tmp-submodule");

// Allow file protocol in tests for local test repositories
process.env.GIT_ALLOW_PROTOCOL = "file:http:https:ssh:git";

describe("Submodule Manager", () => {
  let mainRepoDir: string;
  let remoteRepoDir: string;

  beforeEach(() => {
    rmSync(TEST_BASE_DIR, { recursive: true, force: true });
    mkdirSync(TEST_BASE_DIR, { recursive: true });

    // 1. Create a remote repo to act as the submodule
    remoteRepoDir = path.join(TEST_BASE_DIR, "remote-lib");
    mkdirSync(remoteRepoDir, { recursive: true });
    spawnSync("git", ["init"], { cwd: remoteRepoDir });
    spawnSync("git", ["config", "user.name", "TestUser"], { cwd: remoteRepoDir });
    spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: remoteRepoDir });
    writeFileSync(path.join(remoteRepoDir, "lib.txt"), "hello submodule");
    spawnSync("git", ["add", "."], { cwd: remoteRepoDir });
    spawnSync("git", ["commit", "-m", "initial lib commit"], { cwd: remoteRepoDir });

    // 2. Create the main repo
    mainRepoDir = path.join(TEST_BASE_DIR, "main-repo");
    mkdirSync(mainRepoDir, { recursive: true });
    spawnSync("git", ["init"], { cwd: mainRepoDir });
    spawnSync("git", ["config", "user.name", "TestUser"], { cwd: mainRepoDir });
    spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: mainRepoDir });
    writeFileSync(path.join(mainRepoDir, "README.md"), "main repo");
    spawnSync("git", ["add", "."], { cwd: mainRepoDir });
    spawnSync("git", ["commit", "-m", "initial main commit"], { cwd: mainRepoDir });
  });

  afterEach(() => {
    rmSync(TEST_BASE_DIR, { recursive: true, force: true });
  });

  test("getSubmodules returns empty array when no submodules exist", () => {
    const list = getSubmodules(mainRepoDir);
    expect(list).toEqual([]);
  });

  test("addSubmodule adds and tracks a new submodule", async () => {
    // Enable protocol.file.allow in mainRepoDir config for local testing
    spawnSync("git", ["config", "protocol.file.allow", "always"], { cwd: mainRepoDir });

    // Add remoteRepoDir as submodule at 'packages/lib'
    await addSubmodule(mainRepoDir, remoteRepoDir, "packages/lib");

    const submodules = getSubmodules(mainRepoDir);
    expect(submodules.length).toBe(1);
    expect(submodules[0]!.path).toBe("packages/lib");
    expect(submodules[0]!.url).toBe(remoteRepoDir);
    expect(existsSync(path.join(mainRepoDir, "packages/lib", "lib.txt"))).toBe(true);
    expect(existsSync(path.join(mainRepoDir, ".gitmodules"))).toBe(true);
  });

  test("editSubmodule updates URL and branch", async () => {
    spawnSync("git", ["config", "protocol.file.allow", "always"], { cwd: mainRepoDir });
    await addSubmodule(mainRepoDir, remoteRepoDir, "packages/lib");

    // Edit URL
    const newUrl = "https://github.com/foo/new-lib.git";
    await editSubmodule(mainRepoDir, "packages/lib", { url: newUrl });

    let submodules = getSubmodules(mainRepoDir);
    expect(submodules[0]!.url).toBe(newUrl);

    // Edit branch
    await editSubmodule(mainRepoDir, "packages/lib", { branch: "develop" });
    submodules = getSubmodules(mainRepoDir);
    expect(submodules[0]!.branch).toBe("develop");
  });

  test("deleteSubmodule deinitializes, removes files, and cleans git modules", async () => {
    spawnSync("git", ["config", "protocol.file.allow", "always"], { cwd: mainRepoDir });
    await addSubmodule(mainRepoDir, remoteRepoDir, "packages/lib");

    expect(existsSync(path.join(mainRepoDir, "packages/lib"))).toBe(true);

    // Delete with skipConfirm: true
    await deleteSubmodule(mainRepoDir, "packages/lib", true);

    const submodules = getSubmodules(mainRepoDir);
    expect(submodules.length).toBe(0);
    expect(existsSync(path.join(mainRepoDir, "packages/lib"))).toBe(false);
    expect(existsSync(path.join(mainRepoDir, ".git", "modules", "packages/lib"))).toBe(false);
  });

  test("listSubmodules runs without throwing", async () => {
    spawnSync("git", ["config", "protocol.file.allow", "always"], { cwd: mainRepoDir });
    expect(() => listSubmodules(mainRepoDir)).not.toThrow();

    await addSubmodule(mainRepoDir, remoteRepoDir, "packages/lib");
    expect(() => listSubmodules(mainRepoDir)).not.toThrow();
  });

  test("syncSubmodules runs without error", async () => {
    spawnSync("git", ["config", "protocol.file.allow", "always"], { cwd: mainRepoDir });
    await addSubmodule(mainRepoDir, remoteRepoDir, "packages/lib");
    expect(() => syncSubmodules(mainRepoDir)).not.toThrow();
  });

  test("CLI commands (sm list, sm add, sm delete) run via index.ts", () => {
    const binScript = path.resolve("./bin/index.ts");

    // 1. kg sm list when empty
    const listRes = spawnSync("bun", ["run", binScript, "sm", "list"], {
      cwd: mainRepoDir,
      encoding: "utf-8",
    });
    expect(listRes.status).toBe(0);
    expect(listRes.stdout).toContain("No submodules found");

    // 2. kg sm add <url> [path]
    const addRes = spawnSync(
      "bun",
      ["run", binScript, "sm", "add", remoteRepoDir, "packages/cli-lib"],
      {
        cwd: mainRepoDir,
        encoding: "utf-8",
        env: { ...process.env, GIT_ALLOW_PROTOCOL: "file:http:https:ssh:git" },
      },
    );
    expect(addRes.status).toBe(0);
    expect(existsSync(path.join(mainRepoDir, "packages/cli-lib", "lib.txt"))).toBe(true);

    // 3. kg sm list when 1 submodule exists
    const listRes2 = spawnSync("bun", ["run", binScript, "sm", "list"], {
      cwd: mainRepoDir,
      encoding: "utf-8",
    });
    expect(listRes2.status).toBe(0);
    expect(listRes2.stdout).toContain("packages/cli-lib");

    // 4. kg sm delete <path> -y
    const delRes = spawnSync(
      "bun",
      ["run", binScript, "sm", "delete", "packages/cli-lib", "-y"],
      {
        cwd: mainRepoDir,
        encoding: "utf-8",
      },
    );
    expect(delRes.status).toBe(0);
    expect(existsSync(path.join(mainRepoDir, "packages/cli-lib"))).toBe(false);
  });
});
