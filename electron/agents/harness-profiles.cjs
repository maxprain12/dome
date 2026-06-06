'use strict';

/**
 * Register empty deepagents harness profiles for Dome providers so
 * createDeepAgent does not inject provider-specific prompt suffixes or
 * tool description overrides on top of Dome's curated system prompts.
 *
 * Call once at main-process startup (electron/main.cjs) before any agent run.
 */

let registered = false;

/** Provider keys and common model-specific keys used in Dome settings. */
const DOME_HARNESS_PROFILE_KEYS = [
  'openai',
  'dome',
  'anthropic',
  'google',
  'ollama',
  'openrouter',
  'minimax',
  // Frequent model overrides (provider:model)
  'openai:gpt-4o',
  'openai:gpt-4o-mini',
  'anthropic:claude-sonnet-4-20250514',
  'anthropic:claude-3-5-haiku-20241022',
  'google:gemini-2.0-flash',
  'google:gemini-3-flash-preview',
  'dome:dome/auto',
];

/**
 * Idempotent: register empty profiles for all Dome provider keys.
 */
function registerDomeHarnessProfiles() {
  if (registered) return;
  registered = true;

  void (async () => {
    try {
      const { registerHarnessProfile, createHarnessProfile } = await import('deepagents');
      const empty = createHarnessProfile({
        excludedMiddleware: [],
        excludedTools: [],
      });
      for (const key of DOME_HARNESS_PROFILE_KEYS) {
        registerHarnessProfile(key, empty);
      }
      console.log('[Harness] Registered empty deepagents profiles for Dome providers');
    } catch (e) {
      console.warn('[Harness] registerDomeHarnessProfiles failed:', e?.message || e);
    }
  })();
}

module.exports = {
  DOME_HARNESS_PROFILE_KEYS,
  registerDomeHarnessProfiles,
};
