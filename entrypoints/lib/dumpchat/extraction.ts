import {
  DIAGNOSTICS_SCHEMA_NAME,
  DIAGNOSTICS_SCHEMA_VERSION,
  SITE_CONFIG
} from './config';
import {
  getVisibleUserNodes,
  isVisible,
  normalizeText,
  toElements,
  uniqueElements
} from './helpers';
import { collectClaudeExportData, readSimpleTitle } from './sites/claude';
import {
  collectChatGptExportData,
  getChatGptTurnCopyButtons,
  isLikelyChatGptTitle,
  isLikelyChatGptTurnCopyButton,
  readChatGptDocumentTitle,
  readTitle
} from './sites/chatgpt';
import type {
  DiagnosticReport,
  ExportData,
  Site
} from './types';

export {
  getChatGptTurnCopyButtons,
  isLikelyChatGptTitle,
  isLikelyChatGptTurnCopyButton,
  readChatGptDocumentTitle,
  readTitle
};

export async function collectExportData(site: Site): Promise<ExportData> {
  const config = SITE_CONFIG[site];

  if (site === 'chatgpt') {
    return await collectChatGptExportData(config, site);
  }
  return await collectClaudeExportData(config, site);
}

export async function buildDiagnosticReport(site: Site): Promise<DiagnosticReport> {
  const config = SITE_CONFIG[site];
  const data = await collectExportData(site);
  const userNodes = getVisibleUserNodes(config);
  const assistantNodes = toElements<HTMLElement>(config.assistantMessageSelector);
  const allCopyButtons =
    site === 'chatgpt'
      ? getChatGptTurnCopyButtons(document, config)
      : uniqueElements(toElements<HTMLButtonElement>(config.copyButtonSelector));
  const visibleCopyButtons = allCopyButtons.filter((node) => isVisible(node));
  const extractedAssistants = data.assistants.filter((text) => !!normalizeText(text));
  const issues: string[] = [];

  if (assistantNodes.length > 0 && extractedAssistants.length === 0) {
    issues.push('Assistant nodes exist, but extracted assistant messages were empty.');
  }

  if (assistantNodes.length > 0 && visibleCopyButtons.length === 0) {
    issues.push('Assistant nodes exist, but no visible copy buttons matched current selector.');
  }

  if (
    visibleCopyButtons.length > 0 &&
    data.assistantDebug.clipboardCaptures === 0 &&
    data.assistantDebug.fallbackCount === 0
  ) {
    issues.push('Copy buttons were found, but clipboard interception and fallback extraction both returned no content.');
  }

  const health = deriveHealthStatus({
    issues,
    assistantNodes: assistantNodes.length,
    usersExtracted: data.users.length,
    assistantsExtracted: data.assistants.length,
    assistantDebug: data.assistantDebug
  });

  return {
    schema: {
      name: DIAGNOSTICS_SCHEMA_NAME,
      version: DIAGNOSTICS_SCHEMA_VERSION
    },
    generatedAt: new Date().toISOString(),
    site,
    url: location.href,
    path: location.pathname,
    selectors: {
      userMessageSelector: config.userMessageSelector,
      assistantMessageSelector: config.assistantMessageSelector,
      copyButtonSelector: config.copyButtonSelector,
      editButtonSelector: config.editButtonSelector,
      messageGroupSelector: config.messageGroupSelector
    },
    counts: {
      userNodes: userNodes.length,
      assistantNodes: assistantNodes.length,
      copyButtonsTotal: allCopyButtons.length,
      copyButtonsVisible: visibleCopyButtons.length
    },
    extraction: {
      title: site === 'claude' ? readSimpleTitle(config) || data.title : data.title,
      usersExtracted: data.users.length,
      assistantsExtracted: data.assistants.length,
      assistantsNonEmpty: extractedAssistants.length,
      assistantDebug: data.assistantDebug
    },
    health,
    samples: {
      users: data.users.slice(0, 4).map((value, index) => ({
        index,
        length: value.length,
        preview: value.slice(0, 240)
      })),
      assistants: data.assistants.slice(0, 4).map((value, index) => ({
        index,
        length: value.length,
        preview: value.slice(0, 240)
      }))
    },
    issues
  };
}

export function deriveHealthStatus(input: {
  issues: string[];
  assistantNodes: number;
  usersExtracted: number;
  assistantsExtracted: number;
  assistantDebug: ExportData['assistantDebug'];
}): DiagnosticReport['health'] {
  if (
    input.issues.length > 0 ||
    input.usersExtracted === 0 ||
    input.assistantsExtracted === 0
  ) {
    return { level: 'red', summary: 'missing required content' };
  }

  const hasFallbackUse =
    input.assistantDebug.fromButtonFallbackCount > 0 ||
    input.assistantDebug.usedFallbackCount > 0;

  if (hasFallbackUse) {
    return { level: 'yellow', summary: 'working with fallback paths' };
  }

  if (input.assistantNodes === 0) {
    if (input.assistantDebug.clipboardCaptures >= input.assistantsExtracted) {
      return { level: 'green', summary: 'copy-path checks passed' };
    }
    return { level: 'yellow', summary: 'assistant selectors unavailable' };
  }

  return { level: 'green', summary: 'all primary checks passed' };
}
