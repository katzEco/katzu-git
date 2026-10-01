import { spawnSync } from "node:child_process";
import type { CommandModule } from "yargs";
import chalk from "chalk";
import { confirm } from "@inquirer/prompts";

export const updateCommand: CommandModule = {
  command: "update",
  describe: "update this package :)",
  builder: (yargs) => yargs,
  handler: async () => {
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
  },
};
