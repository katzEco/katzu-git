import type { CommandModule } from "yargs";
import chalk from "chalk";
import pkg from "../../package.json";
import type { PackageJson } from "../types.ts";

const packageInfo = pkg as PackageJson;

const formatRow = (cmd: string, args: string, desc: string) => {
  const left = `  ${chalk.green(cmd)}${args ? " " + chalk.gray(args) : ""}`;
  const visualLength = 2 + cmd.length + (args ? 1 + args.length : 0);
  const pad = " ".repeat(Math.max(2, 36 - visualLength));
  return `${left}${pad}${desc}`;
};

export const showHelp = () => {
  const commands = [
    formatRow(
      "a, add",
      "<files..>",
      `Stage files for commit ${chalk.gray("(default: .)")}`,
    ),
    formatRow(
      "c, commit",
      "<type> <scope> <msg..>",
      "Create a conventional commit",
    ),
    formatRow("p, push", "[remote] [branch]", "Push commits to remote"),
    formatRow(
      "s, st, status",
      "[args..]",
      "Show repository status and branch info",
    ),
    formatRow(
      "l, log",
      "[args..]",
      "View commit history with pretty formatting",
    ),
    formatRow(
      "sm, sub, submodule",
      "[action] [args..]",
      "Manage git submodules (add, edit, delete)",
    ),
    formatRow("ui, tui, menu", "", "Launch interactive terminal UI dashboard"),
    formatRow("update", "", "Update package dependencies"),
    formatRow("h, help", "", "Show this help message"),
  ].join("\n");

  console.log(`
${chalk.bold.yellow("katzu's Lazy git")} ${chalk.gray(`(kg v${packageInfo.version})`)}

${chalk.bold("Usage:")}
  ${chalk.cyan("kg")} ${chalk.green("<command>")} ${chalk.gray("[options]")}

${chalk.bold("Commands:")}
${commands}

${chalk.bold("Examples:")}
  ${chalk.gray("$")} kg a .
  ${chalk.gray("$")} kg c feat auth add login flow
  ${chalk.gray("$")} kg c fix no resolve crash
  ${chalk.gray("$")} kg p origin main
  ${chalk.gray("$")} kg s
  ${chalk.gray("$")} kg s -i
  ${chalk.gray("$")} kg l
  ${chalk.gray("$")} kg l -n 5
  ${chalk.gray("$")} kg l -i
  ${chalk.gray("$")} kg sm
  ${chalk.gray("$")} kg sm add https://github.com/foo/bar.git libs/bar
  ${chalk.gray("$")} kg sm edit libs/bar
  ${chalk.gray("$")} kg sm delete libs/bar
`);
};

export const helpCommand: CommandModule = {
  command: ["help", "h"],
  describe: "Show this help message",
  builder: (yargs) => yargs,
  handler: () => showHelp(),
};
