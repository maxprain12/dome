import { useTabStore } from '@/lib/store/useTabStore';
import type { AIProviderType } from '@/lib/ai/models';

export interface OpenAIProviderSettingsDetail {
  provider: AIProviderType;
  /** Open the visible-models configuration modal when settings load. */
  openModelsModal?: boolean;
}

/** Open Settings → AI and focus the given provider (optionally the models modal). */
export function openAIProviderSettings(detail: OpenAIProviderSettingsDetail): void {
  useTabStore.getState().openSettingsTab();
  window.dispatchEvent(new CustomEvent('dome:goto-settings-section', { detail: 'ai' }));
  window.dispatchEvent(new CustomEvent('dome:open-ai-provider-settings', { detail }));
}
