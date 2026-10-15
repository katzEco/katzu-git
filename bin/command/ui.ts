import type { CommandModule } from "yargs";
import chalk from "chalk";
import { select } from "@inquirer/prompts";
import { git, gitCapture } from "../git.ts";
import { parseStatus, runInteractiveStatus } from "./status.ts";
import { parseCommits, runInteractiveLog } from "./log.ts";
import { runInteractiveCommit } from "./commit.ts";
import { getGitRoot, runInteractiveManager } from "./submodule.ts";

export async function runTui(): Promise<void> {
  if (!process.stdin.isTTY) {
    console.log(chalk.yellow("Terminal UI requires an interactive TTY terminal."));
    return;
  }

  const gitRoot = getGitRoot();
  if (!gitRoot) {
    console.log(chalk.red("\nError: Not inside a git repository.\n"));
    return;
  }

  while (true) {
    const res = gitCapture(["status", "--porcelain=v1", "-b", "-u"], {
      cwd: gitRoot,
    });
    if (res.status !== 0) {
      console.log(chalk.red("\nError: Failed to get repository status.\n"));
      return;
    }

    const status = parseStatus(res.stdout || "");

    console.log(
      chalk.bold.yellow("\n⚡ katzu's Lazy git (kg)") +
        chalk.gray(" — Terminal UI"),
    );
    const branchInfo =
      chalk.gray("Branch: ") +
      chalk.green.bold(status.branch) +
      (status.upstream ? chalk.gray(` ➔ ${status.upstream}`) : "") +
      (status.ahead > 0 ? chalk.cyan(` [↑${status.ahead}]`) : "") +
      (status.behind > 0 ? chalk.magenta(` [↓${status.behind}]`) : "");
    console.log(branchInfo);

    const summaryParts = [
      chalk.green(`${status.staged.length} staged`),
      chalk.yellow(`${status.unstaged.length} unstaged`),
      chalk.red(`${status.untracked.length} untracked`),
    ];
    if (status.conflicts.length > 0) {
      summaryParts.push(chalk.bold.red(`${status.conflicts.length} conflict(s)`));
    }
    console.log(
      chalk.gray("Status: ") +
        summaryParts.join(chalk.gray(" • ")) +
        (status.isClean ? chalk.gray(" (clean)") : "") +
        "\n",
    );

    const action = await select({
      message: "What do you want to do?",
      choices: [
        {
          name: `📊 Status & Stage Changes (${status.staged.length} staged, ${status.unstaged.length} unstaged, ${status.untracked.length} untracked)`,
          value: "status",
        },
        {
          name: "➕ Stage All Files (git add .)",
          value: "stage_all",
        },
        {
          name: "✏️  Create Conventional Commit (kg c)",
          value: "commit",
        },
        {
          name: "🚀 Push to Remote (git push)",
          value: "push",
        },
        {
          name: "📜 Commit History Inspector (kg l -i)",
          value: "log",
        },
        {
          name: "📦 Manage Submodules (kg sm)",
          value: "submodule",
        },
        {
          name: "🔄 Refresh Status",
          value: "refresh",
        },
        {
          name: "🚪 Exit",
          value: "exit",
        },
      ],
    });

    if (action === "exit") {
      break;
    }

    if (action === "refresh") {
      continue;
    }

    if (action === "status") {
      await runInteractiveStatus(status);
    } else if (action === "stage_all") {
      console.log(chalk.cyan("\nStaging all files..."));
      git("add", ".");
      console.log(chalk.green("✓ All changes staged.\n"));
    } else if (action === "commit") {
      await runInteractiveCommit();
    } else if (action === "push") {
      console.log(chalk.blue("\nPushing to remote..."));
      git("push");
      console.log("");
    } else if (action === "log") {
      const logRes = gitCapture([
        "log",
        "--pretty=format:%h%x1f%an%x1f%ar%x1f%s%x1f%d",
        "-n",
        "20",
      ]);
      if (logRes.status === 0 && logRes.stdout) {
        const commits = parseCommits(logRes.stdout);
        await runInteractiveLog(commits);
      } else {
        console.log(chalk.yellow("\nNo commits found.\n"));
      }
    } else if (action === "submodule") {
      await runInteractiveManager(gitRoot);
    }
  }
}

export const uiCommand: CommandModule = {
  command: ["ui", "tui", "menu"],
  describe: "Interactive terminal UI dashboard",
  builder: (yargs) => yargs,
  handler: async () => {
    try {
      await runTui();
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== "ExitPromptError") {
        throw err;
      }
      console.log(chalk.gray("\nExited."));
    }
  },
};
