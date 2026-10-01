'use strict';
const { z } = require('zod');
const { CHANNELS } = require('./catalog.cjs');
const { Policy } = require('./schemas.cjs');
const { readSettingSecret, isMaskedSecret } = require('../core/settings-secrets.cjs');
const { isEncryptionAvailable, encryptSecret, isEncryptedSecret } = require('../core/secret-storage.cjs');
const CONFIG_KEY = 'research_routes_v1';
const KEY_NAMES = { brave: 'web_search_brave_key', tavily: 'web_search_tavily_key', exa: 'web_search_exa_api_key' };
const Routing = z.object({
  disabledPlatforms: z.array(z.enum(CHANNELS.map(([name]) => name))).max(16).default([]),
  searchProvider: z.enum(['auto', 'free', 'brave', 'tavily', 'exa']).default('auto'),
  webSource: z.enum(['http', 'browser']).default('http'),
}).strict();
const Secret = z.string().trim().min(1).max(4096).refine((value) => !isMaskedSecret(value));
const Configuration = z.object({ policy: Policy, routing: Routing,
  keys: z.object({ brave: Secret.nullable().optional(), tavily: Secret.nullable().optional(), exa: Secret.nullable().optional() }).strict().default({}),
}).strict().superRefine((value, ctx) => {
  if (!['auto', 'free'].includes(value.routing.searchProvider) && !value.policy.enabledProviders.includes(value.routing.searchProvider)) {
    ctx.addIssue({ code: 'custom', message: 'Preferred provider must be enabled' });
  }
});
function routing(queries) {
  try { return Routing.parse(JSON.parse(queries.getSetting.get(CONFIG_KEY)?.value || '{}')); }
  catch { return Routing.parse({}); }
}
function configuredProviders(queries) {
  return Object.keys(KEY_NAMES).filter((name) => readSettingSecret(queries, KEY_NAMES[name]));
}
function configure(queries, raw, transaction) {
  const parsed = Configuration.safeParse(raw);
  if (!parsed.success) return { success: false, error: 'invalid_configuration' };
  const config = parsed.data;
  const updates = {};
  if (Object.values(config.keys).some((value) => value !== null) && !isEncryptionAvailable()) return { success: false, error: 'encryption_unavailable' };
  for (const [name, value] of Object.entries(config.keys)) {
    const encrypted = value === null ? '' : encryptSecret(value);
    if (value !== null && (encrypted === value || !isEncryptedSecret(encrypted))) return { success: false, error: 'encryption_unavailable' };
    updates[name] = encrypted;
  }
  // A configured key alone is not permission to spend. Refuse incomplete opt-ins.
  for (const name of config.policy.enabledProviders) {
    const key = Object.hasOwn(config.keys, name) ? config.keys[name] : readSettingSecret(queries, KEY_NAMES[name]);
    if (!key) return { success: false, error: 'provider_key_required', provider: name };
  }
  try {
    transaction(() => {
      for (const [name, value] of Object.entries(updates)) queries.setSetting.run(KEY_NAMES[name], value, Date.now());
      const now = Date.now();
      queries.setSetting.run(require('./budget.cjs').POLICY_KEY, JSON.stringify(config.policy), now);
      queries.setSetting.run(CONFIG_KEY, JSON.stringify(config.routing), now);
    });
    return { success: true };
  } catch { return { success: false, error: 'configuration_save_failed' }; }
}
module.exports = { Routing, Configuration, CONFIG_KEY, KEY_NAMES, routing, configuredProviders, configure };
