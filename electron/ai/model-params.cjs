'use strict';

/**
 * Resolve chat `temperature` for provider APIs that reject non-default values.
 * OpenAI gpt-5-nano and o-series reasoning models only accept the default (1).
 */

/**
 * @param {string | undefined | null} modelId
 * @returns {string}
 */
function normalizeModelId(modelId) {
  const raw = String(modelId || '').trim();
  if (!raw) return '';
  const slash = raw.lastIndexOf('/');
  return slash >= 0 ? raw.slice(slash + 1) : raw;
}

/**
 * @param {string | undefined | null} modelId
 * @returns {boolean}
 */
function supportsCustomTemperature(modelId) {
  const id = normalizeModelId(modelId).toLowerCase();
  if (!id) return true;

  // Reasoning models: temperature param rejected or fixed at 1.
  if (/^o[134](-|$)/.test(id)) return false;

  // GPT-5 nano only accepts default temperature (1).
  if (id === 'gpt-5-nano') return false;

  return true;
}

/**
 * @param {string | undefined | null} modelId
 * @param {number} [defaultTemp=0.7]
 * @returns {number | undefined} Omit from request when undefined.
 */
function resolveTemperature(modelId, defaultTemp = 0.7) {
  if (!supportsCustomTemperature(modelId)) return undefined;
  return defaultTemp;
}

/**
 * @param {string | undefined | null} modelId
 * @param {number} [defaultTemp=0.7]
 * @returns {Record<string, never> | { temperature: number }}
 */
function temperatureOptions(modelId, defaultTemp = 0.7) {
  const temp = resolveTemperature(modelId, defaultTemp);
  return temp === undefined ? {} : { temperature: temp };
}

module.exports = {
  normalizeModelId,
  supportsCustomTemperature,
  resolveTemperature,
  temperatureOptions,
};
