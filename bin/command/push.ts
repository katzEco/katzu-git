import type { CommandModule } from "yargs";
import { git } from "../git.ts";

export const pushCommand: CommandModule = {
  command: ["push [args..]", "p"],
  describe: "push to remote repository",
  builder: (yargs) =>
    yargs.positional("args", { type: "string", array: true }),
  handler: (argv) => {
    const pushArgs = (argv.args as string[]) || [];
    git("push", ...pushArgs);
  },
};
