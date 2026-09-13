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
 * @param {{ commentsEnabled?: boolean, dmEnabled?: boolean }} [flags]
 */
function accountSupports(account, capability, flags) {
  const provider = account?.provider;
  const caps = SOCIAL_PROVIDER_CAPABILITIES[provider];
  if (!caps || !caps[capability]) return false;
  if (capability === 'listComments' && flags?.commentsEnabled === false) return false;
  if (capability === 'sendDm' && flags?.dmEnabled === false) return false;
  const hints = SCOPE_HINTS[provider]?.[capability] || [];
  if (hints.length === 0) return true;
  const have = parseScopes(account.scopes);
  // Manual IG tokens often store scopes=null — listComments can still be tried
  // (Graph rejects clearly). sendDm requires an explicit messaging scope.
  if (have.size === 0 && provider === 'instagram' && capability === 'listComments') {
    return true;
  }
  if (
    capability === 'listComments'
    && provider === 'instagram'
    && [...have].some((scope) => scope.startsWith('instagram_business_'))
  ) {
    return true;
  }
  return hints.some((h) => have.has(h.toLowerCase()));
}

/**
 * @param {object} partial
 * @returns {object}
 */
function normalizeComment(partial = {}) {
  const parentId = partial.parentId != null && String(partial.parentId) ? String(partial.parentId) : null;
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
    parentId,
    replies: Array.isArray(partial.replies) ? partial.replies : [],
  };
}

function mergeCommentRecord(prev, next) {
  return {
    ...prev,
    ...next,
    text: prev.text || next.text,
    authorName: prev.authorName || next.authorName,
    authorExternalId: prev.authorExternalId || next.authorExternalId,
    createdAt: prev.createdAt ?? next.createdAt,
    permalink: prev.permalink || next.permalink,
    parentId: prev.parentId || next.parentId,
    replies: [],
  };
}

function sortCommentThread(list) {
  list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  for (const node of list) sortCommentThread(node.replies || []);
  return list;
}

/** Turn a flat Graph/X/LinkedIn list (parentId) into a nested thread. */
function nestComments(comments) {
  const byId = new Map();
  for (const row of Array.isArray(comments) ? comments : []) {
    if (!row?.id) continue;
    const next = { ...normalizeComment(row), replies: [] };
    const prev = byId.get(next.id);
    byId.set(next.id, prev ? mergeCommentRecord(prev, next) : next);
  }
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parentId && node.parentId !== node.id ? byId.get(node.parentId) : null;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }
  return sortCommentThread(roots);
}

module.exports = {
  SCOPE_HINTS,
  parseScopes,
  accountSupports,
  normalizeComment,
  nestComments,
};
