# DumpChat (WXT)

`DumpChat` is a browser extension built with [WXT](https://wxt.dev/guide/installation.html) to export conversations from:

- `https://chatgpt.com`
- `https://claude.ai`

This project is inspired by [agarwalvishal/claude-chat-exporter](https://github.com/agarwalvishal/claude-chat-exporter), especially the use of native chat UI copy actions as a primary extraction path.

## What it does

- Injects an `Export Markdown` button on supported conversation pages.
- Injects a `Verify Export` button that runs a diagnostics harness and downloads a JSON report.
- Shows an in-page health badge (`PENDING`, `HEALTHY`, `WARNING`, `ERROR`) after verification runs.
- Captures assistant turns via native copy actions where available.
- Captures user turns via edit-textarea extraction first, then text fallback.
- Downloads a Markdown file with title, source URL, timestamp, and XML-style turn markers with raw message bodies.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start dev mode (optional):
   ```bash
   npm run dev
   ```
   - Chrome target: `npm run dev:chrome`
   - Firefox target: `npm run dev:firefox`

## Build Packages

Build unpacked outputs for both browsers (useful for local verification):

```bash
npm run build:all
```

Build and zip for both browsers:

```bash
npm run zip:all
```

Or per browser:

```bash
npm run zip:chrome
npm run zip:firefox
```

Generated files are written to `.output/`, for example:

- `dumpchat-<version>-chrome.zip`
- `dumpchat-<version>-firefox.zip`
- `dumpchat-<version>-sources.zip` (generated alongside Firefox package)

## Dev Install: Chrome / Chromium

1. Build Chrome output:
   ```bash
   npm run build:chrome
   ```
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the folder `.output/chrome-mv3`.

## Dev Install: Firefox (Temporary)

1. Build Firefox output:
   ```bash
   npm run build:firefox
   ```
2. Open `about:debugging#/runtime/this-firefox`.
3. Click `Load Temporary Add-on...`.
4. Pick the built manifest file in `.output/firefox-mv2/manifest.json`.

Note: temporary Firefox add-ons are removed when Firefox restarts.

## Sharing Releases (Without Extension Stores)

1. Bump `version` in `package.json`.
2. Run `npm run zip:all`.
3. Create a GitHub Release and upload both zip files from `.output/`.
4. Share install steps from this README.

For end users, installation is still developer-style (`Load unpacked` on Chromium, `Load Temporary Add-on` on Firefox).

## Verification Harness

Use this whenever an export is missing content.

1. Open the conversation page.
2. Click `Verify Export`.
3. A file like `chat-export-diagnostics-claude-YYYY-MM-DDTHH-mm-ssZ.json` is downloaded.
4. Inspect/share that JSON to see exactly what matched:
   - schema metadata (`schema.name`, `schema.version`) for stable report versioning
   - selector strings used
   - node counts (user/assistant/copy buttons)
   - extraction counts (clipboard captures, fallback usage, empty messages)
   - health summary (`health.level`, `health.summary`)
   - sample previews from extracted messages
   - auto-detected issues

This gives a deterministic snapshot of what the exporter could and could not read from that exact page state.

## Entry Point

- `/Users/lunelson/Code/lunelson/dumpchat/entrypoints/dumpchat.content.ts`

## Notes

- This implementation runs as a main-world content script so it can intercept `navigator.clipboard.writeText` used by page copy handlers.
- Both ChatGPT and Claude are SPA apps, so the exporter button is route-aware and rechecks page state periodically.
- UI selectors may change over time; if export fails after a site update, selectors in the content script likely need adjustment.
