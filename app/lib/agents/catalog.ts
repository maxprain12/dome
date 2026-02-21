/**
 * Tool catalog for Many Agents - maps tool IDs to metadata for UI selection
 */

export interface ToolCatalogEntry {
  id: string;
  label: string;
  description: string;
  group: 'web' | 'memory' | 'resources' | 'context' | 'flashcards' | 'studio' | 'audio' | 'research' | 'graph' | 'notebook' | 'excel' | 'ppt';
}

export const MANY_TOOL_CATALOG: ToolCatalogEntry[] = [
  // Web
  { id: 'web_search', label: 'Web Search', description: 'Buscar en internet', group: 'web' },
  { id: 'web_fetch', label: 'Web Fetch', description: 'Obtener contenido de una URL', group: 'web' },
  // Memory
  { id: 'memory_search', label: 'Memory Search', description: 'Búsqueda semántica en documentos', group: 'memory' },
  { id: 'memory_get', label: 'Memory Get', description: 'Obtener documento por ID', group: 'memory' },
  // Resources
  { id: 'resource_search', label: 'Resource Search', description: 'Buscar recursos por texto', group: 'resources' },
  { id: 'resource_get', label: 'Resource Get', description: 'Obtener recurso completo', group: 'resources' },
  { id: 'resource_list', label: 'Resource List', description: 'Listar recursos filtrados', group: 'resources' },
  { id: 'resource_semantic_search', label: 'Semantic Search', description: 'Búsqueda por significado', group: 'resources' },
  { id: 'resource_create', label: 'Resource Create', description: 'Crear nuevo recurso', group: 'resources' },
  { id: 'resource_update', label: 'Resource Update', description: 'Actualizar recurso existente', group: 'resources' },
  { id: 'resource_delete', label: 'Resource Delete', description: 'Eliminar recurso', group: 'resources' },
  { id: 'resource_move_to_folder', label: 'Resource Move', description: 'Mover recurso a carpeta', group: 'resources' },
  // Context
  { id: 'project_list', label: 'Project List', description: 'Listar proyectos', group: 'context' },
  { id: 'project_get', label: 'Project Get', description: 'Obtener proyecto', group: 'context' },
  { id: 'interaction_list', label: 'Interaction List', description: 'Listar interacciones de recurso', group: 'context' },
  { id: 'get_recent_resources', label: 'Recent Resources', description: 'Recursos recientes', group: 'context' },
  { id: 'get_current_project', label: 'Current Project', description: 'Proyecto actual', group: 'context' },
  { id: 'resource_get_library_overview', label: 'Library Overview', description: 'Resumen de biblioteca', group: 'context' },
  // Flashcards
  { id: 'flashcard_create', label: 'Flashcard Create', description: 'Crear tarjetas de estudio', group: 'flashcards' },
  // Studio
  { id: 'generate_mindmap', label: 'Generate Mindmap', description: 'Generar mapa mental', group: 'studio' },
  { id: 'generate_quiz', label: 'Generate Quiz', description: 'Generar cuestionario', group: 'studio' },
  // Audio
  { id: 'generate_audio_script', label: 'Audio Script', description: 'Generar guion de audio/podcast', group: 'audio' },
  // Research
  { id: 'deep_research', label: 'Deep Research', description: 'Investigación profunda', group: 'research' },
  // Graph
  { id: 'generate_knowledge_graph', label: 'Knowledge Graph', description: 'Generar grafo de conocimiento', group: 'graph' },
  { id: 'get_related_resources', label: 'Related Resources', description: 'Recursos relacionados', group: 'graph' },
  { id: 'create_resource_link', label: 'Create Link', description: 'Crear enlace entre recursos', group: 'graph' },
  { id: 'analyze_graph_structure', label: 'Analyze Graph', description: 'Analizar estructura del grafo', group: 'graph' },
  // Notebook
  { id: 'notebook_get', label: 'Notebook Get', description: 'Obtener notebook', group: 'notebook' },
  { id: 'notebook_add_cell', label: 'Notebook Add Cell', description: 'Añadir celda', group: 'notebook' },
  { id: 'notebook_update_cell', label: 'Notebook Update Cell', description: 'Actualizar celda', group: 'notebook' },
  { id: 'notebook_delete_cell', label: 'Notebook Delete Cell', description: 'Eliminar celda', group: 'notebook' },
  // Excel
  { id: 'excel_get', label: 'Excel Get', description: 'Obtener contenido Excel', group: 'excel' },
  { id: 'excel_get_file_path', label: 'Excel File Path', description: 'Ruta del archivo Excel', group: 'excel' },
  { id: 'excel_set_cell', label: 'Excel Set Cell', description: 'Establecer celda', group: 'excel' },
  { id: 'excel_set_range', label: 'Excel Set Range', description: 'Establecer rango', group: 'excel' },
  { id: 'excel_add_row', label: 'Excel Add Row', description: 'Añadir fila', group: 'excel' },
  { id: 'excel_add_sheet', label: 'Excel Add Sheet', description: 'Añadir hoja', group: 'excel' },
  { id: 'excel_create', label: 'Excel Create', description: 'Crear Excel', group: 'excel' },
  { id: 'excel_export', label: 'Excel Export', description: 'Exportar Excel', group: 'excel' },
  // PPT
  { id: 'ppt_create', label: 'PPT Create', description: 'Crear PowerPoint', group: 'ppt' },
  { id: 'ppt_get_file_path', label: 'PPT File Path', description: 'Ruta del archivo PPT', group: 'ppt' },
  { id: 'ppt_get_slides', label: 'PPT Get Slides', description: 'Obtener contenido de diapositivas', group: 'ppt' },
  { id: 'ppt_export', label: 'PPT Export', description: 'Exportar PowerPoint', group: 'ppt' },
];

const GROUP_LABELS: Record<ToolCatalogEntry['group'], string> = {
  web: 'Web',
  memory: 'Memoria',
  resources: 'Recursos',
  context: 'Contexto',
  flashcards: 'Flashcards',
  studio: 'Studio',
  audio: 'Audio',
  research: 'Investigación',
  graph: 'Grafo',
  notebook: 'Notebook',
  excel: 'Excel',
  ppt: 'Slides',
};

export function getToolCatalog() {
  return MANY_TOOL_CATALOG;
}

export function getToolsByGroup() {
  const byGroup = new Map<ToolCatalogEntry['group'], ToolCatalogEntry[]>();
  for (const entry of MANY_TOOL_CATALOG) {
    const list = byGroup.get(entry.group) ?? [];
    list.push(entry);
    byGroup.set(entry.group, list);
  }
  return byGroup;
}

export function getGroupLabel(group: ToolCatalogEntry['group']) {
  return GROUP_LABELS[group];
}

export function getToolById(id: string): ToolCatalogEntry | undefined {
  return MANY_TOOL_CATALOG.find((t) => t.id === id);
}
