const CATEGORIES = new Set(['plugins', 'agents', 'workflows', 'skills', 'mcp']);
const pending = [];

function parseComplementUrl(raw) {
  if (typeof raw !== 'string') return null;
  const match = /^dome:\/\/complements\/([a-z]+)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(raw);
  if (!match || !CATEGORIES.has(match[1]) || match[2].length > 120) return null;
  return { category: match[1], id: match[2] };
}

function enqueueComplementLink(raw, windowManager) {
  const intent = parseComplementUrl(raw);
  if (!intent) return false;
  // Bound the queue; links only open review UI and never install anything.
  if (pending.length >= 20) pending.shift();
  pending.push(intent);
  windowManager?.broadcast('dome:complement-link-pending', {});
  return true;
}

function takeComplementLinks() {
  return pending.splice(0);
}

module.exports = { parseComplementUrl, enqueueComplementLink, takeComplementLinks };
