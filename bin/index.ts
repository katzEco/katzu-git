#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import chalk from "chalk";
import { addCommand } from "./command/add.ts";
import { commitCommand } from "./command/commit.ts";
import { pushCommand } from "./command/push.ts";
import { updateCommand } from "./command/update.ts";

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
  .command(addCommand)
  .command(commitCommand)
  .command(pushCommand)
  .command(updateCommand)
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
