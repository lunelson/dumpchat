import {
  filterByConsistentDepth,
  hover,
  interceptClipboard,
  isVisible,
  normalizeText,
  uniqueElements,
  waitFor,
} from "../helpers";
import type { ExportData, Site, SiteConfig } from "../types";

type ChatGptTurn = {
  root: HTMLElement;
  role: "user" | "assistant";
  copyButton: HTMLButtonElement;
};

export async function collectChatGptExportData(
  config: SiteConfig,
  site: Site,
): Promise<ExportData> {
  const turns = getVisibleChatGptTurns(config);

  const captured: string[] = [];
  const copiedByTurn = new Map<number, string>();
  const stopIntercept = interceptClipboard((text) => {
    const normalized = normalizeText(text);
    if (normalized) captured.push(normalized);
  });

  try {
    for (const [idx, turn] of turns.entries()) {
      const before = captured.length;
      hover(turn.copyButton);
      turn.copyButton.click();
      await waitFor(() => captured.length > before, 900, 60);
      const copied = captured[before] || "";
      if (copied) copiedByTurn.set(idx, copied);
    }
  } finally {
    stopIntercept();
  }

  const users: string[] = [];
  const assistants: string[] = [];
  let usedFallbackCount = 0;

  for (const [idx, turn] of turns.entries()) {
    const copied = copiedByTurn.get(idx) || "";

    if (turn.role === "user") {
      const fallback = extractUserTextFromTurn(turn.root, config);
      const value = copied || fallback;
      if (value) users.push(value);
      continue;
    }

    const fallback = extractAssistantTextFromTurn(turn.root, config);
    const value = copied || fallback;
    if (!copied && fallback) usedFallbackCount += 1;
    if (value) assistants.push(value);
  }

  const userTurns = turns.filter((t) => t.role === "user");
  const assistantTurns = turns.filter((t) => t.role === "assistant");
  const title = readTitle(config, site) || `${site} conversation`;

  return {
    title,
    exportedAt: new Date().toISOString(),
    users,
    assistants,
    assistantDebug: {
      copyButtonsTotal: turns.length,
      copyButtonsVisible: turns.length,
      copyButtonsAfterUserFilter: assistantTurns.length,
      clipboardCaptures: captured.length,
      filteredByRoleHintCount: userTurns.length,
      fallbackCount: assistantTurns.length,
      usedFallbackCount,
      fromButtonFallbackCount: 0,
      filteredAsUserMatchCount: 0,
      userCopyReplacementsCount: 0,
      emptyCount: assistantTurns.length - assistants.filter((v) => !!v).length,
    },
  };
}

export function readTitle(config: SiteConfig, site: Site): string {
  for (const selector of config.titleSelectors) {
    const node = document.querySelector<HTMLElement>(selector);
    const value = normalizeText(node?.innerText ?? node?.textContent ?? "");
    if (!value) continue;
    if (site === "chatgpt" && !isLikelyChatGptTitle(value)) continue;
    return value;
  }
  if (site === "chatgpt") {
    const fromSidebar = readChatGptSidebarTitle();
    if (fromSidebar) return fromSidebar;
    const fromDocument = readChatGptDocumentTitle();
    if (fromDocument) return fromDocument;
  }
  return "";
}

function readChatGptSidebarTitle(): string {
  const pathSelector = `a[href="${escapeAttributeValue(location.pathname)}"]`;
  const active =
    document.querySelector<HTMLElement>("#history a[data-active]") ||
    document.querySelector<HTMLElement>("a[data-active]") ||
    document.querySelector<HTMLElement>(pathSelector) ||
    document.querySelector<HTMLElement>('nav a[aria-current="page"]') ||
    document.querySelector<HTMLElement>('aside a[aria-current="page"]');

  const roots: HTMLElement[] = active ? [active] : [];
  if (location.pathname.startsWith("/c/")) {
    const byPath = document.querySelector<HTMLElement>(pathSelector);
    if (byPath && !roots.includes(byPath)) roots.push(byPath);
  }

  for (const root of roots) {
    const titleAttribute = normalizeText(root.getAttribute("title") || "");
    if (isLikelyChatGptTitle(titleAttribute)) return titleAttribute;

    const candidates = Array.from(
      root.querySelectorAll<HTMLElement>(
        '[dir="auto"], .truncate[title], .truncate, [title], span, div',
      ),
    );

    for (const node of candidates) {
      const fromTitle = normalizeText(node.getAttribute("title") || "");
      if (isLikelyChatGptTitle(fromTitle)) return fromTitle;

      const value = normalizeText(node.innerText || node.textContent || "");
      if (isLikelyChatGptTitle(value)) return value;
    }
  }
  return "";
}

export function readChatGptDocumentTitle(): string {
  const raw = normalizeText(document.title || "");
  if (!raw) return "";

  const stripped = raw
    .replace(/\s*[-|]\s*ChatGPT$/i, "")
    .replace(/^ChatGPT\s*[-|]\s*/i, "")
    .trim();

  if (!stripped) return "";
  if (stripped.toLowerCase() === "chatgpt") return "";
  return stripped;
}

export function isLikelyChatGptTitle(value: string): boolean {
  if (!value) return false;

  const normalized = value.toLowerCase();
  if (normalized.length < 3) return false;

  const blocked = new Set([
    "chatgpt",
    "new chat",
    "search chats",
    "library",
    "apps",
    "deep research",
    "gpts",
    "projects",
    "codex",
  ]);

  return !blocked.has(normalized);
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function extractUserTextFromTurn(turn: HTMLElement, config: SiteConfig): string {
  const textarea = turn.querySelector<HTMLTextAreaElement>("textarea");
  if (textarea) {
    const value = normalizeText(textarea.value);
    if (value) return value;
  }

  const richText = turn.querySelector<HTMLElement>(
    '[data-message-author-role="user"] .whitespace-pre-wrap',
  );
  if (richText) {
    const value = normalizeText(richText.innerText || richText.textContent || "");
    if (value) return value;
  }

  const userNode = turn.querySelector<HTMLElement>(config.userMessageSelector);
  return normalizeText(userNode?.innerText || userNode?.textContent || "");
}

function extractAssistantTextFromTurn(turn: HTMLElement, config: SiteConfig): string {
  const assistantNode = turn.querySelector<HTMLElement>(config.assistantMessageSelector);
  if (!assistantNode) return "";

  const content = assistantNode.querySelector<HTMLElement>(
    '.markdown, .prose, [class*="markdown"], [class*="prose"]',
  );
  return normalizeText(
    content?.innerText ||
      content?.textContent ||
      assistantNode.innerText ||
      assistantNode.textContent ||
      "",
  );
}

export function getChatGptTurnCopyButtons(
  root: ParentNode,
  config: SiteConfig,
): HTMLButtonElement[] {
  return filterByConsistentDepth(
    uniqueElements(
      Array.from(root.querySelectorAll<HTMLButtonElement>(config.copyButtonSelector)).filter(
        (button) => isVisible(button),
      ),
    ),
  );
}

export function isLikelyChatGptTurnCopyButton(button: HTMLButtonElement): boolean {
  const dataTestId = normalizeText(button.getAttribute("data-testid") || "").toLowerCase();
  return dataTestId === "copy-turn-action-button";
}

function getVisibleChatGptTurns(config: SiteConfig): ChatGptTurn[] {
  const buttons = getChatGptTurnCopyButtons(document, config);

  return buttons.map((copyButton, index) => {
    const root =
      copyButton.closest<HTMLElement>(config.messageGroupSelector) ?? copyButton.parentElement!;
    const role = getChatGptTurnRole(root, config) ?? (index % 2 === 0 ? "user" : "assistant");
    return { root, role, copyButton };
  });
}

function getChatGptTurnRole(turn: HTMLElement, config: SiteConfig): "user" | "assistant" | null {
  const explicitRole = turn.dataset["turn"];
  if (explicitRole === "user" || explicitRole === "assistant") return explicitRole;

  const hasUserMessage = !!turn.querySelector(config.userMessageSelector);
  const hasAssistantMessage = !!turn.querySelector(config.assistantMessageSelector);

  if (hasUserMessage === hasAssistantMessage) return null;
  return hasUserMessage ? "user" : "assistant";
}
