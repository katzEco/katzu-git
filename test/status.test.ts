import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseStatus, displayStatus } from "../bin/command/status.ts";

const TEST_BASE_DIR = path.resolve("./.test-tmp-status");

describe("Status Helper", () => {
  let repoDir: string;

  beforeEach(() => {
    rmSync(TEST_BASE_DIR, { recursive: true, force: true });
    mkdirSync(TEST_BASE_DIR, { recursive: true });

    repoDir = path.join(TEST_BASE_DIR, "test-repo");
    mkdirSync(repoDir, { recursive: true });
    spawnSync("git", ["init"], { cwd: repoDir });
    spawnSync("git", ["config", "user.name", "TestUser"], { cwd: repoDir });
    spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
    writeFileSync(path.join(repoDir, "initial.txt"), "hello world");
    spawnSync("git", ["add", "."], { cwd: repoDir });
    spawnSync("git", ["commit", "-m", "init"], { cwd: repoDir });
  });

  afterEach(() => {
    rmSync(TEST_BASE_DIR, { recursive: true, force: true });
  });

  test("parseStatus accurately parses branch with upstream, ahead, behind, and files", () => {
    const raw = [
      "## main...origin/main [ahead 3, behind 1]",
      "M  staged.txt",
      "A  new-staged.txt",
      " M modified.txt",
      " D deleted.txt",
      "?? untracked.txt",
      "UU conflict.txt",
    ].join("\n");

    const parsed = parseStatus(raw);

    expect(parsed.branch).toBe("main");
    expect(parsed.upstream).toBe("origin/main");
    expect(parsed.ahead).toBe(3);
    expect(parsed.behind).toBe(1);
    expect(parsed.isClean).toBe(false);

    expect(parsed.staged.length).toBe(2);
    expect(parsed.staged[0]!.path).toBe("staged.txt");
    expect(parsed.staged[0]!.status).toBe("modified");
    expect(parsed.staged[1]!.path).toBe("new-staged.txt");
    expect(parsed.staged[1]!.status).toBe("new file");

    expect(parsed.unstaged.length).toBe(2);
    expect(parsed.unstaged[0]!.path).toBe("modified.txt");
    expect(parsed.unstaged[1]!.path).toBe("deleted.txt");

    expect(parsed.untracked).toEqual(["untracked.txt"]);
    expect(parsed.conflicts.length).toBe(1);
    expect(parsed.conflicts[0]!.path).toBe("conflict.txt");
  });

  test("parseStatus handles clean working tree", () => {
    const raw = "## main\n";
    const parsed = parseStatus(raw);

    expect(parsed.branch).toBe("main");
    expect(parsed.ahead).toBe(0);
    expect(parsed.behind).toBe(0);
    expect(parsed.isClean).toBe(true);
    expect(parsed.staged).toEqual([]);
    expect(parsed.unstaged).toEqual([]);
    expect(parsed.untracked).toEqual([]);
  });

  test("displayStatus logs formatted output without errors", () => {
    const parsedClean = parseStatus("## main\n");
    expect(() => displayStatus(parsedClean)).not.toThrow();

    const parsedDirty = parseStatus(
      "## feature...origin/feature [ahead 1]\nM  file1.txt\n M file2.txt\n?? new.txt\n",
    );
    expect(() => displayStatus(parsedDirty)).not.toThrow();
  });

  test("CLI commands (kg s, kg st, kg status) run properly via bin/index.ts", () => {
    const binScript = path.resolve("./bin/index.ts");

    // 1. kg s on clean repo
    const resS = spawnSync("bun", ["run", binScript, "s"], {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(resS.status).toBe(0);
    expect(resS.stdout).toContain("Working tree is clean");

    // 2. Modify a file and run kg st
    writeFileSync(path.join(repoDir, "initial.txt"), "modified content");
    const resSt = spawnSync("bun", ["run", binScript, "st"], {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(resSt.status).toBe(0);
    expect(resSt.stdout).toContain("Changes not staged for commit");
    expect(resSt.stdout).toContain("initial.txt");

    // 3. Stage the file and test kg status
    spawnSync("git", ["add", "."], { cwd: repoDir });
    const resStatus = spawnSync("bun", ["run", binScript, "status"], {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(resStatus.status).toBe(0);
    expect(resStatus.stdout).toContain("Changes to be committed");

    // 4. Test git status pass-through flag (-s)
    const resShort = spawnSync("bun", ["run", binScript, "s", "-s"], {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(resShort.status).toBe(0);
    expect(resShort.stdout).toContain("M  initial.txt");
  });
});
