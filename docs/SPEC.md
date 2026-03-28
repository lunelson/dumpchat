# Dumpchat Extraction Spec

## Core principle

Every chat interface has **copy buttons** on each turn. These are the only
reliable, load-bearing selectors. If they are missing, extraction cannot work.
If they are present, their DOM order combined with the fact that conversations
always start with a user turn gives us everything we need.

## Extraction pattern

All platforms follow the same four-step flow:

### 1. Find copy buttons

Query the page using `copyButtonSelector` from the site config. This is the
single most important selector per platform.

### 2. Filter by depth consistency

Turn-level copy buttons sit at a consistent DOM depth. Code-block copy buttons
(inside assistant responses) are nested deeper. `filterByConsistentDepth()`
finds the modal depth across all matched buttons and keeps those within a small
tolerance, discarding outliers. This is platform-agnostic and replaces brittle
checks like `button.closest("pre, code")`.

### 3. Classify by alternation

Conversations start with a user turn, so:

- Even-indexed buttons (0, 2, 4, ...) belong to **user** turns.
- Odd-indexed buttons (1, 3, 5, ...) belong to **assistant** turns.

Platform-specific hints (e.g. `data-testid`, `aria-label`, ancestor role
attributes) provide confirmation when available, but the index-based
alternation is the primary mechanism and the fallback when hints are absent.

### 4. Click all, extract all

Iterate the classified turns, click each copy button, and capture the
clipboard content. When clipboard capture fails, fall back to DOM text
extraction using the turn's container element.

## Selector roles

| Selector                  | Role                                                  |
| ------------------------- | ----------------------------------------------------- |
| `copyButtonSelector`      | **Primary.** The only required selector for extraction |
| `messageGroupSelector`    | Turn container, derived from copy button via `closest()`. Used for DOM text fallback and diagnostics |
| `userMessageSelector`     | Role-detection hint inside the container; DOM text fallback for user turns |
| `assistantMessageSelector`| Role-detection hint inside the container; DOM text fallback for assistant turns |
| `titleSelectors`          | Conversation title extraction (tried in order)        |
| `editButtonSelector`      | Informational only (reported in diagnostics)          |
| `editTextareaSelector`    | Informational only (reported in diagnostics)          |

## Selector stability guidelines

When choosing selectors for a new platform:

1. **Prefer `data-testid` attributes.** These are explicitly maintained for
   testing and are the most stable across frontend changes.

2. **Use `aria-label` with the `i` flag** when `data-testid` is unavailable.
   Case-insensitive matching (`[aria-label="Copy" i]`) protects against
   casing changes.

3. **Avoid Tailwind/utility classes** (e.g. `.group`, `.bg-base`) as
   selectors. These are implementation details that change frequently.

4. **Avoid deeply structural selectors** that depend on specific nesting or
   sibling relationships. Prefer attributes on the target element itself.

## Adding a new platform

1. Add a hostname check in `detectSite()`.
2. Add a `SiteConfig` entry with at minimum a working `copyButtonSelector`.
3. Create a site module that implements `collectExportData()` following the
   four-step pattern above.
4. The depth filter and alternation logic are reusable; only the
   `copyButtonSelector` value and text-extraction fallbacks need to be
   platform-specific.
