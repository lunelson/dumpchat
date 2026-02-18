export type Site = 'chatgpt' | 'claude';

export type SiteConfig = {
  titleSelectors: string[];
  conversationPath: RegExp;
  userMessageSelector: string;
  assistantMessageSelector: string;
  copyButtonSelector: string;
  editButtonSelector: string;
  editTextareaSelector: string;
  messageGroupSelector: string;
};

export type AssistantExtractionDebug = {
  copyButtonsTotal: number;
  copyButtonsVisible: number;
  copyButtonsAfterUserFilter: number;
  clipboardCaptures: number;
  filteredByRoleHintCount: number;
  fallbackCount: number;
  usedFallbackCount: number;
  fromButtonFallbackCount: number;
  filteredAsUserMatchCount: number;
  userCopyReplacementsCount: number;
  emptyCount: number;
};

export type CopyButtonRoleHint = 'user' | 'assistant' | 'unknown';

export type ExportData = {
  title: string;
  exportedAt: string;
  users: string[];
  assistants: string[];
  assistantDebug: AssistantExtractionDebug;
};

export type HealthLevel = 'green' | 'yellow' | 'red' | 'gray';

export type DiagnosticReport = {
  schema: {
    name: string;
    version: string;
  };
  generatedAt: string;
  site: Site;
  url: string;
  path: string;
  selectors: {
    userMessageSelector: string;
    assistantMessageSelector: string;
    copyButtonSelector: string;
    editButtonSelector: string;
    messageGroupSelector: string;
  };
  counts: {
    userNodes: number;
    assistantNodes: number;
    copyButtonsTotal: number;
    copyButtonsVisible: number;
  };
  extraction: {
    title: string;
    usersExtracted: number;
    assistantsExtracted: number;
    assistantsNonEmpty: number;
    assistantDebug: AssistantExtractionDebug;
  };
  health: {
    level: Exclude<HealthLevel, 'gray'>;
    summary: string;
  };
  samples: {
    users: Array<{ index: number; length: number; preview: string }>;
    assistants: Array<{ index: number; length: number; preview: string }>;
  };
  issues: string[];
};
