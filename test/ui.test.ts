import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { uiCommand } from "../bin/command/ui.ts";
import { showHelp } from "../bin/command/help.ts";

const TEST_BASE_DIR = path.resolve("./.test-tmp-ui");

describe("Terminal UI", () => {
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

  test("uiCommand configuration has correct command aliases", () => {
    expect(uiCommand.command).toEqual(["ui", "tui", "menu"]);
    expect(uiCommand.describe).toContain("terminal UI");
  });

  test("showHelp output mentions ui command", () => {
    let captured = "";
    const origLog = console.log;
    console.log = (msg: string) => {
      captured += msg + "\n";
    };
    try {
      showHelp();
    } finally {
      console.log = origLog;
    }
    expect(captured).toContain("ui, tui, menu");
  });

  test("CLI commands (kg ui, kg tui) inform non-TTY environments cleanly", () => {
    const binScript = path.resolve("./bin/index.ts");

    const resUi = spawnSync("bun", ["run", binScript, "ui"], {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(resUi.status).toBe(0);
    expect(resUi.stdout).toContain("Terminal UI requires an interactive TTY terminal.");

    const resTui = spawnSync("bun", ["run", binScript, "tui"], {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(resTui.status).toBe(0);
    expect(resTui.stdout).toContain("Terminal UI requires an interactive TTY terminal.");
  });

  test("CLI with no args in non-TTY still prints argument notice and help", () => {
    const binScript = path.resolve("./bin/index.ts");
    const resNoArgs = spawnSync("bun", ["run", binScript], {
      cwd: repoDir,
      encoding: "utf-8",
    });
    expect(resNoArgs.status).toBe(0);
    expect(resNoArgs.stdout).toContain("There is no arguments inputing here..");
    expect(resNoArgs.stdout).toContain("Commands:");
  });
});
