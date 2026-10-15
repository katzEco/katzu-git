#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import chalk from "chalk";
import { addCommand } from "./command/add.ts";
import { commitCommand } from "./command/commit.ts";
import { pushCommand } from "./command/push.ts";
import { statusCommand } from "./command/status.ts";
import { logCommand } from "./command/log.ts";
import { submoduleCommand } from "./command/submodule.ts";
import { updateCommand } from "./command/update.ts";
import { helpCommand, showHelp } from "./command/help.ts";
import { uiCommand, runTui } from "./command/ui.ts";

const rawArgs = hideBin(process.argv);

if (rawArgs.length === 0) {
  if (process.stdout.isTTY) {
    try {
      await runTui();
      process.exit(0);
    } catch (err: unknown) {
      if ((err as { name?: string })?.name !== "ExitPromptError") {
        throw err;
      }
      process.exit(0);
    }
  } else {
    console.log(chalk.red("There is no arguments inputing here.."));
    showHelp();
    process.exit(0);
  }
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
  .command(uiCommand)
  .command(addCommand)
  .command(commitCommand)
  .command(pushCommand)
  .command(statusCommand)
  .command(logCommand)
  .command(submoduleCommand)
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
