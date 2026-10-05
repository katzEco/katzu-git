import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import type { CommandModule } from "yargs";
import chalk from "chalk";
import { confirm, input, select } from "@inquirer/prompts";
import { gitCapture, gitIn } from "../git.ts";
import type { SubmoduleArgs, SubmoduleInfo } from "../types.ts";

export function getGitRoot(): string | null {
  const res = gitCapture(["rev-parse", "--show-toplevel"]);
  if (res.status === 0 && res.stdout) {
    return res.stdout.trim();
  }
  return null;
}

export function getSubmodules(gitRoot: string): SubmoduleInfo[] {
  const map = new Map<string, SubmoduleInfo>();

  const gitmodulesPath = path.join(gitRoot, ".gitmodules");
  if (existsSync(gitmodulesPath)) {
    const res = gitCapture(["config", "-f", ".gitmodules", "--list"], {
      cwd: gitRoot,
    });
    if (res.status === 0 && res.stdout) {
      for (const rawLine of res.stdout.split("\n")) {
        const line = rawLine.trim();
        if (!line) continue;
        const match = line.match(/^submodule\.(.+)\.(path|url|branch)=(.*)$/);
        if (!match || !match[1] || !match[2] || !match[3]) continue;
        const name = match[1];
        const key = match[2];
        const val = match[3];
        const item = map.get(name) || { name, path: "", url: "", branch: "" };
        if (key === "path") item.path = val;
        else if (key === "url") item.url = val;
        else if (key === "branch") item.branch = val;
        map.set(name, item);
      }
    }
  }

  const statusRes = gitCapture(["submodule", "status"], { cwd: gitRoot });
  if (statusRes.status === 0 && statusRes.stdout) {
    for (const rawLine of statusRes.stdout.split("\n")) {
      if (!rawLine.trim()) continue;
      const match = rawLine.match(
        /^([ +U-])([0-9a-fA-F]{40})\s+(\S+)(?:\s+\((.+)\))?$/,
      );
      if (match && match[1] && match[2] && match[3]) {
        const prefix = match[1];
        const commit = match[2];
        const subPath = match[3];
        const ref = match[4];
        let found = Array.from(map.values()).find((s) => s.path === subPath);
        if (!found) {
          found = { name: subPath, path: subPath, url: "" };
          map.set(subPath, found);
        }
        found.statusPrefix = prefix;
        found.commit = commit.slice(0, 7);
        if (ref && !found.branch) {
          found.branch = ref;
        }
      }
    }
  }

  return Array.from(map.values());
}

export async function addSubmodule(
  gitRoot: string,
  url?: string,
  destPath?: string,
  branch?: string,
) {
  let repoUrl = url?.trim();
  if (!repoUrl) {
    repoUrl = (
      await input({
        message: "Repository URL (HTTPS or SSH):",
        validate: (value) =>
          value.trim() ? true : "Repository URL cannot be empty",
      })
    ).trim();
  }

  const defaultDir = repoUrl
    .replace(/\.git$/, "")
    .replace(/\/+$/, "")
    .split(/[/:]/)
    .pop() || "";

  let targetPath = destPath?.trim();
  if (targetPath === undefined) {
    const promptPath = await input({
      message: `Destination path (press Enter for '${defaultDir}'):`,
      default: defaultDir,
    });
    targetPath = promptPath.trim() || defaultDir;
  }

  let trackBranch = branch?.trim();
  if (trackBranch === undefined && !url) {
    const promptBranch = await input({
      message: "Branch to track (optional, press Enter for default HEAD):",
    });
    trackBranch = promptBranch.trim() || undefined;
  }

  console.log(chalk.blue(`\nAdding submodule from ${chalk.bold(repoUrl)}...`));

  const addArgs = ["submodule", "add"];
  if (trackBranch) {
    addArgs.push("-b", trackBranch);
  }
  addArgs.push(repoUrl);
  if (targetPath) {
    addArgs.push(targetPath);
  }

  const result = gitIn(gitRoot, ...addArgs);
  if (result.status === 0) {
    const updateArgs = ["submodule", "update", "--init", "--recursive"];
    if (targetPath) {
      updateArgs.push(targetPath);
    }
    gitIn(gitRoot, ...updateArgs);
    console.log(
      chalk.green(
        `\n✓ Submodule added successfully at '${targetPath || defaultDir}'!`,
      ),
    );
  } else {
    console.log(chalk.red("\nFailed to add submodule."));
  }
}

export async function deleteSubmodule(
  gitRoot: string,
  targetPath?: string,
  skipConfirm?: boolean,
) {
  const submodules = getSubmodules(gitRoot);
  if (submodules.length === 0) {
    console.log(chalk.yellow("No submodules found in this repository."));
    return;
  }

  let subPath = targetPath?.trim();
  if (!subPath) {
    subPath = await select({
      message: "Select submodule to delete:",
      choices: submodules.map((s) => ({
        name: `${chalk.bold(s.path)} ${chalk.gray(`(${s.url || "no url"})`)}`,
        value: s.path,
      })),
    });
  }

  const sub = submodules.find((s) => s.path === subPath || s.name === subPath);
  const actualPath = sub?.path || subPath;
  const actualName = sub?.name || subPath;

  if (!skipConfirm) {
    const confirmed = await confirm({
      message: `Are you sure you want to delete submodule '${actualPath}'?`,
      default: false,
    });
    if (!confirmed) {
      console.log(chalk.gray("Deletion cancelled."));
      return;
    }
  }

  console.log(chalk.blue(`\nDeleting submodule '${actualPath}'...`));

  // 1. De-initialize
  gitIn(gitRoot, "submodule", "deinit", "-f", "--", actualPath);

  // 2. Remove from git tree
  gitIn(gitRoot, "rm", "-f", actualPath);

  // 3. Remove cached submodule directories in .git/modules
  const moduleDirs = [
    path.join(gitRoot, ".git", "modules", actualPath),
    path.join(gitRoot, ".git", "modules", actualName),
  ];
  for (const dir of moduleDirs) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // 4. Remove empty .gitmodules file if no submodules left
  const gitmodulesPath = path.join(gitRoot, ".gitmodules");
  if (existsSync(gitmodulesPath)) {
    const content = readFileSync(gitmodulesPath, "utf-8").trim();
    if (!content) {
      gitIn(gitRoot, "rm", "-f", ".gitmodules");
    }
  }

  console.log(
    chalk.green(`\n✓ Submodule '${actualPath}' successfully removed!`),
  );
}

export async function editSubmodule(
  gitRoot: string,
  targetPath?: string,
  options?: { url?: string; branch?: string },
) {
  const submodules = getSubmodules(gitRoot);
  if (submodules.length === 0) {
    console.log(chalk.yellow("No submodules found in this repository."));
    return;
  }

  let subPath = targetPath?.trim();
  if (!subPath) {
    subPath = await select({
      message: "Select submodule to edit:",
      choices: submodules.map((s) => ({
        name: `${chalk.bold(s.path)} ${chalk.gray(`(${s.url || "no url"})`)}`,
        value: s.path,
      })),
    });
  }

  const sub = submodules.find((s) => s.path === subPath || s.name === subPath);
  if (!sub) {
    console.log(chalk.red(`Submodule '${subPath}' not found.`));
    return;
  }
  const actualPath = sub.path;

  // Direct flag options
  if (options?.url) {
    console.log(chalk.blue(`Updating URL for submodule '${actualPath}'...`));
    gitIn(gitRoot, "submodule", "set-url", actualPath, options.url.trim());
    gitIn(gitRoot, "submodule", "sync", actualPath);
    console.log(
      chalk.green(`✓ Submodule URL updated to: ${options.url.trim()}`),
    );
    return;
  }

  if (options?.branch) {
    console.log(
      chalk.blue(`Updating tracking branch for submodule '${actualPath}'...`),
    );
    gitIn(
      gitRoot,
      "submodule",
      "set-branch",
      "--branch",
      options.branch.trim(),
      actualPath,
    );
    gitIn(gitRoot, "submodule", "update", "--remote", actualPath);
    console.log(
      chalk.green(
        `✓ Submodule tracking branch updated to: ${options.branch.trim()}`,
      ),
    );
    return;
  }

  // Interactive edit options
  const editChoice = await select({
    message: `Edit submodule ${chalk.bold(actualPath)}:`,
    choices: [
      {
        name: `🌐 Change URL ${chalk.gray(`(${sub.url || "none"})`)}`,
        value: "url",
      },
      {
        name: `🌿 Change Branch ${chalk.gray(`(${sub.branch || "HEAD"})`)}`,
        value: "branch",
      },
      {
        name: "📁 Rename / Move Path",
        value: "move",
      },
      {
        name: "🔄 Sync & Update to latest remote",
        value: "sync",
      },
      {
        name: "🚪 Cancel",
        value: "cancel",
      },
    ],
  });

  if (editChoice === "url") {
    const newUrl = await input({
      message: "New repository URL:",
      default: sub.url,
      validate: (v) => (v.trim() ? true : "URL cannot be empty"),
    });
    if (newUrl.trim() && newUrl.trim() !== sub.url) {
      console.log(chalk.blue(`\nUpdating URL to '${newUrl.trim()}'...`));
      gitIn(gitRoot, "submodule", "set-url", actualPath, newUrl.trim());
      gitIn(gitRoot, "submodule", "sync", actualPath);
      console.log(chalk.green(`✓ Submodule URL updated successfully!`));
    } else {
      console.log(chalk.gray("No changes made to URL."));
    }
  } else if (editChoice === "branch") {
    const newBranch = await input({
      message: "Branch to track (leave empty for default HEAD):",
      default: sub.branch || "",
    });
    const trimmed = newBranch.trim();
    if (trimmed) {
      gitIn(gitRoot, "submodule", "set-branch", "--branch", trimmed, actualPath);
      console.log(chalk.green(`✓ Tracking branch set to '${trimmed}'.`));
    } else {
      gitIn(gitRoot, "submodule", "set-branch", "--default", actualPath);
      console.log(
        chalk.green(`✓ Tracking branch reset to remote default (HEAD).`),
      );
    }
    const shouldUpdate = await confirm({
      message: "Update submodule to remote commit now?",
      default: true,
    });
    if (shouldUpdate) {
      console.log(chalk.blue(`Updating submodule...`));
      gitIn(gitRoot, "submodule", "update", "--remote", actualPath);
      console.log(chalk.green(`✓ Submodule updated to remote commit!`));
    }
  } else if (editChoice === "move") {
    const newPath = await input({
      message: "New submodule path:",
      default: actualPath,
      validate: (v) => (v.trim() ? true : "Path cannot be empty"),
    });
    const trimmedPath = newPath.trim();
    if (trimmedPath && trimmedPath !== actualPath) {
      const targetParent = path.dirname(path.resolve(gitRoot, trimmedPath));
      mkdirSync(targetParent, { recursive: true });

      const gitmodulesPath = path.join(gitRoot, ".gitmodules");
      if (existsSync(gitmodulesPath)) {
        gitIn(gitRoot, "add", ".gitmodules");
      }

      console.log(
        chalk.blue(
          `\nMoving submodule '${actualPath}' -> '${trimmedPath}'...`,
        ),
      );
      const mvResult = gitIn(gitRoot, "mv", actualPath, trimmedPath);
      if (mvResult.status === 0) {
        gitIn(gitRoot, "submodule", "sync");
        console.log(chalk.green(`✓ Submodule moved to '${trimmedPath}'!`));
      } else {
        console.log(chalk.red(`Failed to move submodule.`));
      }
    } else {
      console.log(chalk.gray("No changes made to path."));
    }
  } else if (editChoice === "sync") {
    console.log(
      chalk.blue(`\nSyncing and updating submodule '${actualPath}'...`),
    );
    gitIn(gitRoot, "submodule", "sync", actualPath);
    gitIn(gitRoot, "submodule", "update", "--init", "--recursive", "--remote", actualPath);
    console.log(
      chalk.green(`✓ Submodule '${actualPath}' synchronized and updated!`),
    );
  }
}

export function listSubmodules(gitRoot: string) {
  const submodules = getSubmodules(gitRoot);
  if (submodules.length === 0) {
    console.log(chalk.yellow("No submodules found in this repository."));
    return;
  }

  console.log(chalk.bold.yellow(`\nSubmodules (${submodules.length}):\n`));

  for (const s of submodules) {
    let statusText = chalk.green("✓ in sync");
    if (s.statusPrefix === "+") {
      statusText = chalk.yellow("+ modified / new commit");
    } else if (s.statusPrefix === "-") {
      statusText = chalk.red("- uninitialized");
    } else if (s.statusPrefix === "U") {
      statusText = chalk.bold.red("! merge conflict");
    }

    console.log(`  ${chalk.cyan("•")} ${chalk.bold.green(s.path)}`);
    console.log(
      `    ${chalk.gray("URL:")}    ${s.url || chalk.gray("(not configured)")}`,
    );
    if (s.branch) {
      console.log(`    ${chalk.gray("Branch:")} ${chalk.magenta(s.branch)}`);
    }
    if (s.commit) {
      console.log(
        `    ${chalk.gray("Commit:")} ${chalk.gray(s.commit)}  ${statusText}`,
      );
    }
    console.log("");
  }
}

export function syncSubmodules(gitRoot: string, targetPath?: string) {
  console.log(chalk.blue("\nSyncing submodules..."));
  const syncArgs = ["submodule", "sync", "--recursive"];
  if (targetPath) syncArgs.push(targetPath);
  gitIn(gitRoot, ...syncArgs);

  const updateArgs = ["submodule", "update", "--init", "--recursive"];
  if (targetPath) updateArgs.push(targetPath);
  gitIn(gitRoot, ...updateArgs);

  console.log(chalk.green("\n✓ Submodule(s) synchronized and updated!"));
}

export async function runInteractiveManager(gitRoot: string) {
  const action = await select({
    message:
      chalk.bold.cyan("Submodule Manager") + chalk.gray(" — Select an action:"),
    choices: [
      { name: "➕ Add submodule", value: "add" },
      { name: "✏️  Edit submodule", value: "edit" },
      { name: "🗑️  Delete submodule", value: "delete" },
      { name: "📋 List submodules", value: "list" },
      { name: "🔄 Sync / update submodules", value: "sync" },
      { name: "🚪 Exit", value: "exit" },
    ],
  });

  switch (action) {
    case "add":
      await addSubmodule(gitRoot);
      break;
    case "edit":
      await editSubmodule(gitRoot);
      break;
    case "delete":
      await deleteSubmodule(gitRoot);
      break;
    case "list":
      listSubmodules(gitRoot);
      break;
    case "sync":
      syncSubmodules(gitRoot);
      break;
    case "exit":
      break;
  }
}

export const submoduleCommand: CommandModule<{}, SubmoduleArgs> = {
  command: ["submodule [action] [target] [extra..]", "sub", "sm"],
  describe: "Manage git submodules (add, edit, delete, list, sync)",
  builder: (yargs) =>
    yargs
      .positional("action", {
        type: "string",
        describe: "Submodule action: add, edit, delete, list, sync",
      })
      .positional("target", {
        type: "string",
        describe: "Target URL or submodule path",
      })
      .positional("extra", {
        type: "string",
        array: true,
        describe: "Additional arguments (path, branch, etc.)",
      })
      .option("branch", {
        alias: "b",
        type: "string",
        describe: "Branch of submodule to track",
      })
      .option("url", {
        type: "string",
        describe: "New URL for submodule (edit)",
      })
      .option("yes", {
        alias: "y",
        type: "boolean",
        describe: "Skip confirmation prompts",
      }),
  handler: async (argv) => {
    const gitRoot = getGitRoot();
    if (!gitRoot) {
      console.log(chalk.red("Error: Not inside a git repository."));
      return;
    }

    try {
      const action = argv.action?.toLowerCase();
      const target = argv.target;
      const extra = argv.extra || [];
      const branch = argv.branch;
      const url = argv.url;
      const skipConfirm = argv.yes;

      if (!action) {
        await runInteractiveManager(gitRoot);
        return;
      }

      if (
        action.startsWith("http://") ||
        action.startsWith("https://") ||
        action.startsWith("git@") ||
        action.endsWith(".git")
      ) {
        await addSubmodule(gitRoot, action, target, branch);
        return;
      }

      switch (action) {
        case "a":
        case "add": {
          const subUrl = target;
          const subPath = extra[0];
          const subBranch = branch || extra[1];
          await addSubmodule(gitRoot, subUrl, subPath, subBranch);
          break;
        }
        case "d":
        case "del":
        case "delete":
        case "rm":
        case "remove": {
          const subPath = target;
          await deleteSubmodule(gitRoot, subPath, skipConfirm);
          break;
        }
        case "e":
        case "edit":
        case "modify": {
          const subPath = target;
          await editSubmodule(gitRoot, subPath, { url, branch });
          break;
        }
        case "l":
        case "ls":
        case "list":
        case "status": {
          listSubmodules(gitRoot);
          break;
        }
        case "u":
        case "up":
        case "sync":
        case "update": {
          const subPath = target;
          syncSubmodules(gitRoot, subPath);
          break;
        }
        default: {
          console.log(chalk.red(`Unknown submodule action: '${argv.action}'\n`));
          console.log(
            chalk.gray(
              "Available actions:\n" +
                "  • add [url] [path] [-b branch]   Add a new submodule\n" +
                "  • edit [path] [--url] [--branch] Edit an existing submodule\n" +
                "  • delete [path] [-y]             Remove a submodule\n" +
                "  • list                           List all submodules\n" +
                "  • sync [path]                    Sync & update submodules\n",
            ),
          );
          break;
        }
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== "ExitPromptError") {
        throw err;
      }
      console.log(chalk.gray("\nOperation cancelled."));
    }
  },
};
