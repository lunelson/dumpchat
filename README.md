# Chat Thread Exporter (WXT)

Browser extension built with [WXT](https://wxt.dev/guide/installation.html) to export conversations from:

- `https://chatgpt.com`
- `https://claude.ai`

The exporter follows the same core idea used by [agarwalvishal/claude-chat-exporter](https://github.com/agarwalvishal/claude-chat-exporter): it clicks each chat UI copy button and captures the copied text, rather than rebuilding assistant responses from raw DOM text.

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
2. Start dev mode:
   ```bash
   npm run dev
   ```
3. Load the generated extension build in your browser.

## Build

```bash
npm run build
npm run zip
```

## Verification harness

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

## Entry point

- `/Users/lunelson/Code/lunelson/dumpchat/entrypoints/chat-export.content.ts`

## Notes

- This implementation runs as a main-world content script so it can intercept `navigator.clipboard.writeText` used by page copy handlers.
- Both ChatGPT and Claude are SPA apps, so the exporter button is route-aware and rechecks page state periodically.
- UI selectors may change over time; if export fails after a site update, selectors in the content script likely need adjustment.
