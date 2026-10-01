import type { CommandModule } from "yargs";
import chalk from "chalk";
import { git } from "../git.ts";

export const commitCommand: CommandModule = {
  command: ["commit [type] [scope] [subject..]", "c"],
  describe: "commit new file to your git repo",
  builder: (yargs) =>
    yargs
      .positional("type", { type: "string" })
      .positional("scope", { type: "string" })
      .positional("subject", { type: "string", array: true }),
  handler: (argv) => {
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
};
