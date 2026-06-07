import type { ToolCallData } from '@/components/chat/ChatToolCard';
import {
  canonicalToolName,
  normalizeToolId,
  stripStreamingEllipsis,
  subagentTypeFromDelegateArgs,
  subagentTypeFromTaskArgs,
  type ToolLabelT,
} from '@/lib/chat/toolCatalog';

const TOOL_LABELS_FALLBACK: Record<string, string> = {
  web_search: 'Búsqueda web',
  web_fetch: 'Leyendo página web',
  deep_research: 'Investigación profunda',
  file_write: 'Escribir archivo',
  file_read: 'Leer archivo',
  file_list: 'Listar carpeta',
  file_tree: 'Árbol de archivos',
  file_search: 'Buscar archivos',
  shell_exec: 'Ejecutar comando',
  task: 'Delegar subagente',
  delegate_to_agent: 'Delegar al equipo',
  resource_create: 'Creando recurso',
  resource_get: 'Obteniendo recurso',
  resource_search: 'Buscando recursos',
};

function lookupI18nToolLabel(norm: string, t: ToolLabelT, streaming: boolean): string | null {
  const key = `chat.tool_${norm}`;
  const translated = t(key);
  if (translated && translated !== key) {
    return streaming ? translated : stripStreamingEllipsis(translated);
  }
  return null;
}

function taskLabelFromArgs(args: Record<string, unknown> | undefined, t: ToolLabelT, streaming: boolean): string | null {
  const sub = subagentTypeFromTaskArgs(args);
  if (!sub) return null;
  const key = `chat.tool_task_${sub}`;
  const translated = t(key);
  if (translated !== key) return streaming ? translated : stripStreamingEllipsis(translated);
  return null;
}

const DOME_LOAD_DOC_PATH_IDS = new Set([
  'entity_rules',
  'artifacts',
  'artifact_persisted',
  'artifact_design',
  'feeders',
  'resource_links',
  'ppt_tool',
  'docx_tool',
  'calendar_tool',
  'flashcard_tool',
  'excel_notebook_tool',
  'excel_artifact_tool',
]);

function skillReadAsLoadDoc(args: Record<string, unknown> | undefined): boolean {
  if (!args) return false;
  const skillId = String(args.skill_id ?? args.skill ?? '').trim();
  const path = String(args.path ?? args.file ?? '')
    .replace(/\.(txt|md)$/i, '')
    .trim();
  if (!path || !DOME_LOAD_DOC_PATH_IDS.has(path)) return false;
  return skillId === 'artifacts' || skillId === 'artifact';
}

export function getToolDisplayLabel(
  name: string,
  t: ToolLabelT,
  opts?: { streaming?: boolean; arguments?: Record<string, unknown> },
): string {
  const raw = (name || '').trim();
  if (!raw) return t('chat.tool_generic', { defaultValue: 'Herramienta' });

  const canonical = canonicalToolName(raw);
  const norm = normalizeToolId(canonical);
  const streaming = opts?.streaming === true;

  if (canonical === 'skill_read' && skillReadAsLoadDoc(opts?.arguments)) {
    const docLabel = lookupI18nToolLabel('dome_load_doc', t, streaming);
    if (docLabel) return docLabel;
  }

  if (canonical === 'task' || raw === 'task') {
    const taskLabel = taskLabelFromArgs(opts?.arguments, t, streaming);
    if (taskLabel) return taskLabel;
  }

  if (canonical === 'delegate_to_agent') {
    const agent = subagentTypeFromDelegateArgs(opts?.arguments);
    if (agent) {
      const key = `chat.tool_delegate_${agent}`;
      const tr = t(key);
      if (tr !== key) return streaming ? tr : stripStreamingEllipsis(tr);
    }
  }

  const i18n = lookupI18nToolLabel(norm, t, streaming);
  if (i18n) return i18n;

  // Legacy keys (write_file, read_file, …)
  const legacyNorm = normalizeToolId(raw);
  if (legacyNorm !== norm) {
    const legacy = lookupI18nToolLabel(legacyNorm, t, streaming);
    if (legacy) return legacy;
  }

  if (TOOL_LABELS_FALLBACK[canonical]) return TOOL_LABELS_FALLBACK[canonical]!;
  if (TOOL_LABELS_FALLBACK[norm]) return TOOL_LABELS_FALLBACK[norm]!;

  if (norm.includes('postgres') || norm.includes('sql') || norm.includes('query')) {
    return t('chat.tool_sql_generic', { defaultValue: 'Consulta SQL' });
  }
  if (norm.includes('mcp') || norm.startsWith('mcp_')) {
    return t('chat.tool_mcp_generic', { defaultValue: 'Herramienta MCP' });
  }

  const humanized = canonical.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return humanized || raw;
}

export function getToolDisplayLabelForCall(
  toolCall: Pick<ToolCallData, 'name' | 'arguments'>,
  t: ToolLabelT,
  streaming = false,
): string {
  return getToolDisplayLabel(toolCall.name, t, {
    streaming,
    arguments: toolCall.arguments,
  });
}
