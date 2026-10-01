#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import chalk from "chalk";
import { confirm } from "@inquirer/prompts";

const git = (...gitArgs: string[]) =>
  spawnSync("git", gitArgs, { stdio: "inherit" });

const showHelp = () => {
  console.log(chalk.cyan("=============================================="));
  console.log(chalk.bold.yellow("               katzu's Lazy git\n"));
  console.log(`  ${chalk.green("[help / h]")}: a command to show this page`);
  console.log(`  ${chalk.green("[add / a]")}: add file to your commit`);
  console.log(chalk.gray("    example: kg a [filenames or '.']"));
  console.log(
    `  ${chalk.green("[commit / c]")}: commit new file to your git repo`,
  );
  console.log(
    chalk.gray(
      "    example: kg c [commit type] [scope (if don't have scope type 'no' or 'idk')] [subject]",
    ),
  );
  console.log(`  ${chalk.green("[push / p]")}: push to remote repository`);
  console.log(chalk.gray("    example: kg p [remote] [branch]"));
  console.log(`  ${chalk.green("[update]")}: update this package :)`);
  console.log("");
  console.log(chalk.cyan("=============================================="));
};

const rawArgs = hideBin(process.argv);

if (rawArgs.length === 0) {
  console.log(chalk.red("There is no arguments inputing here.."));
  showHelp();
  process.exit(0);
}

if (rawArgs.length === 1 && /^(-h|--help|h|help)$/i.test(rawArgs[0]!)) {
  showHelp();
  process.exit(0);
}

const cli = yargs(rawArgs)
  .scriptName("kg")
  .help(false)
  .version(false)
  .parserConfiguration({ "unknown-options-as-args": true })
  .command(
    ["add [files..]", "a"],
    "add file to your commit",
    (y) => y.positional("files", { type: "string", array: true }),
    (argv) => {
      const files = (argv.files as string[]) || [];
      if (files.length === 0 || files.includes(".")) {
        console.log(chalk.cyan("adding all files.."));
        git("add", ".");
      } else {
        git("add", ...files);
      }
    },
  )
  .command(
    ["commit [type] [scope] [subject..]", "c"],
    "commit new file to your git repo",
    (y) =>
      y
        .positional("type", { type: "string" })
        .positional("scope", { type: "string" })
        .positional("subject", { type: "string", array: true }),
    (argv) => {
      const type = argv.type as string | undefined;
      const scope = argv.scope as string | undefined;
      const subject = (argv.subject as string[] | undefined)?.join(" ") || "";

      if (!type && !scope && !subject) {
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
  )
  .command(
    ["push [args..]", "p"],
    "push to remote repository",
    (y) => y.positional("args", { type: "string", array: true }),
    (argv) => {
      const pushArgs = (argv.args as string[]) || [];
      git("push", ...pushArgs);
    },
  )
  .command("update", "update this package :)", {}, async () => {
    try {
      const shouldUpdate = await confirm({
        message: "Do you want to update this package?",
        default: false,
      });

      if (shouldUpdate) {
        console.log(chalk.blue("Updating package..."));
        const updateBin = typeof Bun !== "undefined" ? "bun" : "npm";
        spawnSync(updateBin, ["update"], { stdio: "inherit" });
        console.log(chalk.green("\nThis package is successfully upgraded!"));
        console.log(chalk.cyan("Please enjoy :) - dethM"));
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== "ExitPromptError") {
        throw err;
      }
    }
  })
  .strict()
  .fail((_msg, err) => {
    if (err) throw err;
    const firstArg = rawArgs[0];
    if (firstArg && !/^-/.test(firstArg)) {
      console.log(chalk.red(`There is no argument '${firstArg}'..`));
    }
    showHelp();
    process.exit(1);
  });

cli.parseAsync();
