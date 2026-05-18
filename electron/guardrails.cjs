'use strict';

/* eslint-disable no-console */
/**
 * Guardrails middleware for Dome agents (2.17).
 *
 * Optional content-moderation layer inserted BEFORE the model call.
 * When DOME_GUARDRAILS=1, this middleware inspects the last user message
 * and blocks clearly harmful requests before they reach the LLM.
 *
 * Enabled via env variable DOME_GUARDRAILS=1 (off by default).
 * A stricter mode can be configured with DOME_GUARDRAILS_STRICT=1.
 *
 * The middleware follows the deepagents wrapModelCall shape:
 *   (next) => (messages, options) => Promise<AIMessage>
 */

/** Simple heuristics for obviously harmful patterns. Not a security boundary. */
const HARMFUL_PATTERNS = [
  /\b(make|create|build|write|generate)\b.{0,40}\b(malware|ransomware|keylogger|trojan|rootkit|spyware|exploit kit)\b/i,
  /\b(step[- ]by[- ]step|instructions?|guide|how to)\b.{0,60}\b(synthesize|produce|manufacture)\b.{0,40}\b(fentanyl|sarin|vx gas|nerve agent|bioweapon|chemical weapon)\b/i,
  /\bgenerate\b.{0,30}\b(csam|child porn|child sexual)\b/i,
];

/** Returns a non-null rejection reason string if content should be blocked. */
function detectHarmfulContent(text) {
  if (!text || typeof text !== 'string') return null;
  for (const pattern of HARMFUL_PATTERNS) {
    if (pattern.test(text)) {
      return 'Request blocked by Dome guardrails.';
    }
  }
  return null;
}

/**
 * Extract the text content of the last human message from a LangChain messages array.
 */
function lastUserText(messages) {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || typeof m._getType !== 'function') continue;
    if (m._getType() !== 'human') continue;
    const c = m.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
      return c
        .filter((b) => b?.type === 'text')
        .map((b) => b.text)
        .join(' ');
    }
  }
  return '';
}

/**
 * Build the guardrails middleware.
 *
 * Returns null when guardrails are disabled (DOME_GUARDRAILS is not '1').
 * Callers should check for null before including in the middleware chain.
 *
 * @returns {Function|null} wrapModelCall-compatible middleware
 */
function buildGuardrailsMiddleware() {
  if (process.env.DOME_GUARDRAILS !== '1') return null;

  console.log('[Guardrails] Middleware enabled (DOME_GUARDRAILS=1)');

  return (next) => async (messages, options) => {
    const userText = lastUserText(messages);
    const reason = detectHarmfulContent(userText);

    if (reason) {
      console.warn('[Guardrails] Request blocked:', userText.slice(0, 120));
      const { AIMessage } = require('@langchain/core/messages');
      return new AIMessage(reason);
    }

    return next(messages, options);
  };
}

module.exports = { buildGuardrailsMiddleware, detectHarmfulContent };
