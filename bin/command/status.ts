import type { CommandModule } from "yargs";
import chalk from "chalk";
import { checkbox, select } from "@inquirer/prompts";
import { git, gitCapture } from "../git.ts";
import type { StatusArgs, StatusFile, ParsedStatus } from "../types.ts";

export function parseStatus(output: string): ParsedStatus {
  const lines = output.split("\n");
  let branch = "HEAD";
  let upstream: string | undefined;
  let ahead = 0;
  let behind = 0;
  const staged: StatusFile[] = [];
  const unstaged: StatusFile[] = [];
  const untracked: string[] = [];
  const conflicts: StatusFile[] = [];

  for (const rawLine of lines) {
    if (!rawLine) continue;
    if (rawLine.startsWith("## ")) {
      const branchPart = rawLine.slice(3).trim();
      if (branchPart.startsWith("No commits yet on ")) {
        branch = branchPart.slice("No commits yet on ".length);
      } else if (branchPart.startsWith("Initial commit on ")) {
        branch = branchPart.slice("Initial commit on ".length);
      } else {
        const match = branchPart.match(
          /^([^\s.]+)(?:\.\.\.([^\s]+))?(?:\s+\[(?:ahead\s+(\d+))?(?:,\s+)?(?:behind\s+(\d+))?\])?/,
        );
        if (match) {
          branch = match[1] || "HEAD";
          upstream = match[2];
          ahead = match[3] ? parseInt(match[3], 10) : 0;
          behind = match[4] ? parseInt(match[4], 10) : 0;
        } else {
          branch = branchPart;
        }
      }
      continue;
    }

    const x = rawLine[0];
    const y = rawLine[1];
    const filePath = rawLine.slice(3).trim();

    if (
      x === "U" ||
      y === "U" ||
      (x === "A" && y === "A") ||
      (x === "D" && y === "D")
    ) {
      conflicts.push({ path: filePath, status: "conflict", code: `${x}${y}` });
      continue;
    }

    if (x === "?" && y === "?") {
      untracked.push(filePath);
      continue;
    }

    if (x && x !== " " && x !== "?") {
      const statusMap: Record<string, string> = {
        M: "modified",
        A: "new file",
        D: "deleted",
        R: "renamed",
        C: "copied",
      };
      staged.push({
        path: filePath,
        status: statusMap[x] || "modified",
        code: x,
      });
    }

    if (y && y !== " " && y !== "?") {
      const statusMap: Record<string, string> = {
        M: "modified",
        D: "deleted",
        T: "typechange",
      };
      unstaged.push({
        path: filePath,
        status: statusMap[y] || "modified",
        code: y,
      });
    }
  }

  const isClean =
    staged.length === 0 &&
    unstaged.length === 0 &&
    untracked.length === 0 &&
    conflicts.length === 0;

  return {
    branch,
    upstream,
    ahead,
    behind,
    staged,
    unstaged,
    untracked,
    conflicts,
    isClean,
  };
}

export function displayStatus(status: ParsedStatus) {
  let branchLine = `On branch ${chalk.bold.green(status.branch)}`;
  if (status.upstream) {
    if (status.ahead > 0 && status.behind > 0) {
      branchLine += ` ${chalk.yellow(`[ahead ${status.ahead}, behind ${status.behind} of ${status.upstream}]`)}`;
    } else if (status.ahead > 0) {
      branchLine += ` ${chalk.cyan(`[ahead ${status.ahead} commit${status.ahead > 1 ? "s" : ""} of ${status.upstream}]`)}`;
    } else if (status.behind > 0) {
      branchLine += ` ${chalk.red(`[behind ${status.behind} commit${status.behind > 1 ? "s" : ""} of ${status.upstream}]`)}`;
    } else {
      branchLine += ` ${chalk.gray(`(up to date with ${status.upstream})`)}`;
    }
  }
  console.log(`\n${branchLine}\n`);

  if (status.conflicts.length > 0) {
    console.log(
      chalk.bold.red("Unmerged paths (fix conflicts and run 'kg a <file>'):"),
    );
    for (const file of status.conflicts) {
      console.log(
        `  ${chalk.red("!")} ${chalk.red(file.status.padEnd(10))} ${file.path}`,
      );
    }
    console.log("");
  }

  if (status.staged.length > 0) {
    console.log(chalk.bold.green("Changes to be committed:"));
    for (const file of status.staged) {
      console.log(
        `  ${chalk.green("+")} ${chalk.green(file.status.padEnd(10))} ${file.path}`,
      );
    }
    console.log("");
  }

  if (status.unstaged.length > 0) {
    console.log(chalk.bold.yellow("Changes not staged for commit:"));
    for (const file of status.unstaged) {
      console.log(
        `  ${chalk.yellow("~")} ${chalk.yellow(file.status.padEnd(10))} ${file.path}`,
      );
    }
    console.log("");
  }

  if (status.untracked.length > 0) {
    console.log(chalk.bold.red("Untracked files:"));
    for (const file of status.untracked) {
      console.log(
        `  ${chalk.red("?")} ${chalk.red("untracked".padEnd(10))} ${file}`,
      );
    }
    console.log("");
  }

  if (status.isClean) {
    console.log(
      chalk.bold.green("✓ Working tree is clean. Nothing to commit.\n"),
    );
    if (status.ahead > 0) {
      console.log(
        chalk.gray(
          `Tip: Run ${chalk.cyan("kg p")} to push your commits.\n`,
        ),
      );
    }
    return;
  }

  const summaryParts: string[] = [];
  if (status.staged.length > 0)
    summaryParts.push(`${status.staged.length} staged`);
  if (status.unstaged.length > 0)
    summaryParts.push(`${status.unstaged.length} unstaged`);
  if (status.untracked.length > 0)
    summaryParts.push(`${status.untracked.length} untracked`);
  if (status.conflicts.length > 0)
    summaryParts.push(`${status.conflicts.length} conflict(s)`);

  console.log(chalk.gray(`Summary: ${summaryParts.join(" • ")}`));
  console.log(
    chalk.gray(
      `Hints:   ${chalk.cyan("kg a .")} to stage all  •  ${chalk.cyan("kg c <type> <scope> <msg>")} to commit  •  ${chalk.cyan("kg s -i")} interactive`,
    ) + "\n",
  );
}

export async function runInteractiveStatus(status: ParsedStatus) {
  displayStatus(status);

  if (status.isClean) {
    return;
  }

  const stageableFiles = [
    ...status.unstaged.map((f) => ({
      name: `${chalk.yellow("~ [unstaged]")} ${f.path}`,
      value: f.path,
    })),
    ...status.untracked.map((f) => ({
      name: `${chalk.red("? [untracked]")} ${f}`,
      value: f,
    })),
  ];

  if (stageableFiles.length > 0) {
    const filesToStage = await checkbox({
      message: "Select files to stage (Space to toggle, Enter to confirm):",
      choices: stageableFiles,
    });

    if (filesToStage.length > 0) {
      console.log(chalk.blue(`\nStaging ${filesToStage.length} file(s)...`));
      git("add", ...filesToStage);
      console.log(chalk.green(`✓ Staged: ${filesToStage.join(", ")}\n`));
    } else {
      console.log(chalk.gray("\nNo files selected to stage."));
    }
  }

  const refreshedOutput = gitCapture(["status", "--porcelain=v1", "-b", "-u"]);
  if (refreshedOutput.status === 0 && refreshedOutput.stdout) {
    const newStatus = parseStatus(refreshedOutput.stdout);
    if (newStatus.staged.length > 0) {
      const nextAction = await select({
        message: `Staged files ready (${newStatus.staged.length}). Next step:`,
        choices: [
          { name: "✨ Commit staged changes", value: "commit" },
          { name: "↩️  Unstage all files", value: "unstage" },
          { name: "👀 View diff", value: "diff" },
          { name: "🚪 Done", value: "done" },
        ],
      });

      if (nextAction === "commit") {
        console.log(
          chalk.cyan("\nRun: kg c <type> <scope> <subject> to commit.\n"),
        );
      } else if (nextAction === "unstage") {
        git("restore", "--staged", ".");
        console.log(chalk.yellow("\n✓ Unstaged all files.\n"));
      } else if (nextAction === "diff") {
        git("diff", "--cached");
      }
    }
  }
}

export const statusCommand: CommandModule<{}, StatusArgs> = {
  command: ["status [args..]", "st", "s"],
  describe: "show repository status with lazy hints",
  builder: (yargs) =>
    yargs
      .positional("args", {
        type: "string",
        array: true,
        describe: "Pass-through arguments to git status",
      })
      .option("interactive", {
        alias: "i",
        type: "boolean",
        describe: "Interactive staging and actions",
      })
      .option("raw", {
        type: "boolean",
        describe: "Show standard git status output",
      }),
  handler: async (argv) => {
    try {
      const args = argv.args || [];
      const isInteractive = argv.interactive || argv.i;
      const isRaw = argv.raw;

      if (args.length > 0 && !isInteractive) {
        git("status", ...args);
        return;
      }

      if (isRaw) {
        git("status");
        return;
      }

      const res = gitCapture(["status", "--porcelain=v1", "-b", "-u"]);
      if (res.status !== 0) {
        console.log(res.stderr || "Error checking git status.");
        return;
      }

      const status = parseStatus(res.stdout || "");

      if (isInteractive) {
        await runInteractiveStatus(status);
      } else {
        displayStatus(status);
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== "ExitPromptError") {
        throw err;
      }
      console.log(chalk.gray("\nCancelled."));
    }
  },
};
