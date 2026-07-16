'use strict';

/**
 * Deterministic LTM writes from high-signal tool successes (plan 017).
 * No extra LLM — extract allowlisted fields only.
 */

const personalityLoader = require('./personality-loader.cjs');

const MAX_VALUE_CHARS = 280;
const DEDUP_MS = 24 * 60 * 60 * 1000;

/** @type {Map<string, number>} */
const recentKeys = new Map();

const WHITELIST = {
  social_post_publish: {
    domain: 'social',
    key: (args, result) => {
      const platform = pick(args, 'platform') || pick(result, 'platform') || 'social';
      return `published_${String(platform).toLowerCase()}`;
    },
    value: (args, result) => {
      const id = pick(result, 'id') || pick(result, 'postId') || pick(args, 'id');
      const title = pick(args, 'caption') || pick(args, 'text') || pick(result, 'title');
      const snippet = truncate(String(title || '').replace(/\s+/g, ' ').trim(), 120);
      return snippet
        ? `Published post${id ? ` ${id}` : ''}: ${snippet}`
        : `Published post${id ? ` ${id}` : ''}`.trim();
    },
  },
  social_metrics_summary: {
    domain: 'social',
    key: () => 'growth_snapshot',
    value: (_args, result) => {
      const followers = pick(result, 'followers') ?? pick(result, 'followerCount');
      const eng = pick(result, 'engagement') ?? pick(result, 'engagementRate');
      const parts = [];
      if (followers != null) parts.push(`followers=${followers}`);
      if (eng != null) parts.push(`engagement=${eng}`);
      return parts.length ? parts.join(', ') : '';
    },
  },
  email_send: {
    domain: 'email',
    key: (args) => {
      const to = pick(args, 'to') || pick(args, 'recipient') || 'contact';
      return `sent_to_${sanitizeKeyPart(to)}`;
    },
    value: (args) => {
      const subject = pick(args, 'subject') || '';
      return truncate(`Sent mail: ${String(subject).trim() || '(no subject)'}`, MAX_VALUE_CHARS);
    },
  },
  github_create_issue: {
    domain: 'general',
    key: (args, result) => {
      const repo = pick(args, 'repo') || pick(result, 'repo') || 'repo';
      const num = pick(result, 'number') || pick(result, 'issueNumber');
      return `github_issue_${sanitizeKeyPart(repo)}_${num || 'new'}`;
    },
    value: (args, result) => {
      const title = pick(args, 'title') || pick(result, 'title') || '';
      const assignee = pick(args, 'assignee') || (Array.isArray(args?.assignees) ? args.assignees[0] : '');
      const bits = [truncate(String(title), 100)];
      if (assignee) bits.push(`assignee=${assignee}`);
      return bits.filter(Boolean).join(' · ');
    },
  },
};

function pick(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (obj[key] != null) return obj[key];
  const data = obj.data;
  if (data && typeof data === 'object' && data[key] != null) return data[key];
  return undefined;
}

function truncate(text, max) {
  const s = String(text || '');
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function sanitizeKeyPart(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'x';
}

function parseResultPayload(result) {
  if (result == null) return {};
  if (typeof result === 'string') {
    try {
      return JSON.parse(result);
    } catch {
      return { text: result };
    }
  }
  if (typeof result === 'object') {
    if (Array.isArray(result.content)) {
      const text = result.content
        .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('');
      if (text) {
        try {
          return JSON.parse(text);
        } catch {
          return { text };
        }
      }
    }
    if (result.details && typeof result.details === 'object') return result.details;
    return result;
  }
  return {};
}

function isSuccess(result, isError) {
  if (isError === true) return false;
  if (result && typeof result === 'object') {
    if (result.success === false) return false;
    if (result.status === 'error') return false;
  }
  return true;
}

function shouldDedup(domain, key) {
  const mapKey = `${domain}:${key}`;
  const now = Date.now();
  const prev = recentKeys.get(mapKey);
  if (prev && now - prev < DEDUP_MS) return true;
  recentKeys.set(mapKey, now);
  // prune occasionally
  if (recentKeys.size > 200) {
    for (const [k, ts] of recentKeys) {
      if (now - ts > DEDUP_MS) recentKeys.delete(k);
    }
  }
  return false;
}

/**
 * @returns {{ persisted: boolean; reason?: string; key?: string; domain?: string }}
 */
function maybePersistFromToolResult(toolName, args, result, isError) {
  const name = String(toolName || '');
  const rule = WHITELIST[name];
  if (!rule) return { persisted: false, reason: 'not_whitelisted' };
  if (!isSuccess(result, isError)) return { persisted: false, reason: 'not_success' };

  const payload = parseResultPayload(result);
  const argsObj = args && typeof args === 'object' ? args : {};
  const key = String(rule.key(argsObj, payload) || '').trim();
  const value = String(rule.value(argsObj, payload) || '').trim();
  if (!key || !value) return { persisted: false, reason: 'empty_extract' };
  if (value.length > MAX_VALUE_CHARS) {
    return { persisted: false, reason: 'value_too_long' };
  }
  if (shouldDedup(rule.domain, key)) return { persisted: false, reason: 'dedup' };

  try {
    if (rule.domain === 'social' || rule.domain === 'email') {
      personalityLoader.updateDomainMemory(rule.domain, key, value);
    } else {
      personalityLoader.updateLongTermMemory(key, value);
    }
    personalityLoader.addMemoryEntry(`**${key}** (${rule.domain}): ${value}`);
    return { persisted: true, key, domain: rule.domain };
  } catch (err) {
    console.warn('[ActionMemory] persist failed:', err?.message || err);
    return { persisted: false, reason: 'write_failed' };
  }
}

/** Test helper — clear in-memory dedup window. */
function _resetDedupForTests() {
  recentKeys.clear();
}

module.exports = {
  maybePersistFromToolResult,
  WHITELIST,
  _resetDedupForTests,
};
