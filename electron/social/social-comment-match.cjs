'use strict';

/**
 * Hashtag / keyword matching for social_comment automations (plan 014).
 * Pure helpers — no network. Used by draft_only path until a provider
 * exposes listComments + sendDm.
 */

/**
 * Normalize a hashtag for comparison: strip leading #, lowercase, trim.
 * @param {string} raw
 * @returns {string}
 */
function normalizeHashtag(raw) {
  return String(raw || '')
    .trim()
    .replace(/^#+/, '')
    .toLowerCase();
}

/**
 * True when `text` contains the hashtag (case-insensitive, with or without #).
 * Matches whole-token boundaries so `#Curso` does not match `#Cursores`.
 * @param {string} text
 * @param {string} hashtag
 * @returns {boolean}
 */
function commentMatchesHashtag(text, hashtag) {
  const needle = normalizeHashtag(hashtag);
  if (!needle) return false;
  const body = String(text || '');
  if (!body) return false;
  const re = new RegExp(`(?:^|[^\\p{L}\\p{N}_])#?${escapeRegExp(needle)}(?![\\p{L}\\p{N}_])`, 'iu');
  return re.test(body);
}

/**
 * Fill `{{hashtag}}`, `{{comment}}`, `{{author}}`, `{{link}}` in a template.
 * @param {string} template
 * @param {{ hashtag?: string, comment?: string, author?: string, link?: string }} vars
 * @returns {string}
 */
function renderReplyTemplate(template, vars = {}) {
  const map = {
    hashtag: vars.hashtag != null ? String(vars.hashtag) : '',
    comment: vars.comment != null ? String(vars.comment) : '',
    author: vars.author != null ? String(vars.author) : '',
    link: vars.link != null ? String(vars.link) : '',
  };
  return String(template || '').replace(/\{\{\s*(hashtag|comment|author|link)\s*\}\}/gi, (_, key) => {
    return map[String(key).toLowerCase()] ?? '';
  });
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  normalizeHashtag,
  commentMatchesHashtag,
  renderReplyTemplate,
};
