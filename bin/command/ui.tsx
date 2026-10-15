import React, { useState, useEffect, useCallback, useMemo } from "react";
import type { CommandModule } from "yargs";
import chalk from "chalk";
import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard } from "@opentui/react";
import { gitCapture } from "../git.ts";
import { parseStatus } from "./status.ts";
import { parseCommits } from "./log.ts";
import { getGitRoot, getSubmodules } from "./submodule.ts";
import type { ParsedStatus, CommitInfo, SubmoduleInfo } from "../types.ts";

export interface FileItem {
  path: string;
  type: "staged" | "unstaged" | "untracked" | "conflict";
  statusText: string;
  code: string;
}

const COMMIT_TYPES = [
  { type: "feat", desc: "A new feature" },
  { type: "fix", desc: "A bug fix" },
  { type: "docs", desc: "Documentation only changes" },
  { type: "style", desc: "Code style changes (formatting, etc.)" },
  { type: "refactor", desc: "Refactoring code without changing behavior" },
  { type: "perf", desc: "Performance improvements" },
  { type: "test", desc: "Adding or updating tests" },
  { type: "build", desc: "Build system or dependency updates" },
  { type: "ci", desc: "CI configuration or workflow changes" },
  { type: "chore", desc: "Chores, maintenance, tooling" },
];

const TABS = [
  "1 Status & Staging",
  "2 Commit History",
  "3 Create Commit",
  "4 Submodules",
  "5 Help & Shortcuts",
];

function getFileDiff(gitRoot: string, file: FileItem | undefined): string {
  if (!file) return "";
  try {
    if (file.type === "staged") {
      const res = gitCapture(["diff", "--cached", "--stat", "--", file.path], { cwd: gitRoot });
      const diffRes = gitCapture(["diff", "--cached", "--", file.path], { cwd: gitRoot });
      return (res.stdout ? res.stdout.trim() + "\n\n" : "") + (diffRes.stdout?.slice(0, 1500) || "No diff output");
    }
    if (file.type === "unstaged") {
      const res = gitCapture(["diff", "--stat", "--", file.path], { cwd: gitRoot });
      const diffRes = gitCapture(["diff", "--", file.path], { cwd: gitRoot });
      return (res.stdout ? res.stdout.trim() + "\n\n" : "") + (diffRes.stdout?.slice(0, 1500) || "No diff output");
    }
    if (file.type === "untracked") {
      return `Untracked file: ${file.path}\n\nPress [Space] to stage this file.`;
    }
    return `Merge conflict in: ${file.path}\n\nPlease resolve conflicts manually.`;
  } catch {
    return "Failed to load diff.";
  }
}

function getCommitDetail(gitRoot: string, commit: CommitInfo | undefined): string {
  if (!commit) return "";
  try {
    const res = gitCapture(["show", "--stat", "--oneline", commit.hash], { cwd: gitRoot });
    return res.stdout?.slice(0, 1500) || commit.subject;
  } catch {
    return commit.subject;
  }
}

function renderDiffLines(diffText: string, maxLines = 14) {
  if (!diffText.trim()) {
    return (
      <box>
        <text fg="gray">No changes or preview available</text>
      </box>
    );
  }
  const lines = diffText.split("\n").slice(0, maxLines);
  return lines.map((line, idx) => {
    let color = "gray";
    if (line.startsWith("+")) color = "green";
    else if (line.startsWith("-")) color = "red";
    else if (line.startsWith("@@")) color = "cyan";
    else if (line.startsWith("commit ") || line.startsWith("Author:") || line.startsWith("Date:")) {
      color = "yellow";
    }
    return (
      <box key={idx}>
        <text fg={color}>{line || " "}</text>
      </box>
    );
  });
}

interface AppProps {
  gitRoot: string;
  onExit: () => void;
}

export function App({ gitRoot, onExit }: AppProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [status, setStatus] = useState<ParsedStatus | null>(null);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [submodules, setSubmodules] = useState<SubmoduleInfo[]>([]);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [selectedCommitIdx, setSelectedCommitIdx] = useState(0);
  const [selectedSubmoduleIdx, setSelectedSubmoduleIdx] = useState(0);
  const [statusMsg, setStatusMsg] = useState("⚡ katzu-git Ready");
  const [statusType, setStatusType] = useState<"info" | "success" | "error">("info");

  // Tab 3 Commit form state
  const [commitTypeIdx, setCommitTypeIdx] = useState(0);
  const [scope, setScope] = useState("");
  const [subject, setSubject] = useState("");
  const [isBreaking, setIsBreaking] = useState(false);
  const [stageAllOnCommit, setStageAllOnCommit] = useState(false);
  const [activeField, setActiveField] = useState<number>(0);

  const refreshState = useCallback(() => {
    try {
      const stRes = gitCapture(["status", "--porcelain=v1", "-b", "-u"], { cwd: gitRoot });
      if (stRes.status === 0 && stRes.stdout) {
        setStatus(parseStatus(stRes.stdout));
      }

      const logRes = gitCapture(
        ["log", "-n", "30", "--pretty=format:%h%x1f%an%x1f%ar%x1f%s%x1f%d"],
        { cwd: gitRoot },
      );
      if (logRes.status === 0 && logRes.stdout) {
        setCommits(parseCommits(logRes.stdout));
      }

      setSubmodules(getSubmodules(gitRoot));
    } catch (err: unknown) {
      setStatusMsg(`Error refreshing: ${(err as Error).message}`);
      setStatusType("error");
    }
  }, [gitRoot]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  const fileItems = useMemo<FileItem[]>(() => {
    if (!status) return [];
    const list: FileItem[] = [];
    for (const f of status.staged) {
      list.push({ path: f.path, type: "staged", statusText: "staged", code: f.code });
    }
    for (const f of status.unstaged) {
      list.push({ path: f.path, type: "unstaged", statusText: f.status, code: f.code });
    }
    for (const p of status.untracked) {
      list.push({ path: p, type: "untracked", statusText: "untracked", code: "??" });
    }
    for (const f of status.conflicts) {
      list.push({ path: f.path, type: "conflict", statusText: "conflict", code: f.code });
    }
    return list;
  }, [status]);

  const currentFile = fileItems[selectedFileIdx];
  const fileDiff = useMemo(() => getFileDiff(gitRoot, currentFile), [gitRoot, currentFile]);

  const currentCommit = commits[selectedCommitIdx];
  const commitDetail = useMemo(
    () => getCommitDetail(gitRoot, currentCommit),
    [gitRoot, currentCommit],
  );

  const toggleStageFile = useCallback(
    (file: FileItem) => {
      if (!file) return;
      if (file.type === "staged") {
        gitCapture(["restore", "--staged", "--", file.path], { cwd: gitRoot });
        setStatusMsg(`✓ Unstaged: ${file.path}`);
      } else {
        gitCapture(["add", "--", file.path], { cwd: gitRoot });
        setStatusMsg(`✓ Staged: ${file.path}`);
      }
      setStatusType("success");
      refreshState();
    },
    [gitRoot, refreshState],
  );

  const stageAll = useCallback(() => {
    gitCapture(["add", "-A"], { cwd: gitRoot });
    setStatusMsg("✓ Staged all changes");
    setStatusType("success");
    refreshState();
  }, [gitRoot, refreshState]);

  const unstageAll = useCallback(() => {
    gitCapture(["restore", "--staged", "."], { cwd: gitRoot });
    setStatusMsg("✓ Unstaged all changes");
    setStatusType("success");
    refreshState();
  }, [gitRoot, refreshState]);

  const pushChanges = useCallback(() => {
    setStatusMsg("🚀 Pushing changes to remote...");
    setStatusType("info");
    const res = gitCapture(["push"], { cwd: gitRoot });
    if (res.status === 0) {
      setStatusMsg("✓ Pushed to remote successfully");
      setStatusType("success");
    } else {
      setStatusMsg(`Push failed: ${res.stderr?.trim() || res.stdout?.trim() || "Unknown error"}`);
      setStatusType("error");
    }
    refreshState();
  }, [gitRoot, refreshState]);

  const syncSubmodules = useCallback(() => {
    setStatusMsg("📦 Synchronizing submodules...");
    setStatusType("info");
    const res = gitCapture(["submodule", "update", "--init", "--recursive"], { cwd: gitRoot });
    if (res.status === 0) {
      setStatusMsg("✓ Submodules synchronized successfully");
      setStatusType("success");
    } else {
      setStatusMsg(`Submodule sync failed: ${res.stderr?.trim() || "Unknown error"}`);
      setStatusType("error");
    }
    refreshState();
  }, [gitRoot, refreshState]);

  const doCommit = useCallback(() => {
    if (!subject.trim()) {
      setStatusMsg("Error: Commit subject cannot be empty");
      setStatusType("error");
      return;
    }

    if (stageAllOnCommit) {
      gitCapture(["add", "-A"], { cwd: gitRoot });
    }

    const type = COMMIT_TYPES[commitTypeIdx]?.type || "feat";
    const cleanScope = scope.trim();
    const breakMark = isBreaking ? "!" : "";
    const fullMsg = cleanScope
      ? `${type}<${cleanScope}>${breakMark}: ${subject.trim()}`
      : `${type}${breakMark}: ${subject.trim()}`;

    const res = gitCapture(["commit", "-m", fullMsg], { cwd: gitRoot });
    if (res.status === 0) {
      setStatusMsg(`✓ Committed: ${fullMsg}`);
      setStatusType("success");
      setSubject("");
      setScope("");
      setIsBreaking(false);
      setActiveTab(0);
      refreshState();
    } else {
      setStatusMsg(`Commit failed: ${res.stderr?.trim() || res.stdout?.trim() || "Check staging"}`);
      setStatusType("error");
    }
  }, [
    subject,
    stageAllOnCommit,
    commitTypeIdx,
    scope,
    isBreaking,
    gitRoot,
    refreshState,
  ]);

  const isTyping = activeTab === 2 && (activeField === 1 || activeField === 2);

  useKeyboard((e) => {
    if (e.name === "q" && !isTyping) {
      onExit();
      return;
    }

    if (e.name === "escape") {
      if (activeTab === 2 && isTyping) {
        setActiveField(0);
      } else {
        onExit();
      }
      return;
    }

    if (!isTyping) {
      if (e.name === "1") { setActiveTab(0); return; }
      if (e.name === "2") { setActiveTab(1); return; }
      if (e.name === "3") { setActiveTab(2); return; }
      if (e.name === "4") { setActiveTab(3); return; }
      if (e.name === "5") { setActiveTab(4); return; }
      if (e.name === "r") {
        refreshState();
        setStatusMsg("✓ Refreshed");
        setStatusType("success");
        return;
      }
      if (e.name === "p") {
        pushChanges();
        return;
      }
      if (e.name === "c") {
        setActiveTab(2);
        return;
      }
    }

    if (activeTab === 0) {
      if (e.name === "up" || e.name === "k") {
        setSelectedFileIdx((i) => (i > 0 ? i - 1 : Math.max(0, fileItems.length - 1)));
      } else if (e.name === "down" || e.name === "j") {
        setSelectedFileIdx((i) => (i < fileItems.length - 1 ? i + 1 : 0));
      } else if (e.name === "space" && currentFile) {
        toggleStageFile(currentFile);
      } else if (e.name === "a") {
        stageAll();
      } else if (e.name === "u") {
        unstageAll();
      } else if (e.name === "tab") {
        setActiveTab(1);
      }
    } else if (activeTab === 1) {
      if (e.name === "up" || e.name === "k") {
        setSelectedCommitIdx((i) => (i > 0 ? i - 1 : Math.max(0, commits.length - 1)));
      } else if (e.name === "down" || e.name === "j") {
        setSelectedCommitIdx((i) => (i < commits.length - 1 ? i + 1 : 0));
      } else if (e.name === "tab") {
        setActiveTab(2);
      }
    } else if (activeTab === 2) {
      if (activeField === 0) {
        if (e.name === "left" || e.name === "up") {
          setCommitTypeIdx((i) => (i > 0 ? i - 1 : COMMIT_TYPES.length - 1));
        } else if (e.name === "right" || e.name === "down") {
          setCommitTypeIdx((i) => (i < COMMIT_TYPES.length - 1 ? i + 1 : 0));
        } else if (e.name === "return" || e.name === "tab") {
          setActiveField(1);
        }
      } else if (activeField === 1) {
        if (e.name === "tab" || e.name === "return") {
          setActiveField(2);
        }
      } else if (activeField === 2) {
        if (e.name === "tab") {
          setActiveField(3);
        }
      } else if (activeField === 3) {
        if (e.name === "space") {
          setIsBreaking((b) => !b);
        } else if (e.name === "tab" || e.name === "down") {
          setActiveField(4);
        } else if (e.name === "up") {
          setActiveField(2);
        }
      } else if (activeField === 4) {
        if (e.name === "space") {
          setStageAllOnCommit((s) => !s);
        } else if (e.name === "tab" || e.name === "down") {
          setActiveField(5);
        } else if (e.name === "up") {
          setActiveField(3);
        }
      } else if (activeField === 5) {
        if (e.name === "return" || e.name === "space") {
          doCommit();
        } else if (e.name === "tab") {
          setActiveField(0);
        } else if (e.name === "up") {
          setActiveField(4);
        }
      }
    } else if (activeTab === 3) {
      if (e.name === "up" || e.name === "k") {
        setSelectedSubmoduleIdx((i) => (i > 0 ? i - 1 : Math.max(0, submodules.length - 1)));
      } else if (e.name === "down" || e.name === "j") {
        setSelectedSubmoduleIdx((i) => (i < submodules.length - 1 ? i + 1 : 0));
      } else if (e.name === "s") {
        syncSubmodules();
      } else if (e.name === "tab") {
        setActiveTab(4);
      }
    } else if (activeTab === 4) {
      if (e.name === "tab") {
        setActiveTab(0);
      }
    }
  });

  const previewCommitMsg = useMemo(() => {
    const type = COMMIT_TYPES[commitTypeIdx]?.type || "feat";
    const cleanScope = scope.trim();
    const breakMark = isBreaking ? "!" : "";
    const previewSubject = subject.trim() || "<commit message>";
    return cleanScope
      ? `${type}<${cleanScope}>${breakMark}: ${previewSubject}`
      : `${type}${breakMark}: ${previewSubject}`;
  }, [commitTypeIdx, scope, isBreaking, subject]);

  return (
    <box borderStyle="rounded" borderColor="blue" flexDirection="column" padding={1}>
      {/* Top Header */}
      <box flexDirection="column">
        <box flexDirection="row">
          <text fg="yellow"><b>⚡ katzu-git (kg)</b></text>
          <text fg="gray"> — Terminal User Interface</text>
        </box>
        <box flexDirection="row" marginTop={1}>
          <text fg="gray">Branch: </text>
          <text fg="green"><b>{status?.branch || "HEAD"}</b></text>
          {status?.upstream ? (
            <text fg="gray"> ➔ {status.upstream}</text>
          ) : null}
          {status && status.ahead > 0 ? (
            <text fg="cyan"> [↑{status.ahead}]</text>
          ) : null}
          {status && status.behind > 0 ? (
            <text fg="magenta"> [↓{status.behind}]</text>
          ) : null}
          {status ? (
            <text fg="gray">  |  {status.staged.length} staged • {status.unstaged.length} unstaged • {status.untracked.length} untracked</text>
          ) : null}
        </box>
      </box>

      {/* Tabs Header */}
      <box flexDirection="row" marginTop={1}>
        {TABS.map((tabTitle, idx) => {
          const isSelected = activeTab === idx;
          return (
            <box key={idx} marginRight={2}>
              <text fg={isSelected ? "cyan" : "gray"}>
                {isSelected ? <b><u>{`[${tabTitle}]`}</u></b> : `[${tabTitle}]`}
              </text>
            </box>
          );
        })}
      </box>

      {/* Tab Body */}
      <box
        borderStyle="single"
        borderColor="gray"
        flexDirection="column"
        marginTop={1}
        padding={1}
      >
        {/* Tab 0: Status & Staging */}
        {activeTab === 0 ? (
          <box flexDirection="column">
            {fileItems.length === 0 ? (
              <box flexDirection="column">
                <text fg="green"><b>✓ Working tree is clean. Nothing to commit.</b></text>
                <box marginTop={1}>
                  <text fg="gray">Press [c] to create commit, [p] to push, or [r] to refresh.</text>
                </box>
              </box>
            ) : (
              <box flexDirection="column">
                <box flexDirection="column">
                  <text fg="yellow"><b>Changed Files ({fileItems.length}):</b></text>
                  <box flexDirection="column" marginTop={1}>
                    {fileItems.slice(0, 10).map((file, idx) => {
                      const isSelected = selectedFileIdx === idx;
                      let statusBadge = "[~] modified: ";
                      let color = "yellow";
                      if (file.type === "staged") {
                        statusBadge = "[✓] staged:   ";
                        color = "green";
                      } else if (file.type === "untracked") {
                        statusBadge = "[?] untracked:";
                        color = "cyan";
                      } else if (file.type === "conflict") {
                        statusBadge = "[!] conflict: ";
                        color = "red";
                      }
                      return (
                        <box key={idx} flexDirection="row">
                          <text fg={isSelected ? "cyan" : "gray"}>
                            {isSelected ? <b> ▶ </b> : "   "}
                          </text>
                          <text fg={color}>
                            {isSelected ? <b>{`${statusBadge} ${file.path}`}</b> : `${statusBadge} ${file.path}`}
                          </text>
                        </box>
                      );
                    })}
                  </box>
                </box>

                {/* Diff Preview */}
                <box
                  borderStyle="single"
                  borderColor="gray"
                  flexDirection="column"
                  marginTop={1}
                  padding={1}
                >
                  <text fg="cyan">
                    <b>{`Preview: ${currentFile?.path || "No file selected"}`}</b>
                  </text>
                  <box flexDirection="column" marginTop={1}>
                    {renderDiffLines(fileDiff, 10)}
                  </box>
                </box>
              </box>
            )}
          </box>
        ) : null}

        {/* Tab 1: Commit History */}
        {activeTab === 1 ? (
          <box flexDirection="column">
            <text fg="yellow"><b>Recent Commits ({commits.length}):</b></text>
            {commits.length === 0 ? (
              <box marginTop={1}>
                <text fg="gray">No commits found in repository.</text>
              </box>
            ) : (
              <box flexDirection="column">
                <box flexDirection="column" marginTop={1}>
                  {commits.slice(0, 8).map((c, idx) => {
                    const isSelected = selectedCommitIdx === idx;
                    return (
                      <box key={idx} flexDirection="row">
                        <text fg={isSelected ? "cyan" : "gray"}>
                          {isSelected ? <b> ▶ </b> : "   "}
                        </text>
                        <text fg="yellow">{c.hash} </text>
                        <text fg={isSelected ? "white" : "gray"}>
                          {c.subject.slice(0, 45)}
                        </text>
                        <text fg="gray"> ({c.author}, {c.date})</text>
                      </box>
                    );
                  })}
                </box>
                <box
                  borderStyle="single"
                  borderColor="gray"
                  flexDirection="column"
                  marginTop={1}
                  padding={1}
                >
                  <text fg="cyan"><b>Commit Details:</b></text>
                  <box flexDirection="column" marginTop={1}>
                    {renderDiffLines(commitDetail, 8)}
                  </box>
                </box>
              </box>
            )}
          </box>
        ) : null}

        {/* Tab 2: Create Commit */}
        {activeTab === 2 ? (
          <box flexDirection="column">
            <text fg="yellow"><b>Create Conventional Commit</b></text>

            {/* Field 0: Type Selector */}
            <box flexDirection="row" marginTop={1}>
              <text fg={activeField === 0 ? "cyan" : "gray"}>
                {activeField === 0 ? <b>▶ Type: </b> : "  Type: "}
              </text>
              <text fg="green">
                <b>{COMMIT_TYPES[commitTypeIdx]?.type || "feat"}</b>
              </text>
              <text fg="gray">
                {` — ${COMMIT_TYPES[commitTypeIdx]?.desc || ""}`}
              </text>
              <text fg="gray"> (Use Left/Right to change, Enter to next)</text>
            </box>

            {/* Field 1: Scope */}
            <box flexDirection="row" marginTop={1}>
              <text fg={activeField === 1 ? "cyan" : "gray"}>
                {activeField === 1 ? <b>▶ Scope: </b> : "  Scope: "}
              </text>
              <input
                value={scope}
                placeholder="optional scope (e.g. cli, ui)"
                onChange={setScope}
                onSubmit={() => setActiveField(2)}
                focused={activeField === 1}
              />
            </box>

            {/* Field 2: Subject */}
            <box flexDirection="row" marginTop={1}>
              <text fg={activeField === 2 ? "cyan" : "gray"}>
                {activeField === 2 ? <b>▶ Subject: </b> : "  Subject: "}
              </text>
              <input
                value={subject}
                placeholder="commit message description"
                onChange={setSubject}
                onSubmit={() => setActiveField(3)}
                focused={activeField === 2}
              />
            </box>

            {/* Field 3: Breaking Change Toggle */}
            <box flexDirection="row" marginTop={1}>
              <text fg={activeField === 3 ? "cyan" : "gray"}>
                {activeField === 3 ? <b>▶ Breaking: </b> : "  Breaking: "}
              </text>
              <text fg={isBreaking ? "red" : "gray"}>
                <b>{isBreaking ? "[X] Breaking change (!)" : "[ ] Standard change"}</b>
              </text>
              <text fg="gray"> (Space to toggle)</text>
            </box>

            {/* Field 4: Stage all toggle */}
            <box flexDirection="row" marginTop={1}>
              <text fg={activeField === 4 ? "cyan" : "gray"}>
                {activeField === 4 ? <b>▶ Stage All: </b> : "  Stage All: "}
              </text>
              <text fg={stageAllOnCommit ? "green" : "gray"}>
                <b>{stageAllOnCommit ? "[X] Stage all changes before commit" : "[ ] Commit already staged changes only"}</b>
              </text>
              <text fg="gray"> (Space to toggle)</text>
            </box>

            {/* Live Message Preview */}
            <box
              borderStyle="single"
              borderColor="blue"
              flexDirection="column"
              marginTop={1}
              padding={1}
            >
              <text fg="cyan"><b>Commit Message Preview:</b></text>
              <box marginTop={1}>
                <text fg="yellow"><b>{previewCommitMsg}</b></text>
              </box>
            </box>

            {/* Field 5: Submit button */}
            <box marginTop={1}>
              <text
                fg={activeField === 5 ? "black" : "cyan"}
                bg={activeField === 5 ? "cyan" : undefined}
              >
                <b>{activeField === 5 ? " [ Press ENTER to Commit Now ] " : " [ Commit Now ] "}</b>
              </text>
            </box>
          </box>
        ) : null}

        {/* Tab 3: Submodules */}
        {activeTab === 3 ? (
          <box flexDirection="column">
            <text fg="yellow"><b>Git Submodules ({submodules.length}):</b></text>
            {submodules.length === 0 ? (
              <box marginTop={1}>
                <text fg="gray">No submodules configured in .gitmodules.</text>
              </box>
            ) : (
              <box flexDirection="column" marginTop={1}>
                {submodules.map((sm, idx) => {
                  const isSelected = selectedSubmoduleIdx === idx;
                  let prefixDesc = "✓ in sync";
                  let prefixColor = "green";
                  if (sm.statusPrefix === "+") {
                    prefixDesc = "modified";
                    prefixColor = "yellow";
                  } else if (sm.statusPrefix === "-") {
                    prefixDesc = "uninitialized";
                    prefixColor = "red";
                  } else if (sm.statusPrefix === "U") {
                    prefixDesc = "conflict";
                    prefixColor = "red";
                  }
                  return (
                    <box key={idx} flexDirection="column" marginTop={idx > 0 ? 1 : 0}>
                      <box flexDirection="row">
                        <text fg={isSelected ? "cyan" : "gray"}>
                          {isSelected ? <b> ▶ </b> : "   "}
                        </text>
                        <text fg="white"><b>{sm.path}</b></text>
                        <text fg={prefixColor}> ({prefixDesc})</text>
                      </box>
                      <box flexDirection="row" marginLeft={3}>
                        <text fg="gray">URL: {sm.url || "N/A"}  Branch: {sm.branch || "default"}</text>
                      </box>
                    </box>
                  );
                })}
              </box>
            )}
            <box marginTop={1}>
              <text fg="cyan">Press [s] to synchronize and initialize submodules, [r] to refresh.</text>
            </box>
          </box>
        ) : null}

        {/* Tab 4: Help & Shortcuts */}
        {activeTab === 4 ? (
          <box flexDirection="column">
            <text fg="yellow"><b>Keyboard Navigation & Shortcuts</b></text>
            <box flexDirection="column" marginTop={1}>
              <text fg="white">1 - 5       <span fg="gray">: Switch to corresponding tab directly</span></text>
              <text fg="white">Tab         <span fg="gray">: Cycle tabs forward / Next form field</span></text>
              <text fg="white">↑ / ↓ (k/j) <span fg="gray">: Navigate files, commits, and submodules</span></text>
              <text fg="white">Space       <span fg="gray">: Toggle stage/unstage file, or toggle checkbox</span></text>
              <text fg="white">a           <span fg="gray">: Stage all files in repository (git add -A)</span></text>
              <text fg="white">u           <span fg="gray">: Unstage all files (git restore --staged .)</span></text>
              <text fg="white">c           <span fg="gray">: Jump to Create Commit tab</span></text>
              <text fg="white">p           <span fg="gray">: Push current branch to remote (git push)</span></text>
              <text fg="white">s           <span fg="gray">: Synchronize submodules (in Submodules tab)</span></text>
              <text fg="white">r           <span fg="gray">: Refresh git status and log</span></text>
              <text fg="white">q / Esc     <span fg="gray">: Exit Terminal User Interface</span></text>
            </box>
          </box>
        ) : null}
      </box>

      {/* Status Bar */}
      <box flexDirection="row" marginTop={1}>
        <text
          fg={
            statusType === "success"
              ? "green"
              : statusType === "error"
              ? "red"
              : "cyan"
          }
        >
          <b>{statusMsg}</b>
        </text>
      </box>

      {/* Footer Navigation Bar */}
      <box flexDirection="row" marginTop={1}>
        <text fg="gray">
          [1-5] Tab • [↑↓] Move • [Space] Stage • [c] Commit • [p] Push • [r] Refresh • [q] Exit
        </text>
      </box>
    </box>
  );
}

export async function runTui(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log(chalk.yellow("Terminal UI requires an interactive TTY terminal."));
    return;
  }

  const gitRoot = getGitRoot();
  if (!gitRoot) {
    console.log(chalk.red("\nError: Not inside a git repository.\n"));
    return;
  }

  const renderer = await createCliRenderer();
  return new Promise<void>((resolve) => {
    let resolved = false;
    const handleExit = () => {
      if (!resolved) {
        resolved = true;
        renderer.destroy();
        resolve();
      }
    };
    createRoot(renderer).render(<App gitRoot={gitRoot} onExit={handleExit} />);
  });
}

export const uiCommand: CommandModule = {
  command: ["ui", "tui", "menu"],
  describe: "launch terminal UI dashboard",
  handler: async () => {
    await runTui();
  },
};
