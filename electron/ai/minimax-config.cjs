/**
 * Minimax API configuration.
 * M2.x models use the Anthropic-compatible endpoint.
 * Docs: https://platform.minimax.io/docs/token-plan/quickstart
 */

const MINIMAX_BASE_URL = 'https://api.minimax.io';
const MINIMAX_OPENAI_BASE_URL = 'https://api.minimax.io/v1';
const MINIMAX_ANTHROPIC_BASE_URL = 'https://api.minimax.io/anthropic';

module.exports = {
  MINIMAX_BASE_URL,
  MINIMAX_OPENAI_BASE_URL,
  MINIMAX_ANTHROPIC_BASE_URL,
};
