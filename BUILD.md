# Build Instructions

How to set up a development environment and build Juncle from source. Juncle targets Windows (x64 and ARM64).

## Prerequisites

- [Rust](https://rustup.rs/) (latest stable, MSVC toolchain)
- [Node.js](https://nodejs.org/) 18 or newer
- Microsoft C++ Build Tools: Visual Studio 2019/2022 or Build Tools with the **Desktop development with C++** workload
- WebView2 runtime (already included in Windows 11; [download](https://developer.microsoft.com/microsoft-edge/webview2/) for Windows 10)

```powershell
winget install Rustlang.Rustup
winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

## Develop

```bash
git clone https://github.com/itxahmaddev/juncle.git
cd juncle
npm install
npm run dev
```

## Build an installer

```bash
npm run build
```

The NSIS installer is written to `src-tauri/target/release/bundle/nsis/`. A plain release executable (no installer) can be built with `npx tauri build --no-bundle`.

For ARM64:

```bash
rustup target add aarch64-pc-windows-msvc
npx tauri build --target aarch64-pc-windows-msvc
```

## Checks

```bash
npm run lint
npm run format:check
cargo clippy --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

## CI and releases

| Workflow            | Trigger                | What it does                                                               |
| ------------------- | ---------------------- | -------------------------------------------------------------------------- |
| `code-quality.yml`  | push / PR              | JS syntax check, prettier, `cargo fmt`, `cargo clippy`                     |
| `test.yml`          | push / PR on Rust code | `cargo test`                                                               |
| `main-build.yml`    | push to `main`         | Builds x64 and ARM64 installers and keeps them as artifacts for 30 days    |
| `build-test.yml`    | manual                 | Test build of the current branch                                           |
| `pr-test-build.yml` | manual (PR number)     | Builds a PR and comments the artifact link                                 |
| `release.yml`       | manual                 | Creates a draft release from the `tauri.conf.json` version, builds into it |

To release: bump `version` in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and `package.json`, update `CHANGELOG.md`, then run the **Release** workflow from the Actions tab. Tick **make-latest** to publish it automatically once every build succeeds.

## Troubleshooting

- **`link.exe` not found**: the C++ build tools are missing; install the workload above and open a new terminal.
- **`cargo` not found right after installing Rust**: open a new terminal so `PATH` refreshes.
- **WebView2 errors on Windows 10**: install the WebView2 runtime.
