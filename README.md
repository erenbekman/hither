# Hither

What's coming hither, what's gone thither — PRs, deploys and agents in your menu bar.

A macOS menu bar app with four lanes: **Incoming** (PRs and issues waiting on you), **Outgoing** (CI, deploys, production errors), **Agents** (Claude Code sessions and their PRs) and **Suggestions**.

Status: M1 — the Incoming lane works; the others are empty. See [docs/PLAN.md](docs/PLAN.md).

## Development

Requires Node, Rust and the [GitHub CLI](https://cli.github.com) (`gh auth login`).

```bash
npm install
npm run tauri dev
npm test
npm run tauri build
```

## Credits

Architecture inspired by [GHBar](https://github.com/cobanov/ghbar) by Mert Çobanov (MIT). See [NOTICE](NOTICE).
