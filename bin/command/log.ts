import type { CommandModule } from "yargs";
import chalk from "chalk";
import { select } from "@inquirer/prompts";
import { git, gitCapture } from "../git.ts";
import type { LogArgs, CommitInfo } from "../types.ts";

export function highlightSubject(subject: string): string {
  const match = subject.match(/^([a-zA-Z]+)(?:<([^>]+)>)?(!)?:\s*(.*)$/);
  if (!match || !match[1] || match[4] === undefined) {
    return chalk.white(subject);
  }
  const type = match[1];
  const scope = match[2];
  const breaking = match[3];
  const rest = match[4];

  const colors: Record<string, (text: string) => string> = {
    feat: chalk.green,
    fix: chalk.red,
    docs: chalk.blue,
    style: chalk.magenta,
    refactor: chalk.yellow,
    perf: chalk.cyan,
    test: chalk.magenta,
    chore: chalk.gray,
    build: chalk.yellow,
    ci: chalk.cyan,
    update: chalk.blue,
  };

  const colorFn = colors[type.toLowerCase()] || chalk.white;
  const typeStr = colorFn(type);
  const scopeStr = scope ? chalk.magenta(`<${scope}>`) : "";
  const breakStr = breaking ? chalk.bold.red("!") : "";
  return `${typeStr}${scopeStr}${breakStr}: ${chalk.white(rest)}`;
}

export function parseCommits(output: string): CommitInfo[] {
  const commits: CommitInfo[] = [];
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = rawLine.split("\x1f");
    if (parts.length < 4) continue;
    const [hash, author, date, subject, refs = ""] = parts;
    if (!hash || !subject) continue;
    commits.push({
      hash: hash.trim(),
      author: (author || "").trim(),
      date: (date || "").trim(),
      subject: (subject || "").trim(),
      refs: (refs || "").trim(),
    });
  }
  return commits;
}

export function displayLog(commits: CommitInfo[]) {
  if (commits.length === 0) {
    console.log(chalk.yellow("\nNo commits found in this repository.\n"));
    return;
  }

  console.log(
    chalk.bold.yellow(`\nRecent Commits (${commits.length}):\n`),
  );

  for (const commit of commits) {
    const refsStr = commit.refs ? chalk.bold.green(commit.refs) + " " : "";
    console.log(
      `  ${chalk.bold.yellow(commit.hash)}  ${refsStr}${highlightSubject(commit.subject)}`,
    );
    console.log(
      `           ${chalk.gray(`${commit.author} • ${commit.date}`)}\n`,
    );
  }

  console.log(
    chalk.gray(
      "Hints: kg l -n <count>  •  kg l --stat  •  kg l --graph  •  kg l -i (interactive)\n",
    ),
  );
}

export async function runInteractiveLog(commits: CommitInfo[]) {
  if (commits.length === 0) {
    console.log(chalk.yellow("\nNo commits found in this repository.\n"));
    return;
  }

  while (true) {
    const selectedHash = await select({
      message:
        chalk.bold.cyan("Commit Explorer") +
        chalk.gray(" — select a commit to inspect:"),
      choices: [
        ...commits.map((c) => ({
          name: `${chalk.yellow(c.hash)} ${c.refs ? chalk.green(c.refs) + " " : ""}${c.subject} ${chalk.gray(`(${c.author}, ${c.date})`)}`,
          value: c.hash,
        })),
        { name: "🚪 Exit", value: "exit" },
      ],
    });

    if (selectedHash === "exit") {
      break;
    }

    console.log(
      chalk.blue(`\n--- Commit Details: ${chalk.bold(selectedHash)} ---\n`),
    );
    git("show", "--stat", "--color=always", selectedHash);
    console.log("");

    const action = await select({
      message: `Action for commit ${chalk.bold.yellow(selectedHash)}:`,
      choices: [
        { name: "👀 View full diff / patch", value: "diff" },
        { name: "🔀 Checkout this commit", value: "checkout" },
        { name: "↩️  Back to commit list", value: "back" },
        { name: "🚪 Exit", value: "exit" },
      ],
    });

    if (action === "diff") {
      console.log("");
      git("show", "--color=always", selectedHash);
      console.log("");
    } else if (action === "checkout") {
      console.log(chalk.blue(`\nChecking out ${selectedHash}...`));
      git("checkout", selectedHash);
      break;
    } else if (action === "exit") {
      break;
    }
  }
}

export const logCommand: CommandModule<{}, LogArgs> = {
  command: ["log [args..]", "l"],
  describe: "view commit history with pretty formatting",
  builder: (yargs) =>
    yargs
      .positional("args", {
        type: "string",
        array: true,
        describe: "Pass-through arguments to git log",
      })
      .option("max-count", {
        alias: "n",
        type: "number",
        describe: "Number of commits to show (default: 10)",
      })
      .option("interactive", {
        alias: "i",
        type: "boolean",
        describe: "Interactive commit inspector",
      })
      .option("graph", {
        alias: "g",
        type: "boolean",
        describe: "Show ASCII graph of commit history",
      })
      .option("stat", {
        type: "boolean",
        describe: "Show diffstat for each commit",
      })
      .option("author", {
        type: "string",
        describe: "Filter commits by author",
      })
      .option("grep", {
        type: "string",
        describe: "Filter commits by message pattern",
      })
      .option("raw", {
        type: "boolean",
        describe: "Pass directly to standard git log",
      }),
  handler: async (argv) => {
    try {
      const args = argv.args || [];
      const isInteractive = argv.interactive || argv.i;
      const isGraph = argv.graph || argv.g;
      const isStat = argv.stat;
      const isRaw = argv.raw;
      const count = argv.maxCount ?? argv.n ?? 10;

      if (isRaw) {
        git("log", ...args);
        return;
      }

      if (isGraph) {
        const graphArgs = ["log", "--graph", "--oneline", "--decorate"];
        if (argv.maxCount ?? argv.n) {
          graphArgs.push("-n", String(count));
        }
        graphArgs.push(...args);
        git(...graphArgs);
        return;
      }

      if (isStat) {
        const statArgs = ["log", "--stat"];
        if (argv.maxCount ?? argv.n) {
          statArgs.push("-n", String(count));
        }
        statArgs.push(...args);
        git(...statArgs);
        return;
      }

      // If user passed positional arguments without -i (e.g. `kg l main..dev` or flags like `--patch`):
      if (args.length > 0 && !isInteractive) {
        git("log", ...args);
        return;
      }

      const logArgs = [
        "log",
        `--pretty=format:%h%x1f%an%x1f%ar%x1f%s%x1f%d`,
        "-n",
        String(count),
      ];

      if (argv.author) {
        logArgs.push(`--author=${argv.author}`);
      }
      if (argv.grep) {
        logArgs.push(`--grep=${argv.grep}`);
      }

      const res = gitCapture(logArgs);
      if (res.status !== 0) {
        console.log(
          chalk.yellow("\nNo commits found in this repository yet.\n"),
        );
        return;
      }

      const commits = parseCommits(res.stdout || "");

      if (isInteractive) {
        await runInteractiveLog(commits);
      } else {
        displayLog(commits);
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== "ExitPromptError") {
        throw err;
      }
      console.log(chalk.gray("\nCancelled."));
    }
  },
};
