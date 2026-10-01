import type { CommandModule } from "yargs";
import chalk from "chalk";
import { git } from "../git.ts";
import type { AddArgs } from "../types.ts";

export const addCommand: CommandModule<{}, AddArgs> = {
  command: ["add [files..]", "a"],
  describe: "add file to your commit",
  builder: (yargs) =>
    yargs.positional("files", { type: "string", array: true }),
  handler: (argv) => {
    const files = argv.files || [];
    if (files.length === 0 || files.includes(".")) {
      console.log(chalk.cyan("adding all files.."));
      git("add", ".");
    } else {
      git("add", ...files);
    }
  },
};
