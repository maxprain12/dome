'use strict';

function readSetting(database, key, fallback) {
  try {
    const row = database.getQueries?.().getSetting?.get(key);
    if (row?.value == null || row.value === '') return fallback;
    return String(row.value);
  } catch {
    return fallback;
  }
}

function truthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function radarFlags(database) {
  const envPoc = process.env.DOME_SOCIAL_TRENDS_INSTAGRAM_POC;
  return {
    cloudEnabled: truthy(readSetting(database, 'social_trends_cloud', '1')),
    instagramPoc: truthy(envPoc != null && envPoc !== '' ? envPoc : readSetting(database, 'social_trends_instagram_poc', '0')),
    enrichTopN: Number(readSetting(database, 'social_trends_enrich_top_n', '5')) || 5,
    smallModelOnly: truthy(readSetting(database, 'social_trends_small_model_only', '1')),
  };
}

function platformCapabilities({ connected = false, hasSocialCloud = false, flags = {} } = {}) {
  return {
    x: connected && hasSocialCloud && flags.cloudEnabled ? 'cloud' : 'unavailable',
    instagram: flags.instagramPoc ? 'poc' : 'own_only',
    linkedin: 'own_only',
  };
}

module.exports = {
  platformCapabilities,
  radarFlags,
  truthy,
};
