import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import chalk from "chalk";
import { checkbox } from "@inquirer/prompts";

interface TargetConfig {
  id: string;
  name: string;
  target: string | null;
  outfile: string | null;
  supported: boolean;
}

const TARGETS: TargetConfig[] = [
  {
    id: "win64",
    name: "Windows x64 (win64)",
    target: "bun-windows-x64",
    outfile: "dist/kg-win64.exe",
    supported: true,
  },
  {
    id: "win32",
    name: "Windows x86 / 32-bit (win32) — [Unsupported by Bun]",
    target: null,
    outfile: null,
    supported: false,
  },
  {
    id: "win-arm",
    name: "Windows ARM64 (win-arm)",
    target: "bun-windows-arm64",
    outfile: "dist/kg-win-arm.exe",
    supported: true,
  },
  {
    id: "linux-x64",
    name: "Linux x64 (linux-x64)",
    target: "bun-linux-x64",
    outfile: "dist/kg-linux-x64",
    supported: true,
  },
  {
    id: "linux-arm",
    name: "Linux ARM64 (linux-arm)",
    target: "bun-linux-arm64",
    outfile: "dist/kg-linux-arm",
    supported: true,
  },
  {
    id: "mac-arm",
    name: "macOS Apple Silicon (mac-arm)",
    target: "bun-darwin-arm64",
    outfile: "dist/kg-mac-arm",
    supported: true,
  },
  {
    id: "mac-x64",
    name: "macOS Intel (mac-x64)",
    target: "bun-darwin-x64",
    outfile: "dist/kg-mac-x64",
    supported: true,
  },
];

async function main() {
  mkdirSync("dist", { recursive: true });

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`
Usage: bun run build [options]

Options:
  -a, --all    Build all supported target platforms without prompt
  -h, --help   Show this help message
`);
    process.exit(0);
  }

  const isAllFlag =
    process.argv.includes("--all") || process.argv.includes("-a");
  const isNonInteractive = !process.stdin.isTTY;

  let selectedIds: string[];

  if (isAllFlag || isNonInteractive) {
    selectedIds = TARGETS.map((t) => t.id);
  } else {
    try {
      selectedIds = await checkbox({
        message:
          "Select platforms to build (Space to toggle, Enter to confirm):",
        choices: TARGETS.map((t) => ({
          name: t.name,
          value: t.id,
          checked: true, // checked by default ("build all as default")
        })),
      });
    } catch {
      console.log(chalk.gray("\nBuild cancelled."));
      process.exit(0);
    }
  }

  if (selectedIds.length === 0) {
    console.log(chalk.yellow("No platforms selected."));
    process.exit(0);
  }

  console.log(
    chalk.cyan(`\nBuilding binaries for ${selectedIds.length} target(s)...\n`),
  );

  let successCount = 0;

  for (const id of selectedIds) {
    const item = TARGETS.find((t) => t.id === id);
    if (!item) continue;

    if (!item.supported || !item.target || !item.outfile) {
      console.log(
        chalk.yellow(
          `⚠️  Skipping ${chalk.bold(id)}: Bun compiler does not support 32-bit platforms (64-bit/ARM64 only).`,
        ),
      );
      continue;
    }

    console.log(
      chalk.blue(`⏳ Compiling for ${chalk.bold(id)} (${item.target})...`),
    );
    const result = spawnSync(
      "bun",
      [
        "build",
        "--compile",
        "--minify",
        `--target=${item.target}`,
        "bin/index.ts",
        `--outfile=${item.outfile}`,
      ],
      { stdio: "inherit" },
    );

    if (result.status === 0) {
      console.log(chalk.green(`✓ Built ${chalk.bold(item.outfile)}\n`));
      successCount++;
    } else {
      console.log(chalk.red(`✗ Failed to compile ${id}\n`));
    }
  }

  console.log(
    chalk.bold.green(
      `🎉 Done! Successfully built ${successCount} target(s) into dist/\n`,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
