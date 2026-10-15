import type { CommandModule } from "yargs";
import chalk from "chalk";
import { input, select } from "@inquirer/prompts";
import { git } from "../git.ts";
import type { CommitArgs } from "../types.ts";

export async function runInteractiveCommit(): Promise<boolean> {
  const type = await select({
    message: "Select commit type:",
    choices: [
      { name: "feat:     A new feature", value: "feat" },
      { name: "fix:      A bug fix", value: "fix" },
      { name: "docs:     Documentation only changes", value: "docs" },
      { name: "style:    Code style changes (formatting, missing semi, etc)", value: "style" },
      { name: "refactor: Refactoring code without changing behavior", value: "refactor" },
      { name: "perf:     Performance improvements", value: "perf" },
      { name: "test:     Adding or updating tests", value: "test" },
      { name: "chore:    Maintenance, build, dependencies", value: "chore" },
    ],
  });

  const scope = await input({
    message: "Commit scope (optional, press Enter to skip):",
    default: "",
  });

  const subject = await input({
    message: "Commit message:",
    validate: (val) =>
      val.trim().length > 0 ? true : "Commit message cannot be empty.",
  });

  const cleanScope = scope.trim();
  const isNoScope = !cleanScope || /^(no|idk)$/i.test(cleanScope);
  const msg = isNoScope
    ? `${type}: ${subject.trim()}`
    : `${type}<${cleanScope}>: ${subject.trim()}`;

  console.log(chalk.blue(`\nCommitting: ${chalk.bold(msg)}`));
  const res = git("commit", "-m", msg);
  return res.status === 0;
}

export const commitCommand: CommandModule<{}, CommitArgs> = {
  command: ["commit [type] [scope] [subject..]", "c"],
  describe: "commit new file to your git repo",
  builder: (yargs) =>
    yargs
      .positional("type", { type: "string" })
      .positional("scope", { type: "string" })
      .positional("subject", { type: "string", array: true }),
  handler: async (argv) => {
    const { type, scope } = argv;
    const subject = argv.subject?.join(" ") || "";

    if (!type && !scope && !subject) {
      if (process.stdout.isTTY) {
        try {
          await runInteractiveCommit();
          return;
        } catch (err: unknown) {
          if ((err as { name?: string })?.name !== "ExitPromptError") throw err;
          console.log(chalk.gray("\nCommit cancelled."));
          return;
        }
      }
      console.log(chalk.red("Can't commiting blank commit..\n"));
      return;
    }
    if (!type || !scope || !subject) {
      console.log(chalk.red("Not enough argument"));
      return;
    }

    const isNoScope = /^(no|idk)$/i.test(scope.trim());
    const msg = isNoScope
      ? `${type}: ${subject}`
      : `${type}<${scope}>: ${subject}`;
    git("commit", "-m", msg);
  },
};

