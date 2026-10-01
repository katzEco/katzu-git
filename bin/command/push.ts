import type { CommandModule } from "yargs";
import { git } from "../git.ts";
import type { PushArgs } from "../types.ts";

export const pushCommand: CommandModule<{}, PushArgs> = {
  command: ["push [args..]", "p"],
  describe: "push to remote repository",
  builder: (yargs) =>
    yargs.positional("args", { type: "string", array: true }),
  handler: (argv) => {
    const pushArgs = argv.args || [];
    git("push", ...pushArgs);
  },
};
