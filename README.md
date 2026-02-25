# DumpChat (WXT)

`DumpChat` is a browser extension built with [WXT](https://wxt.dev/guide/installation.html) to export conversations from:

- `https://chatgpt.com`
- `https://claude.ai`
- `https://www.perplexity.ai`

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
   bun install
   ```
2. Start dev mode (optional):
   ```bash
   bun run dev
   ```
   - Chrome target: `bun run dev:chrome`
   - Firefox target: `bun run dev:firefox`

## Build Packages

Build unpacked outputs for both browsers (useful for local verification):

```bash
bun run build:all
```

Build and zip for both browsers:

```bash
bun run zip:all
```

Or per browser:

```bash
bun run zip:chrome
bun run zip:firefox
```

Generated files are written to `.output/`, for example:

- `dumpchat-wxt-<version>-chrome.zip`
- `dumpchat-wxt-<version>-firefox.zip`
- `dumpchat-wxt-<version>-sources.zip` (generated alongside Firefox package)

## Dev Install: Chrome / Chromium

1. Build Chrome output:
   ```bash
   bun run build:chrome
   ```
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the folder `.output/chrome-mv3`.

## Dev Install: Firefox (Temporary)

1. Build Firefox output:
   ```bash
   bun run build:firefox
   ```
2. Open `about:debugging#/runtime/this-firefox`.
3. Click `Load Temporary Add-on...`.
4. Pick the built manifest file in `.output/firefox-mv2/manifest.json`.

Note: temporary Firefox add-ons are removed when Firefox restarts.

## Sharing Releases (Without Extension Stores)

`release-it` is configured in `.release-it.json` to:

- bump `package.json` version
- create a release commit + git tag
- build and zip both browser targets (`after:bump` hook runs `bun run zip:all`)
- create a GitHub Release and attach zip assets from `.output/`

Run an interactive release:

```bash
bun run release
```

Or CI/non-interactive mode:

```bash
bun run release:ci
```

Dry run (no GitHub release API call):

```bash
bun run release:dry
```

If `GITHUB_TOKEN` is not set, release-it falls back to manual GitHub release flow in the browser.

For end users, installation is still developer-style (`Load unpacked` on Chromium, `Load Temporary Add-on` on Firefox).

## Publishing To Stores (Viable)

This project can be published to both Chrome Web Store and Firefox Add-ons using WXT's `submit` command (backed by `publish-browser-extension`).

One-time setup:

1. Initialize submission secrets/options interactively (creates/updates `.env.submit`):
   ```bash
   bun run submit:init
   ```
2. Or copy the template and edit manually:
   ```bash
   cp .env.submit.example .env.submit
   ```
   Fill in store credentials/IDs in `.env.submit`.

Per release:

1. Build store artifacts:
   ```bash
   bun run zip:all
   ```
2. Update ZIP paths in `.env.submit` for the version you are publishing:
   ```bash
   CHROME_ZIP=.output/dumpchat-wxt-<version>-chrome.zip
   FIREFOX_ZIP=.output/dumpchat-wxt-<version>-firefox.zip
   FIREFOX_SOURCES_ZIP=.output/dumpchat-wxt-<version>-sources.zip
   ```
3. Validate auth and config without uploading:
   ```bash
   bun run submit:dry
   ```
4. Submit:
   ```bash
   bun run submit
   ```

Important notes:

- You still need active developer accounts and store listings in each store.
- The first submission is typically manual through each dashboard; API-based updates are easier after IDs/credentials are established.
- `wxt submit` reads `.env.submit` and requires ZIP paths plus credentials.
- Keep `.env.submit` local only; never commit store credentials.

Where values come from:

- `CHROME_ZIP` / `FIREFOX_ZIP` / `FIREFOX_SOURCES_ZIP`: produced by `bun run zip:all` in `.output/`.
- `CHROME_EXTENSION_ID`: your extension item ID in Chrome Web Store Developer Dashboard (existing listing).
- `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET`: OAuth client created in Google Cloud during Chrome Web Store API setup.
- `CHROME_REFRESH_TOKEN`: generated from the OAuth flow (OAuth Playground is documented in Chrome's API guide).
- `FIREFOX_EXTENSION_ID`: your AMO add-on ID (recommended to match `browser_specific_settings.gecko.id` in manifest).
- `FIREFOX_JWT_ISSUER` / `FIREFOX_JWT_SECRET`: AMO API credentials from the addons.mozilla.org developer credentials page.

References:

- WXT CLI (`submit`): https://wxt.dev
- `publish-browser-extension` options: https://www.npmjs.com/package/publish-browser-extension
- Chrome Web Store publishing docs: https://developer.chrome.com/docs/webstore/publish/
- Chrome Web Store API docs: https://developer.chrome.com/docs/webstore/using-api/
- Firefox Add-ons submission docs: https://extensionworkshop.com/documentation/publish/submitting-an-add-on/

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
