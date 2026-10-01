#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import chalk from "chalk";
import { addCommand } from "./command/add.ts";
import { commitCommand } from "./command/commit.ts";
import { pushCommand } from "./command/push.ts";
import { updateCommand } from "./command/update.ts";
import { helpCommand, showHelp } from "./command/help.ts";

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
  .command(helpCommand)
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
