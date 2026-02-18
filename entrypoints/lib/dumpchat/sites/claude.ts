import type { CopyButtonRoleHint, ExportData, Site, SiteConfig } from '../types';
import {
  hover,
  interceptClipboard,
  isVisible,
  normalizeText,
  toElements,
  uniqueElements,
  waitFor
} from '../helpers';

type ClaudeTurn = {
  root: HTMLElement;
  role: 'user' | 'assistant';
  copyButton: HTMLButtonElement | null;
};

export async function collectClaudeExportData(
  config: SiteConfig,
  site: Site
): Promise<ExportData> {
  const turns = getClaudeTurns(config);
  const allCopyButtons = uniqueElements(
    toElements<HTMLButtonElement>(config.copyButtonSelector).filter((button) =>
      isVisible(button)
    )
  );

  const captured: string[] = [];
  const copiedByTurn = new Map<number, string>();
  const stopIntercept = interceptClipboard((text) => {
    const normalized = normalizeText(text);
    if (normalized) captured.push(normalized);
  });

  try {
    for (let idx = 0; idx < turns.length; idx += 1) {
      const button = turns[idx].copyButton;
      if (!button) continue;

      const before = captured.length;
      hover(button);
      button.click();
      await waitFor(() => captured.length > before, 900, 60);
      const copied = captured[before] || '';
      if (copied) copiedByTurn.set(idx, copied);
    }
  } finally {
    stopIntercept();
  }

  const users: string[] = [];
  const assistants: string[] = [];
  let usedFallbackCount = 0;

  for (let idx = 0; idx < turns.length; idx += 1) {
    const turn = turns[idx];
    const copied = copiedByTurn.get(idx) || '';

    if (turn.role === 'user') {
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

  const assistantTurns = turns.filter((turn) => turn.role === 'assistant');
  const userTurns = turns.filter((turn) => turn.role === 'user');
  const title = readSimpleTitle(config) || `${site} conversation`;

  return {
    title,
    exportedAt: new Date().toISOString(),
    users,
    assistants,
    assistantDebug: {
      copyButtonsTotal: allCopyButtons.length,
      copyButtonsVisible: allCopyButtons.length,
      copyButtonsAfterUserFilter: assistantTurns.filter((turn) => !!turn.copyButton).length,
      clipboardCaptures: captured.length,
      filteredByRoleHintCount: userTurns.filter((turn) => !!turn.copyButton).length,
      fallbackCount: assistantTurns.length,
      usedFallbackCount,
      fromButtonFallbackCount: 0,
      filteredAsUserMatchCount: 0,
      userCopyReplacementsCount: 0,
      emptyCount: assistantTurns.length - assistants.length
    }
  };
}

export function readSimpleTitle(config: SiteConfig): string {
  for (const selector of config.titleSelectors) {
    const node = document.querySelector<HTMLElement>(selector);
    const value = normalizeText(node?.innerText ?? node?.textContent ?? '');
    if (value) return value;
  }
  return '';
}

function getClaudeTurns(config: SiteConfig): ClaudeTurn[] {
  const roots = uniqueElements(
    toElements<HTMLElement>('div[data-test-render-count]').filter((root) =>
      isVisible(root)
    )
  );

  const turns = roots
    .map((root) => {
      const role = detectClaudeTurnRole(root);
      if (role === 'unknown') return null;
      const copyButton =
        root.querySelector<HTMLButtonElement>(config.copyButtonSelector);
      return { root, role, copyButton };
    })
    .filter((turn): turn is ClaudeTurn => !!turn);

  return turns;
}

function detectClaudeTurnRole(root: HTMLElement): CopyButtonRoleHint {
  const hasUser = !!root.querySelector('[data-testid="user-message"], [data-testid="message-user"]');
  const hasAssistant = !!root.querySelector(
    '.font-claude-response, [data-testid="assistant-message"], [data-testid="message-assistant"]'
  );

  if (hasUser && !hasAssistant) return 'user';
  if (hasAssistant && !hasUser) return 'assistant';
  return 'unknown';
}

function extractClaudeUserText(root: HTMLElement): string {
  const node = root.querySelector<HTMLElement>(
    '[data-testid="user-message"], [data-testid="message-user"]'
  );
  return normalizeText(node?.innerText || node?.textContent || '');
}

function extractClaudeAssistantText(root: HTMLElement): string {
  const preferred = root.querySelector<HTMLElement>(
    '.row-start-2 .standard-markdown'
  );
  if (preferred) {
    const value = normalizeText(preferred.innerText || preferred.textContent || '');
    if (value) return value;
  }

  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>('.font-claude-response .standard-markdown')
  )
    .map((node) => normalizeText(node.innerText || node.textContent || ''))
    .filter((value) => !!value)
    .sort((a, b) => b.length - a.length);

  if (candidates[0]) return candidates[0];

  const container = root.querySelector<HTMLElement>('.font-claude-response');
  return normalizeText(container?.innerText || container?.textContent || '');
}
