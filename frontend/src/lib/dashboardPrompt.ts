export const DASHBOARD_IMPORT_PROMPT_KEY = 'import-prompt-seen';

export function hasSeenImportPrompt(): boolean {
  return localStorage.getItem(DASHBOARD_IMPORT_PROMPT_KEY) === 'true';
}

export function markImportPromptSeen(): void {
  localStorage.setItem(DASHBOARD_IMPORT_PROMPT_KEY, 'true');
}
