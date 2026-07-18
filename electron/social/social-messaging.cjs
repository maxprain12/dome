'use strict';

/**
 * Shared helpers for social comment listing + DM send (plan 018).
 */

const {
  SOCIAL_PROVIDER_CAPABILITIES,
} = require('./provider-capabilities.cjs');

const SCOPE_HINTS = {
  instagram: {
    listComments: ['instagram_business_manage_comments'],
    sendDm: ['instagram_business_manage_messages'],
  },
  linkedin: {
    // Comments on org shares need Community Management (org) scopes.
    listComments: ['w_organization_social', 'r_organization_social'],
    // Member messaging is partner-gated; we still attempt send when flag on.
    sendDm: ['w_member_social'],
  },
  x: {
    listComments: ['tweet.read'],
    sendDm: ['dm.write', 'dm.read'],
  },
};

/**
 * @param {string|null|undefined} scopesRaw
 * @returns {Set<string>}
 */
function parseScopes(scopesRaw) {
  const set = new Set();
  for (const part of String(scopesRaw || '').split(/[,\s]+/)) {
    const s = part.trim().toLowerCase();
    if (s) set.add(s);
  }
  return set;
}

/**
 * @param {{ provider: string, scopes?: string|null }} account
 * @param {'listComments'|'sendDm'} capability
 */
function accountSupports(account, capability) {
  const provider = account?.provider;
  const caps = SOCIAL_PROVIDER_CAPABILITIES[provider];
  if (!caps || !caps[capability]) return false;
  const hints = SCOPE_HINTS[provider]?.[capability] || [];
  if (hints.length === 0) return true;
  const have = parseScopes(account.scopes);
  // Manual IG tokens often store scopes=null — allow if matrix says true
  // (user pasted a token that may already include permissions).
  if (have.size === 0 && provider === 'instagram') return true;
  return hints.some((h) => have.has(h.toLowerCase()));
}

/**
 * @param {object} partial
 * @returns {object}
 */
function normalizeComment(partial = {}) {
  return {
    id: String(partial.id || ''),
    text: String(partial.text || ''),
    authorName: partial.authorName != null ? String(partial.authorName) : null,
    authorExternalId:
      partial.authorExternalId != null ? String(partial.authorExternalId) : null,
    createdAt:
      typeof partial.createdAt === 'number'
        ? partial.createdAt
        : partial.createdAt
          ? Date.parse(partial.createdAt) || null
          : null,
    permalink: partial.permalink != null ? String(partial.permalink) : null,
  };
}

module.exports = {
  SCOPE_HINTS,
  parseScopes,
  accountSupports,
  normalizeComment,
};
