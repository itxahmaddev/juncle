<p align="center">
  <img src="src/logo.png" alt="Juncle" width="120">
</p>

<h1 align="center">Juncle</h1>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <a href="https://github.com/itxahmaddev/juncle/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/itxahmaddev/juncle/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows-blue">
  <a href="CONTRIBUTING.md"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
</p>

**A free, open source junk cleaner and system booster for Windows.** Built with [Tauri 2](https://tauri.app) (Rust) and a small, dependency-free web UI. Everything runs locally; nothing is uploaded.

## Features

- **Junk Cleaner**: temp files, Windows temp, Prefetch, Windows Update cache, thumbnails, Chrome / Edge / Firefox caches, crash dumps, Recycle Bin
- **Memory Booster**: live RAM usage, top programs, and a one-click boost that trims unused working sets (no program is closed; the effect is temporary)
- **Disk Space**: drive usage and a large-file finder for your user folders
- **Startup manager**: turn per-user startup programs on or off, fully reversible
- Light and dark themes that follow Windows

> Run as Administrator to also clean Windows Temp, Prefetch and Windows Update caches.

## Safety

- Nothing is deleted until you press **Clean** and confirm.
- Files in use are skipped, never forced.
- The large-file deleter only touches regular files inside your user profile, and only after confirmation. Deletion is permanent.
- Disabling a startup program moves its registry entry to `HKCU\Software\Juncle\DisabledStartup`, so it can always be restored.

## Install

Download the latest installer from the [Releases](https://github.com/itxahmaddev/juncle/releases) page.

## Build from source

Requirements: [Node.js](https://nodejs.org) 18+, [Rust](https://rustup.rs) (stable, MSVC), and Visual Studio Build Tools with the **Desktop development with C++** workload. WebView2 ships with Windows 11.

```bash
git clone https://github.com/itxahmaddev/juncle.git
cd juncle
npm install
npm run dev      # run in development
npm run build    # build the installer (src-tauri/target/release/bundle)
```

## Project layout

```
src/          Frontend (plain HTML, CSS, JS; no build step)
src-tauri/    Rust backend (Tauri commands for scanning, cleaning, memory, startup)
```

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Muhammad Ahmad
