/**
 * Single place for tool name → UI label: prefers i18n `chat.tool_<normalized_id>`,
 * then static fallbacks (Spanish, used only when catalogue key missing).
 */
const TOOL_LABELS_FALLBACK: Record<string, string> = {
  web_search: 'Búsqueda web',
  web_fetch: 'Obteniendo contenido',
  resource_create: 'Creando recurso',
  resource_get: 'Obteniendo recurso',
  resource_search: 'Buscando recursos',
  call_research_agent: 'Delegando investigación',
  call_library_agent: 'Delegando consulta de biblioteca',
  call_writer_agent: 'Delegando creación de contenido',
  call_data_agent: 'Delegando procesamiento de datos',
  notebook_add_cell: 'Añadiendo celda',
  notebook_update_cell: 'Actualizando celda',
  notebook_delete_cell: 'Eliminando celda',
  pdf_extract_text: 'Extrayendo texto de PDF',
  pdf_get_metadata: 'Obteniendo metadatos de PDF',
  pdf_get_structure: 'Obteniendo estructura de PDF',
  pdf_summarize: 'Resumiendo PDF',
  pdf_extract_tables: 'Extrayendo tablas de PDF',
  image_crop: 'Recortando imagen',
  image_thumbnail: 'Generando miniatura',
  pdf_render_page: 'Renderizando página PDF',
};

function normalizeToolId(name: string): string {
  return (name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export type ToolLabelT = (key: string, opts?: { defaultValue?: string }) => string;

export function getToolDisplayLabel(name: string, t: ToolLabelT): string {
  const raw = (name || '').trim();
  if (!raw) return t('chat.tool_generic', { defaultValue: 'Herramienta' });

  const norm = normalizeToolId(raw);
  const key = `chat.tool_${norm}`;
  const translated = t(key);
  if (translated && translated !== key) return translated;

  if (TOOL_LABELS_FALLBACK[raw]) return TOOL_LABELS_FALLBACK[raw];

  if (norm.includes('postgres') || norm.includes('sql') || norm.includes('query')) {
    return t('chat.tool_sql_generic', { defaultValue: 'Consulta SQL' });
  }
  if (norm.includes('mcp') || norm.startsWith('mcp_')) {
    return t('chat.tool_mcp_generic', { defaultValue: 'Herramienta MCP' });
  }

  const humanized = raw.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return humanized || raw;
}
