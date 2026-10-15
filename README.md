# Hither

What's coming hither, what's gone thither — PRs, deploys and agents in your menu bar.

A macOS menu bar app with four lanes: **Incoming** (PRs and issues waiting on you), **Outgoing** (CI, deploys, production errors), **Agents** (Claude Code and Codex sessions, and agent PRs) and **Suggestions**.

All four lanes work: Incoming, Outgoing (CI, Forge deploys, Sentry errors), Agents (Claude Code and Codex sessions, agent pull requests) and Suggestions (one click opens Claude Code in your terminal (iTerm, Terminal, Ghostty or Warp) with an id-only prompt). See [docs/PLAN.md](docs/PLAN.md).

## Install

```bash
brew install --cask erenbekman/tap/hither
```

Or download the notarized `.dmg` from [Releases](https://github.com/erenbekman/hither/releases). It runs on Apple silicon and Intel Macs and updates itself from there. Sign in with GitHub on first launch, or let Hither use the [GitHub CLI](https://cli.github.com) account.

## Development

Requires Node and Rust. Release builds are universal and need rustup with both macOS targets (`brew install rustup`, then `rustup target add aarch64-apple-darwin x86_64-apple-darwin`).

```bash
npm install
npm run tauri dev
npm test
npm run tauri build
```

## Releasing

```bash
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=… scripts/release.sh "Release notes"
```

The script signs with the Developer ID certificate, notarizes and staples the app and the disk image with the `hither-notary` keychain profile, signs the update with `~/.tauri/hither.key`, and writes the universal DMG, `Hither.app.tar.gz`, `latest.json` and the Homebrew cask to `release/<version>/`. Publishing is left to you.

## License

MIT. See [LICENSE](LICENSE).

## Credits

Panel design and architecture inspired by [GHBar](https://github.com/cobanov/ghbar) by Mert Çobanov (MIT). See [NOTICE](NOTICE).
