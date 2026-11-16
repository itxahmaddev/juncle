# Contributing to Juncle

Thanks for helping! Juncle is MIT licensed, and by contributing you agree your work is released under the same license.

## Getting started

1. Fork the repo and clone your fork.
2. Install the requirements listed in the [README](README.md#build-from-source).
3. `npm install`, then `npm run dev`.

## Ground rules

- **Safety first.** Juncle deletes files. Any change to what gets cleaned must be conservative: never touch user documents, never force-delete files in use, and keep a confirmation step before destructive actions.
- Keep the frontend dependency-free (plain HTML/CSS/JS) unless there is a strong reason.
- Run `cargo fmt` and `cargo clippy` in `src-tauri/` before opening a PR; `cargo check` must pass.
- Keep PRs focused: one change per PR, with a clear description of what and why.
- Test on Windows. Describe how you tested in the PR.

## Adding a junk category

Categories live in `categories()` in `src-tauri/src/lib.rs`. Add an entry with an id, a plain-language name and description, the folders to scan, and (if needed) a filename prefix. Only add locations that are safe to delete and are regenerated automatically by the owning program.

## Reporting bugs and ideas

Use the issue templates. For security issues, see [SECURITY.md](SECURITY.md) instead of opening a public issue.
