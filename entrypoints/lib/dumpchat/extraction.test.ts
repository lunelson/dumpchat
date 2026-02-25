import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SITE_CONFIG } from "./config";
import {
  collectExportData,
  deriveHealthStatus,
  getChatGptTurnCopyButtons,
  getPerplexityAssistantCopyButtons,
  isLikelyChatGptTitle,
  isLikelyChatGptTurnCopyButton,
  isLikelyPerplexityAssistantCopyButton,
  readTitle,
} from "./extraction";

const visibleRects = [
  {
    width: 1,
    height: 1,
    top: 0,
    left: 0,
    right: 1,
    bottom: 1,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  },
] as unknown as DOMRectList;

describe("extraction", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.title = "";
    window.history.replaceState({}, "", "/c/test-thread");

    vi.spyOn(Element.prototype, "getClientRects").mockImplementation(() => visibleRects);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads chatgpt title from active sidebar history item", () => {
    document.body.innerHTML = `
      <div id="history">
        <a data-active href="/c/test-thread">
          <div class="truncate"><span dir="auto">Active Topic</span></div>
        </a>
      </div>
    `;

    const title = readTitle(SITE_CONFIG.chatgpt, "chatgpt");
    expect(title).toBe("Active Topic");
  });

  it("falls back to document title when sidebar title is blocked", () => {
    document.body.innerHTML = `
      <div id="history">
        <a data-active href="/c/test-thread">
          <div class="truncate"><span dir="auto">New chat</span></div>
        </a>
      </div>
    `;
    document.title = "Branch · Feedback Harness for AI - ChatGPT";

    const title = readTitle(SITE_CONFIG.chatgpt, "chatgpt");
    expect(title).toBe("Branch · Feedback Harness for AI");
  });

  it("recognizes likely chatgpt titles", () => {
    expect(isLikelyChatGptTitle("Library")).toBe(false);
    expect(isLikelyChatGptTitle("New chat")).toBe(false);
    expect(isLikelyChatGptTitle("Agent Roles and Orchestration")).toBe(true);
  });

  it("filters out copy buttons attached to assistant message body", () => {
    const assistant = document.createElement("div");
    assistant.setAttribute("data-message-author-role", "assistant");
    const nested = document.createElement("button");
    nested.setAttribute("data-testid", "copy-turn-action-button");
    nested.setAttribute("aria-label", "Copy");
    assistant.appendChild(nested);

    const top = document.createElement("button");
    top.setAttribute("data-testid", "copy-turn-action-button");
    top.setAttribute("aria-label", "Copy");

    document.body.appendChild(assistant);
    document.body.appendChild(top);

    expect(isLikelyChatGptTurnCopyButton(nested)).toBe(false);
    expect(isLikelyChatGptTurnCopyButton(top)).toBe(true);
  });

  it("returns only turn-level chatgpt copy buttons", () => {
    document.body.innerHTML = `
      <article data-testid="conversation-turn-1" data-turn="assistant">
        <div data-message-author-role="assistant">
          <pre><button id="codeCopy" aria-label="Copy code">Copy code</button></pre>
        </div>
        <div><button id="turnCopy" data-testid="copy-turn-action-button" aria-label="Copy">Copy</button></div>
      </article>
    `;

    const buttons = getChatGptTurnCopyButtons(document, SITE_CONFIG.chatgpt);
    expect(buttons).toHaveLength(1);
    expect(buttons.at(0)?.id).toBe("turnCopy");
  });

  it("derives red health when required content is missing", () => {
    const health = deriveHealthStatus({
      issues: [],
      assistantNodes: 1,
      usersExtracted: 1,
      assistantsExtracted: 0,
      assistantDebug: {
        copyButtonsTotal: 0,
        copyButtonsVisible: 0,
        copyButtonsAfterUserFilter: 0,
        clipboardCaptures: 0,
        filteredByRoleHintCount: 0,
        fallbackCount: 0,
        usedFallbackCount: 0,
        fromButtonFallbackCount: 0,
        filteredAsUserMatchCount: 0,
        userCopyReplacementsCount: 0,
        emptyCount: 0,
      },
    });

    expect(health.level).toBe("red");
  });

  it("derives yellow health when fallback paths are used", () => {
    const health = deriveHealthStatus({
      issues: [],
      assistantNodes: 2,
      usersExtracted: 2,
      assistantsExtracted: 2,
      assistantDebug: {
        copyButtonsTotal: 2,
        copyButtonsVisible: 2,
        copyButtonsAfterUserFilter: 2,
        clipboardCaptures: 1,
        filteredByRoleHintCount: 0,
        fallbackCount: 2,
        usedFallbackCount: 1,
        fromButtonFallbackCount: 0,
        filteredAsUserMatchCount: 0,
        userCopyReplacementsCount: 0,
        emptyCount: 0,
      },
    });

    expect(health.level).toBe("yellow");
  });

  it("keeps assistant capture alignment when a middle turn has no copy button", async () => {
    document.body.innerHTML = `
      <article data-testid="conversation-turn-1" data-turn="assistant">
        <div data-message-author-role="assistant"><div class="markdown">fallback-a1</div></div>
        <div><button id="copy1" data-testid="copy-turn-action-button" aria-label="Copy">Copy</button></div>
      </article>
      <article data-testid="conversation-turn-2" data-turn="assistant">
        <div data-message-author-role="assistant"><div class="markdown">fallback-a2</div></div>
      </article>
      <article data-testid="conversation-turn-3" data-turn="assistant">
        <div data-message-author-role="assistant"><div class="markdown">fallback-a3</div></div>
        <div><button id="copy3" data-testid="copy-turn-action-button" aria-label="Copy">Copy</button></div>
      </article>
    `;

    const copy1 = document.getElementById("copy1") as HTMLButtonElement;
    copy1.addEventListener("click", () => {
      void navigator.clipboard.writeText("copied-a1");
    });

    const copy3 = document.getElementById("copy3") as HTMLButtonElement;
    copy3.addEventListener("click", () => {
      void navigator.clipboard.writeText("copied-a3");
    });

    const data = await collectExportData("chatgpt");
    expect(data.assistants).toEqual(["copied-a1", "fallback-a2", "copied-a3"]);
  });

  it("filters perplexity assistant copy button from code-block copy buttons", () => {
    document.body.innerHTML = `
      <div class="bg-base">
        <div id="markdown-content-0">
          <pre><button id="codeCopy" aria-label="Copy">Copy</button></pre>
        </div>
        <div class="flex items-center justify-between">
          <div>
            <button aria-label="Share">Share</button>
            <button id="assistantCopy" aria-label="Copy">Copy</button>
            <button aria-label="Rewrite">Rewrite</button>
          </div>
        </div>
      </div>
    `;

    const buttons = getPerplexityAssistantCopyButtons(document, SITE_CONFIG.perplexity);
    expect(buttons).toHaveLength(1);
    expect(buttons.at(0)?.id).toBe("assistantCopy");

    const codeCopy = document.getElementById("codeCopy");
    if (!(codeCopy instanceof HTMLButtonElement)) {
      throw new Error("codeCopy button not found");
    }
    expect(isLikelyPerplexityAssistantCopyButton(codeCopy, SITE_CONFIG.perplexity)).toBe(false);
  });

  it("extracts perplexity user and assistant turns from the correct copy buttons", async () => {
    document.body.innerHTML = `
      <div class="bg-base">
        <div class="group relative flex items-end gap-0.5">
          <div class="flex items-start gap-2">
            <div>
              <button id="queryCopy" aria-label="Copy Query">Copy Query</button>
            </div>
            <div class="group/query"><span>fallback question text</span></div>
          </div>
        </div>
        <div class="gap-y-lg flex flex-col">
          <div id="markdown-content-0">
            <p>fallback assistant text</p>
            <pre><button id="codeCopyAgain" aria-label="Copy">Copy</button></pre>
          </div>
          <div class="flex items-center justify-between">
            <div>
              <button aria-label="Share">Share</button>
              <button id="assistantCopy" aria-label="Copy">Copy</button>
              <button aria-label="Rewrite">Rewrite</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const queryCopy = document.getElementById("queryCopy");
    if (!(queryCopy instanceof HTMLButtonElement)) {
      throw new Error("queryCopy button not found");
    }
    queryCopy.addEventListener("click", () => {
      void navigator.clipboard.writeText("copied user query");
    });

    const assistantCopy = document.getElementById("assistantCopy");
    if (!(assistantCopy instanceof HTMLButtonElement)) {
      throw new Error("assistantCopy button not found");
    }
    assistantCopy.addEventListener("click", () => {
      void navigator.clipboard.writeText("copied assistant answer");
    });

    const data = await collectExportData("perplexity");
    expect(data.users).toEqual(["copied user query"]);
    expect(data.assistants).toEqual(["copied assistant answer"]);
  });
});
