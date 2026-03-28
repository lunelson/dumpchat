import {
  filterByConsistentDepth,
  hover,
  interceptClipboard,
  isVisible,
  normalizeText,
  toElements,
  uniqueElements,
  waitFor,
} from "../helpers";
import type { CopyButtonRoleHint, ExportData, Site, SiteConfig } from "../types";

type ClaudeTurn = {
  root: HTMLElement;
  role: "user" | "assistant";
  copyButton: HTMLButtonElement;
};

export async function collectClaudeExportData(config: SiteConfig, site: Site): Promise<ExportData> {
  const turns = getClaudeTurns(config);

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
      const fallback = extractClaudeUserText(turn.root);
      const value = copied || fallback;
      if (value) users.push(value);
      continue;
    }

    const fallback = extractClaudeAssistantText(turn.root);
    const value = copied || fallback;
    if (!copied && fallback) usedFallbackCount += 1;
    if (value) assistants.push(value);
  }

  const userTurns = turns.filter((t) => t.role === "user");
  const assistantTurns = turns.filter((t) => t.role === "assistant");
  const title = readSimpleTitle(config) || `${site} conversation`;

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
      emptyCount: assistantTurns.length - assistants.length,
    },
  };
}

export function readSimpleTitle(config: SiteConfig): string {
  for (const selector of config.titleSelectors) {
    const node = document.querySelector<HTMLElement>(selector);
    const value = normalizeText(node?.innerText ?? node?.textContent ?? "");
    if (value) return value;
  }
  return "";
}

function getClaudeTurns(config: SiteConfig): ClaudeTurn[] {
  const buttons = filterByConsistentDepth(
    uniqueElements(
      toElements<HTMLButtonElement>(config.copyButtonSelector).filter((button) =>
        isVisible(button),
      ),
    ),
  );

  return buttons.map((copyButton, index) => {
    const root =
      copyButton.closest<HTMLElement>(config.messageGroupSelector) ?? copyButton.parentElement!;
    const detected = detectClaudeTurnRole(root, config);
    const role: "user" | "assistant" =
      detected !== "unknown" ? detected : index % 2 === 0 ? "user" : "assistant";
    return { root, role, copyButton };
  });
}

function detectClaudeTurnRole(root: HTMLElement, config: SiteConfig): CopyButtonRoleHint {
  const hasUser = !!root.querySelector(config.userMessageSelector);
  const hasAssistant = !!root.querySelector(config.assistantMessageSelector);

  if (hasUser && !hasAssistant) return "user";
  if (hasAssistant && !hasUser) return "assistant";
  return "unknown";
}

function extractClaudeUserText(root: HTMLElement): string {
  const node = root.querySelector<HTMLElement>('[data-testid="user-message"]');
  return normalizeText(node?.innerText || node?.textContent || "");
}

function extractClaudeAssistantText(root: HTMLElement): string {
  const preferred = root.querySelector<HTMLElement>(".row-start-2 .standard-markdown");
  if (preferred) {
    const value = normalizeText(preferred.innerText || preferred.textContent || "");
    if (value) return value;
  }

  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(".font-claude-response .standard-markdown"),
  )
    .map((node) => normalizeText(node.innerText || node.textContent || ""))
    .filter((value) => !!value)
    .toSorted((a, b) => b.length - a.length);

  if (candidates[0]) return candidates[0];

  const container = root.querySelector<HTMLElement>(".font-claude-response");
  return normalizeText(container?.innerText || container?.textContent || "");
}
