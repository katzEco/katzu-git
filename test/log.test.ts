import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  parseCommits,
  highlightSubject,
  displayLog,
} from "../bin/command/log.ts";

const TEST_BASE_DIR = path.resolve("./.test-tmp-log");

describe("Log Helper", () => {
  let repoDir: string;

  beforeEach(() => {
    rmSync(TEST_BASE_DIR, { recursive: true, force: true });
    mkdirSync(TEST_BASE_DIR, { recursive: true });

    repoDir = path.join(TEST_BASE_DIR, "test-repo");
    mkdirSync(repoDir, { recursive: true });
    spawnSync("git", ["init"], { cwd: repoDir });
    spawnSync("git", ["config", "user.name", "TestUser"], { cwd: repoDir });
    spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });

    writeFileSync(path.join(repoDir, "file1.txt"), "hello");
    spawnSync("git", ["add", "."], { cwd: repoDir });
    spawnSync("git", ["commit", "-m", "feat<core>: initial commit"], { cwd: repoDir });

    writeFileSync(path.join(repoDir, "file2.txt"), "world");
    spawnSync("git", ["add", "."], { cwd: repoDir });
    spawnSync("git", ["commit", "-m", "fix: resolve bug"], { cwd: repoDir });
  });

  afterEach(() => {
    rmSync(TEST_BASE_DIR, { recursive: true, force: true });
  });

  test("highlightSubject formats conventional commit types properly", () => {
    const featScoped = highlightSubject("feat<auth>: add login flow");
    expect(featScoped).toContain("feat");
    expect(featScoped).toContain("<auth>");
    expect(featScoped).toContain("add login flow");

    const fixPlain = highlightSubject("fix: resolve crash");
    expect(fixPlain).toContain("fix");
    expect(fixPlain).toContain("resolve crash");

    const plain = highlightSubject("simple untyped commit");
    expect(plain).toBe("simple untyped commit");
  });

  test("parseCommits parses delimited git output accurately", () => {
    const raw = [
      "abc1234\x1fAlice\x1f2 hours ago\x1ffeat<ui>: add modal\x1f (HEAD -> main)",
      "def5678\x1fBob\x1fyesterday\x1ffix: typo in readme\x1f",
    ].join("\n");

    const commits = parseCommits(raw);
    expect(commits.length).toBe(2);
    expect(commits[0]!.hash).toBe("abc1234");
    expect(commits[0]!.author).toBe("Alice");
    expect(commits[0]!.date).toBe("2 hours ago");
    expect(commits[0]!.subject).toBe("feat<ui>: add modal");
    expect(commits[0]!.refs).toBe("(HEAD -> main)");

    expect(commits[1]!.hash).toBe("def5678");
    expect(commits[1]!.author).toBe("Bob");
    expect(commits[1]!.refs).toBe("");
  });

  test("displayLog logs commits without throwing", () => {
    const raw = "abc1234\x1fAlice\x1f2 hours ago\x1ffeat: test\x1f";
    const commits = parseCommits(raw);
    expect(() => displayLog(commits)).not.toThrow();
    expect(() => displayLog([])).not.toThrow();
  });

  test("CLI commands (kg l, kg log) run properly via bin/index.ts", () => {
    const binScript = path.resolve("./bin/index.ts");

    // 1. kg l shows commits
    const resL = spawnSync("bun", ["run", binScript, "l"], {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(resL.status).toBe(0);
    expect(resL.stdout).toContain("Recent Commits");
    expect(resL.stdout).toContain("initial commit");
    expect(resL.stdout).toContain("resolve bug");

    // 2. kg l -n 1 limits count
    const resN = spawnSync("bun", ["run", binScript, "l", "-n", "1"], {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(resN.status).toBe(0);
    expect(resN.stdout).toContain("Recent Commits (1)");

    // 3. kg log --stat shows diffstat
    const resStat = spawnSync("bun", ["run", binScript, "log", "--stat"], {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(resStat.status).toBe(0);
    expect(resStat.stdout).toContain("file1.txt");

    // 4. kg l -g shows graph
    const resGraph = spawnSync("bun", ["run", binScript, "l", "-g"], {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(resGraph.status).toBe(0);
    expect(resGraph.stdout).toContain("*");
  });
});
