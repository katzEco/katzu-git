# katzu-git (`kg`)

> **katzu's Lazy git** — A minimal, ergonomic CLI wrapper for everyday Git workflows.

Originally written as a shell script in [`katzu-git-cli`](https://github.com/katzEco/katzu-git-cli), `katzu-git` is rewritten in TypeScript for Bun and Node.js.

---

## Features

- **Quick Add (`kg a`)**: Fast staging for single files or all changes.
- **Conventional Commits (`kg c`)**: Formats commits automatically with type, scope, and subject.
- **Push (`kg p`)**: Transparent pass-through for `git push` with flag forwarding.
- **Interactive Update (`kg update`)**: Inquirer-based prompt to update dependencies.
- **Modular Command Architecture**: Clean TypeScript structure using `yargs` command modules and `chalk` styling.

---

## Installation

### Prerequisites

- [Bun](https://bun.sh) (recommended) or [Node.js](https://nodejs.org) (v22+)
- [Git](https://git-scm.com/)

### Clone & Install

```bash
git clone https://github.com/katzEco/katzu-git.git
cd katzu-git
bun install
```

### Link CLI Locally

To use `kg` globally from your terminal:

```bash
bun link
```

*(or with npm: `npm link`)*

---

## Usage

```text
katzu's Lazy git (kg v1.0.6)

Usage:
  kg <command> [options]

Commands:
  a, add <files..>                  Stage files for commit (default: .)
  c, commit <type> <scope> <msg..>  Create a conventional commit
  p, push [remote] [branch]         Push commits to remote
  update                            Update package dependencies
  h, help                           Show this help message

Examples:
  $ kg a .
  $ kg c feat auth add login flow
  $ kg c fix no resolve crash
  $ kg p origin main
```

### 1. Add Files

```bash
# Stage all files
kg a .

# Stage specific files
kg a src/index.ts package.json
```

### 2. Commit Changes

Format: `kg c [type] [scope] [subject]`

```bash
# Commit with scope: feat(auth): add login endpoint
kg c feat auth add login endpoint

# Commit without scope (use 'no' or 'idk'): feat: initial commit
kg c feat no initial commit
kg c chore idk update dependencies
```

### 3. Push to Remote

```bash
# Default push
kg p

# Push with remote and branch
kg p origin main

# Flags pass directly through to git
kg p --force-with-lease
```

### 4. Update Package

```bash
kg update
```

Prompts for confirmation and updates via your package manager.

---

## Development

```bash
# Run with Bun in watch mode
bun run dev

# Run CLI directly
bun run start -- help

# Type-check
bunx tsc --noEmit
```

---

## License

MIT
