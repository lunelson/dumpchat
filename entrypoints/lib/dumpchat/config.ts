import type { Site, SiteConfig } from './types';

export const EXPORT_BUTTON_ID = 'dumpchat-export-button';
export const VERIFY_BUTTON_ID = 'dumpchat-verify-button';
export const STATUS_ID = 'dumpchat-status';
export const HEALTH_BADGE_ID = 'dumpchat-health-badge';
export const POLL_MS = 1200;
export const DIAGNOSTICS_SCHEMA_NAME = 'chat-export-diagnostics';
export const DIAGNOSTICS_SCHEMA_VERSION = '1.0.0';

export const SITE_CONFIG: Record<Site, SiteConfig> = {
  chatgpt: {
    titleSelectors: [
      'main h1',
      '[data-testid="conversation-title"]',
      'header h1',
      '#history a[data-active] [dir="auto"]',
      '#history a[data-active] .truncate',
      'a[data-active] [dir="auto"]',
      'a[data-active] .truncate',
      'nav a[aria-current="page"] [dir="auto"]',
      'nav a[aria-current="page"] .truncate',
      'aside a[aria-current="page"]',
      'h1'
    ],
    conversationPath: /^\/c\//,
    userMessageSelector: '[data-message-author-role="user"]',
    assistantMessageSelector: '[data-message-author-role="assistant"]',
    copyButtonSelector:
      'button[data-testid="copy-turn-action-button"], button[aria-label*="Copy"]',
    editButtonSelector:
      'button[data-testid="edit-turn-action-button"], button[aria-label*="Edit"]',
    editTextareaSelector:
      'textarea[data-testid="prompt-textarea"], textarea[name="prompt-textarea"], textarea',
    messageGroupSelector:
      'article[data-testid^="conversation-turn-"], div[data-testid^="conversation-turn-"]'
  },
  claude: {
    titleSelectors: [
      '[data-testid="chat-title-button"] .truncate',
      '[data-testid="chat-title-button"]',
      'main h1'
    ],
    conversationPath: /^\/chat\//,
    userMessageSelector: '[data-testid="user-message"], [data-testid="message-user"]',
    assistantMessageSelector:
      '.font-claude-response, [data-testid="assistant-message"], [data-testid="message-assistant"]',
    copyButtonSelector: 'button[data-testid="action-bar-copy"]',
    editButtonSelector: 'button[aria-label="Edit"], button[aria-label*="Edit"]',
    editTextareaSelector: 'textarea',
    messageGroupSelector: '.group, [data-testid="chat-message"]'
  }
};

export function detectSite(): Site | null {
  if (location.hostname === 'chatgpt.com') return 'chatgpt';
  if (location.hostname === 'claude.ai') return 'claude';
  return null;
}

export function isConversationPage(site: Site): boolean {
  return SITE_CONFIG[site].conversationPath.test(location.pathname);
}
