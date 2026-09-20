<div align="center">
  <img src="apps/desktop/src/renderer/src/assets/logo.png" alt="SkillCat" width="120" />
  <h1>SkillCat</h1>
  <p><strong>Local-first Agent SKILL manager.</strong><br />
  Inventory every skill, explain what triggers it, find install and semantic problems, and manage them safely through <code>npx skills</code>.</p>

  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
    <img src="https://img.shields.io/badge/platform-macOS-lightgrey.svg" alt="Platform: macOS" />
    <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg" alt="Node >= 22" />
    <img src="https://img.shields.io/badge/pnpm-11-orange.svg" alt="pnpm 11" />
  </p>

  <p>
    English · <a href="README.zh-CN.md">简体中文</a>
  </p>
</div>

---

## What is SkillCat?

Agent skills (SKILL.md bundles) are easy to install and easy to lose track of. They pile up in
global directories, per-project directories, and a dozen agent-specific locations; they shadow each
other; they drift from the version recorded in the lock file; and their trigger conditions overlap in
ways no one notices until two skills both claim the same request.

**SkillCat** scans all of them, explains each one, flags concrete problems, and performs
install / update / remove / search through the official `npx skills` CLI — without ever taking over
your files behind your back.

- **Reads are local and offline.** Scanning uses the filesystem and lock files only.
- **Writes are delegated.** Every mutation runs through `npx skills`, so there is one install path, not two.
- **Analysis is explainable.** Deterministic rules and heuristics are labeled separately; each finding ships with evidence.
- **AI is optional.** Bring your own model key to score skills and judge duplicate/conflict candidates.

## Features

- **Inventory** — global and per-project skills across 90+ known agents (Claude Code, Codex, Cursor,
  OpenCode, Gemini CLI, Windsurf, Trae, …), with source, lock metadata, and real link state
  (symlink / dangling / copy drift).
- **Trigger profiling** — extract positive and negative triggers from `when_to_use`, `dispatch_intent`,
  descriptions, and "When to Use" sections. Annotate manually in a sidecar without touching skill files.
- **Analysis** — deterministic rules (dangling links, missing lock records, copy drift, local edits,
  cross-scope shadowing, source conflicts) plus heuristics (trigger overlap, negative contradictions,
  body duplication, missing trigger signals).
- **AI evaluation** *(optional)* — score every skill with your own model, then judge the pre-filtered
  duplicate/conflict candidate pairs. Results are saved and shown alongside the rule findings.
- **Projects** — auto-discover projects under your scan roots by agent markers; pin and revisit them.
  The registry stores paths only; removing an entry never deletes files.
- **Remote search & leaderboard** — browse the skills.sh leaderboard (all-time / trending / hot) and
  search the public index, then install straight into the current scope.
- **Safe operations** — every change streams progress into a drawer with a confirmation step and can
  be cancelled.
- **Desktop polish** — light/dark themes, Chinese/English UI (follows system language), proxy support,
  and a diagnostic `doctor`.

## Installation

### Requirements

- macOS (prebuilt artifacts are macOS-only; the codebase is cross-platform)
- [Node.js](https://nodejs.org/) ≥ 22 and [pnpm](https://pnpm.io/) 11 for building from source

### Option A — Download the app

Grab the latest `SkillCat-<version>-arm64.dmg` (or `.zip`) from the
[Releases](https://github.com/Konata9/skillcat/releases) page and drag **SkillCat** into
`/Applications`.

The builds are unsigned. On first launch from a downloaded copy, right-click → **Open**, or run:

```bash
xattr -dr com.apple.quarantine /Applications/SkillCat.app
```

### Option B — Build from source

```bash
git clone https://github.com/Konata9/skillcat.git
cd skillcat
pnpm install
pnpm desktop   # Electron app in development mode
```

On first run, set a scan root (for example `~/Workspace`) so project-level skills can be discovered.

To produce a distributable app (dmg + zip under `apps/desktop/release/`):

```bash
pnpm dist
```

<details>
<summary>Behind a restrictive network? Use a mirror.</summary>

```bash
# Install
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
  pnpm install --registry=https://registry.npmmirror.com/

# Package
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
  pnpm dist
```

</details>

## Documentation

Architecture, design decisions and reference material live in [`docs/`](docs/):

| Document | Contents |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Core + UI model, repository layout, process/IPC, build & packaging |
| [docs/design.md](docs/design.md) | Read/write split, unified identity, scope model, analysis grading |
| [docs/analysis-rules.md](docs/analysis-rules.md) | The full deterministic and heuristic rule table |
| [docs/ai-evaluation.md](docs/ai-evaluation.md) | LLM scoring, pair verdicts, providers, and the remote leaderboard |
| [docs/configuration.md](docs/configuration.md) | Config/data locations, `config.json` fields, proxy, migration |
| [docs/development.md](docs/development.md) | Dev commands, project structure, tests, adding a new agent |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Known limitations and common issues |

## Contributing

Issues and pull requests are welcome. Before opening a PR, please run:

```bash
pnpm typecheck
pnpm test
```

## License

[MIT](LICENSE) © 2026 konata9
