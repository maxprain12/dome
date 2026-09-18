'use strict';

const { extractRemoteVisual } = require('./visuals.cjs');

const MAX_TEXT = 8000;
const TOOL_LABELS = Object.freeze({
  social_accounts_list: 'Cuentas sociales',
  social_posts_list: 'Publicaciones',
  social_post_get: 'Publicación',
  social_metrics_summary: 'Métricas',
  social_public_resolve: 'Perfil público',
  resource_create: 'Nota',
  resource_update: 'Recurso',
  calendar_create_event: 'Evento',
  calendar_update_event: 'Evento',
  calendar_list_events: 'Agenda',
  calendar_get_upcoming: 'Agenda',
  flashcard_create: 'Flashcards',
  get_tool_definition: 'Definición de herramienta',
  web_search: 'Búsqueda web',
  web_fetch: 'Página web',
});

function clip(value, max) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length <= max ? text : text.slice(0, max);
}

function messageText(message) {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('\n');
  }
  return '';
}

function toolLabel(raw) {
  const name = String(raw || '').trim();
  if (!name) return 'Herramienta';
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  return name.replace(/_/g, ' ');
}

function activityTitle(count) {
  return count === 1 ? 'Completó 1 paso' : `Completó ${count} pasos`;
}

function toPublicMessages(messages, threadId) {
  const out = [];
  let pendingSteps = [];
  let pendingVisuals = [];
  let index = 0;

  const push = (row) => {
    out.push({ id: `${threadId || 'thread'}-${index}`, ...row });
    index += 1;
  };

  const flushTools = () => {
    if (pendingSteps.length > 0) {
      push({
        role: 'activity',
        text: activityTitle(pendingSteps.length),
        steps: pendingSteps.slice(),
      });
      pendingSteps = [];
    }
    for (const visual of pendingVisuals) {
      push({
        role: 'visual',
        text: visual.name,
        visual,
      });
    }
    pendingVisuals = [];
  };

  for (const message of messages || []) {
    const role = message?.role;
    if (role === 'user' || role === 'assistant') {
      flushTools();
      const text = clip(messageText(message), MAX_TEXT);
      const skills = Array.isArray(message?.skills)
        ? message.skills
            .map((skill) => ({
              id: String(skill?.id || skill?.name || ''),
              title: String(skill?.name || skill?.title || '').trim(),
            }))
            .filter((skill) => skill.title)
        : [];
      const pins = Array.isArray(message?.pinnedResources)
        ? message.pinnedResources
            .map((pin) => ({
              id: String(pin?.id || ''),
              title: String(pin?.title || '').trim(),
              type: String(pin?.type || 'resource'),
            }))
            .filter((pin) => pin.title)
        : [];
      if (text || skills.length > 0 || pins.length > 0) {
        push({
          role,
          text,
          ...(role === 'user' && skills.length > 0 ? { skills } : {}),
          ...(role === 'user' && pins.length > 0 ? { pins } : {}),
        });
      }
      continue;
    }
    if (role !== 'toolResult' && role !== 'tool') continue;
    const name = message.toolName || message.name || '';
    pendingSteps.push(toolLabel(name));
    const visual = extractRemoteVisual(name, message);
    if (visual) pendingVisuals.push(visual);
  }
  flushTools();
  return out;
}

module.exports = {
  clip,
  messageText,
  toolLabel,
  toPublicMessages,
};
