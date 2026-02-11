/**
 * Central settings API for Dome
 * All settings are stored in the `settings` table as key-value pairs
 * 
 * NOTE: This file now uses the database client which communicates via IPC
 */

import { db } from '../db/client';
import type { UserProfile, AppPreferences, AISettings, CitationStyle } from '@/types';

// ===========================
// User Profile Functions
// ===========================

export async function getUserProfile(): Promise<UserProfile> {
  // Check if database is available
  if (!db.isAvailable()) {
    console.warn('Database API not available, returning default profile');
    return {
      name: '',
      email: '',
      avatarData: undefined,
      avatarPath: undefined,
    };
  }

  const nameResult = await db.getSetting('user_name');
  const emailResult = await db.getSetting('user_email');
  const avatarDataResult = await db.getSetting('user_avatar_data');
  const avatarPathResult = await db.getSetting('user_avatar_path');

  return {
    name: nameResult.data || '',
    email: emailResult.data || '',
    avatarData: avatarDataResult.data || undefined,
    avatarPath: avatarPathResult.data || undefined,
  };
}

export async function saveUserProfile(profile: Partial<UserProfile>): Promise<void> {
  if (profile.name !== undefined) {
    await db.setSetting('user_name', profile.name);
  }

  if (profile.email !== undefined) {
    // Debug: log email details to diagnose truncation issue
    console.log(`[Settings] Saving user_email:`);
    console.log(`[Settings]   - Value: "${profile.email}"`);
    console.log(`[Settings]   - Length: ${profile.email.length}`);
    await db.setSetting('user_email', profile.email);
  }

  if (profile.avatarData !== undefined) {
    await db.setSetting('user_avatar_data', profile.avatarData || '');
  }

  if (profile.avatarPath !== undefined) {
    await db.setSetting('user_avatar_path', profile.avatarPath || '');
  }
}

/** Set avatar as base64 data URL (data:image/...) - Legacy method */
export async function setUserAvatar(avatarData: string | null): Promise<void> {
  await db.setSetting('user_avatar_data', avatarData || '');
}

/** Set avatar as relative path (e.g., "avatars/user-avatar-123.jpg") - New method */
export async function setUserAvatarPath(avatarPath: string | null): Promise<void> {
  await db.setSetting('user_avatar_path', avatarPath || '');
}

// ===========================
// Onboarding Functions
// ===========================

export async function isOnboardingCompleted(): Promise<boolean> {
  // Check if database is available
  if (!db.isAvailable()) {
    console.warn('Database API not available, defaulting to onboarding not completed');
    return false;
  }

  const result = await db.getSetting('onboarding_completed');
  return result.data === 'true';
}

export async function setOnboardingCompleted(completed: boolean): Promise<void> {
  await db.setSetting('onboarding_completed', completed ? 'true' : 'false');
}

// ===========================
// App Preferences Functions
// ===========================

export async function getAppPreferences(): Promise<AppPreferences> {
  // Check if database is available
  if (!db.isAvailable()) {
    console.warn('Database API not available, returning default preferences');
    return {
      theme: 'auto',
      autoSave: true,
      autoBackup: true,
      citationStyle: 'apa',
      shortcuts: undefined,
    };
  }

  const themeResult = await db.getSetting('app_theme');
  const autoSaveResult = await db.getSetting('app_auto_save');
  const autoBackupResult = await db.getSetting('app_auto_backup');
  const citationStyleResult = await db.getSetting('app_citation_style');
  const shortcutsResult = await db.getSetting('app_shortcuts');

  let shortcuts: Record<string, string> | undefined;
  if (shortcutsResult.data) {
    try {
      shortcuts = JSON.parse(shortcutsResult.data);
    } catch (error) {
      console.error('Error parsing shortcuts:', error);
    }
  }

  return {
    theme: (themeResult.data as 'light' | 'dark' | 'auto') || 'auto',
    autoSave: autoSaveResult.data === 'true' || autoSaveResult.data === undefined,
    autoBackup: autoBackupResult.data === 'true' || autoBackupResult.data === undefined,
    citationStyle: (citationStyleResult.data as CitationStyle) || 'apa',
    shortcuts,
  };
}

export async function saveAppPreferences(preferences: Partial<AppPreferences>): Promise<void> {
  if (preferences.theme !== undefined) {
    await db.setSetting('app_theme', preferences.theme);
  }

  if (preferences.autoSave !== undefined) {
    await db.setSetting('app_auto_save', preferences.autoSave ? 'true' : 'false');
  }

  if (preferences.autoBackup !== undefined) {
    await db.setSetting('app_auto_backup', preferences.autoBackup ? 'true' : 'false');
  }

  if (preferences.citationStyle !== undefined) {
    await db.setSetting('app_citation_style', preferences.citationStyle);
  }

  if (preferences.shortcuts !== undefined) {
    await db.setSetting('app_shortcuts', JSON.stringify(preferences.shortcuts));
  }
}

export async function setTheme(theme: 'light' | 'dark' | 'auto'): Promise<void> {
  await db.setSetting('app_theme', theme);
}

export async function setCitationStyle(style: CitationStyle): Promise<void> {
  await db.setSetting('app_citation_style', style);
}

// ===========================
// AI Configuration Functions
// ===========================

export async function getAIConfig(): Promise<AISettings> {
  const providerResult = await db.getSetting('ai_provider');
  const apiKeyResult = await db.getSetting('ai_api_key');
  const modelResult = await db.getSetting('ai_model');
  const embeddingModelResult = await db.getSetting('ai_embedding_model');
  const baseUrlResult = await db.getSetting('ai_base_url');
  const ollamaBaseUrlResult = await db.getSetting('ollama_base_url');
  const ollamaModelResult = await db.getSetting('ollama_model');
  const ollamaEmbeddingModelResult = await db.getSetting('ollama_embedding_model');
  const ollamaTemperatureResult = await db.getSetting('ollama_temperature');
  const ollamaTopPResult = await db.getSetting('ollama_top_p');
  const ollamaNumPredictResult = await db.getSetting('ollama_num_predict');
  const ollamaShowThinkingResult = await db.getSetting('ollama_show_thinking');
  // Anthropic OAuth/Token support
  const authModeResult = await db.getSetting('ai_auth_mode');
  const oauthTokenResult = await db.getSetting('ai_oauth_token');
  // Venice privacy mode
  const venicePrivacyModeResult = await db.getSetting('venice_privacy_mode');

  // Handle legacy 'local' provider by converting to 'ollama'
  let provider = providerResult.data as AISettings['provider'] | 'local';
  if (provider === 'local') {
    provider = 'ollama';
  }

  return {
    provider: provider || 'openai',
    api_key: apiKeyResult.data || undefined,
    model: modelResult.data || undefined,
    embedding_model: embeddingModelResult.data || undefined,
    base_url: baseUrlResult.data || undefined,
    ollama_base_url: ollamaBaseUrlResult.data || undefined,
    ollama_model: ollamaModelResult.data || undefined,
    ollama_embedding_model: ollamaEmbeddingModelResult.data || undefined,
    ollama_temperature: ollamaTemperatureResult.data ? parseFloat(ollamaTemperatureResult.data) : undefined,
    ollama_top_p: ollamaTopPResult.data ? parseFloat(ollamaTopPResult.data) : undefined,
    ollama_num_predict: ollamaNumPredictResult.data ? parseInt(ollamaNumPredictResult.data, 10) : undefined,
    ollama_show_thinking: ollamaShowThinkingResult.data === 'true',
    // Anthropic OAuth/Token support
    auth_mode: (authModeResult.data as AISettings['auth_mode']) || undefined,
    oauth_token: oauthTokenResult.data || undefined,
    // Venice privacy mode
    venice_privacy_mode: (venicePrivacyModeResult.data as AISettings['venice_privacy_mode']) || undefined,
  };
}

export async function saveAIConfig(config: Partial<AISettings>): Promise<void> {
  if (config.provider !== undefined) {
    await db.setSetting('ai_provider', config.provider);
  }

  if (config.api_key !== undefined) {
    await db.setSetting('ai_api_key', config.api_key);
  }

  if (config.model !== undefined) {
    await db.setSetting('ai_model', config.model);
  }

  if (config.embedding_model !== undefined) {
    await db.setSetting('ai_embedding_model', config.embedding_model);
  }

  if (config.base_url !== undefined) {
    await db.setSetting('ai_base_url', config.base_url);
  }

  if (config.ollama_base_url !== undefined) {
    await db.setSetting('ollama_base_url', config.ollama_base_url);
  }

  if (config.ollama_model !== undefined) {
    await db.setSetting('ollama_model', config.ollama_model);
  }

  if (config.ollama_embedding_model !== undefined) {
    await db.setSetting('ollama_embedding_model', config.ollama_embedding_model);
  }

  if (config.ollama_temperature !== undefined) {
    await db.setSetting('ollama_temperature', config.ollama_temperature.toString());
  }

  if (config.ollama_top_p !== undefined) {
    await db.setSetting('ollama_top_p', config.ollama_top_p.toString());
  }

  if (config.ollama_num_predict !== undefined) {
    await db.setSetting('ollama_num_predict', config.ollama_num_predict.toString());
  }

  if (config.ollama_show_thinking !== undefined) {
    await db.setSetting('ollama_show_thinking', config.ollama_show_thinking ? 'true' : 'false');
  }

  // Anthropic OAuth/Token support
  if (config.auth_mode !== undefined) {
    await db.setSetting('ai_auth_mode', config.auth_mode);
  }

  if (config.oauth_token !== undefined) {
    await db.setSetting('ai_oauth_token', config.oauth_token);
  }

  // Venice privacy mode
  if (config.venice_privacy_mode !== undefined) {
    await db.setSetting('venice_privacy_mode', config.venice_privacy_mode);
  }
}

// ===========================
// Initialization
// ===========================

/**
 * Initialize default settings if they don't exist
 * NOTE: This function is now handled in electron/init.cjs
 * This stub is kept for compatibility but does nothing in renderer
 */
export async function initializeDefaultSettings(): Promise<void> {
  console.warn('⚠️ initializeDefaultSettings called in renderer - initialization happens in main process');
  // Settings initialization happens in electron/init.cjs
  // This function is kept for compatibility but should not be called from renderer
}
