/**
 * Tool catalog for Many Agents - maps tool IDs to metadata for UI selection
 */

export interface ToolCatalogEntry {
  id: string;
  label: string;
  description: string;
  group: 'web' | 'resources' | 'context' | 'flashcards' | 'studio' | 'audio' | 'research' | 'graph' | 'notebook' | 'excel' | 'ppt' | 'calendar';
}

export const MANY_TOOL_CATALOG: ToolCatalogEntry[] = [
  // Web
  {
    id: 'web_search',
    label: 'Web Search',
    description: 'Realiza búsquedas en la web usando Brave Search. Si Brave no está configurado, hace un fallback por scraping HTML menos fiable. Devuelve títulos, URLs y fragmentos relevantes para investigación actualizada.',
    group: 'web',
  },
  {
    id: 'web_fetch',
    label: 'Web Fetch',
    description: 'Descarga y extrae el contenido completo de una URL específica usando Playwright. Permite leer artículos, documentación, páginas de producto y cualquier recurso web en profundidad.',
    group: 'web',
  },

  {
    id: 'resource_search',
    label: 'Resource Search',
    description: 'Busca recursos en la biblioteca del proyecto usando búsqueda de texto completo (FTS5). Soporta filtros por tipo (nota, PDF, video, audio, URL) y devuelve metadatos con fragmentos del contenido.',
    group: 'resources',
  },
  {
    id: 'resource_get',
    label: 'Resource Get',
    description: 'Obtiene detalles de un recurso. Para PDFs indexados retorna solo la estructura (TOC con node_ids). Para notas y otros tipos retorna contenido completo. Usa resource_get_section para secciones específicas.',
    group: 'resources',
  },
  {
    id: 'resource_get_section',
    label: 'Resource Get Section',
    description: 'Obtiene el contenido (summary) de una sección específica de un PDF o nota indexada por node_id. Usar tras get_document_structure o resource_semantic_search.',
    group: 'resources',
  },
  {
    id: 'resource_list',
    label: 'Resource List',
    description: 'Lista los recursos del proyecto con filtros opcionales por tipo, carpeta y paginación. Devuelve nombre, tipo, tamaño y fechas. Útil para explorar qué materiales están disponibles.',
    group: 'resources',
  },
  {
    id: 'resource_semantic_search',
    label: 'Semantic Search',
    description: 'Busca recursos por significado semántico usando embeddings vectoriales (LanceDB). Encuentra documentos conceptualmente relacionados aunque no coincidan en palabras exactas. Más preciso que la búsqueda de texto para preguntas complejas.',
    group: 'resources',
  },
  {
    id: 'resource_create',
    label: 'Resource Create',
    description: 'Crea un nuevo recurso en la biblioteca: nota, notebook, documento Word, URL o carpeta. Permite guardar el output del agente directamente en la biblioteca del usuario como contenido persistente.',
    group: 'resources',
  },
  {
    id: 'resource_update',
    label: 'Resource Update',
    description: 'Actualiza el título o contenido de un recurso existente. Para notas y documentos Word actualiza el texto; para Word también regenera el archivo binario .docx. Útil para enriquecer o corregir materiales existentes.',
    group: 'resources',
  },
  {
    id: 'resource_delete',
    label: 'Resource Delete',
    description: 'Elimina permanentemente un recurso de la biblioteca incluyendo su archivo en disco. Usar con precaución; esta acción no es reversible desde el agente.',
    group: 'resources',
  },
  {
    id: 'resource_move_to_folder',
    label: 'Resource Move',
    description: 'Mueve un recurso a una carpeta destino dentro del proyecto. Valida que el destino exista y evita ciclos en la jerarquía de carpetas. Ideal para organizar automáticamente los materiales generados.',
    group: 'resources',
  },

  // Context
  {
    id: 'project_list',
    label: 'Project List',
    description: 'Lista todos los proyectos del usuario con nombre, descripción y fechas. Permite al agente conocer la estructura de proyectos disponibles para contextualizar su trabajo o sugerir dónde guardar recursos.',
    group: 'context',
  },
  {
    id: 'project_get',
    label: 'Project Get',
    description: 'Obtiene los detalles completos de un proyecto específico: nombre, descripción, metadatos y configuración. Útil para entender el contexto y propósito de la colección de recursos con la que trabaja el agente.',
    group: 'context',
  },
  {
    id: 'interaction_list',
    label: 'Interaction List',
    description: 'Lista las anotaciones, comentarios y highlights del usuario en un recurso específico. Permite al agente acceder a las reflexiones y notas marginales del usuario sobre un documento.',
    group: 'context',
  },
  {
    id: 'get_recent_resources',
    label: 'Recent Resources',
    description: 'Devuelve los recursos abiertos o modificados más recientemente en el proyecto. Permite al agente identificar en qué materiales está trabajando actualmente el usuario para dar contexto relevante.',
    group: 'context',
  },
  {
    id: 'get_current_project',
    label: 'Current Project',
    description: 'Obtiene el proyecto activo en este momento con su ID, nombre y descripción. Primer paso recomendado para cualquier agente que necesite operar dentro del contexto del proyecto del usuario.',
    group: 'context',
  },
  {
    id: 'resource_get_library_overview',
    label: 'Library Overview',
    description: 'Devuelve el árbol completo de carpetas y recursos del proyecto activo. Muestra la estructura jerárquica completa de la biblioteca para que el agente pueda navegar y entender la organización del conocimiento.',
    group: 'context',
  },

  // Flashcards
  {
    id: 'flashcard_create',
    label: 'Flashcard Create',
    description: 'Crea un deck de flashcards con tarjetas pregunta-respuesta a partir de contenido. Las tarjetas se guardan en la biblioteca y se pueden repasar con el sistema de repetición espaciada de Dome. Ideal para aprendizaje y memorización.',
    group: 'flashcards',
  },

  // Studio
  {
    id: 'generate_mindmap',
    label: 'Generate Mindmap',
    description: 'Genera un mapa mental jerárquico en formato JSON a partir de un tema o documento. El mapa se guarda como recurso visual interactivo en la biblioteca del proyecto. Perfecto para organizar ideas y estructurar conocimiento.',
    group: 'studio',
  },
  {
    id: 'generate_quiz',
    label: 'Generate Quiz',
    description: 'Crea un cuestionario interactivo con preguntas de opción múltiple, verdadero/falso o respuesta corta a partir de contenido. El quiz se guarda en la biblioteca y puede usarse para autoevaluación o preparación de exámenes.',
    group: 'studio',
  },

  // Audio
  {
    id: 'generate_audio_script',
    label: 'Audio Script',
    description: 'Genera un guion estructurado para podcast o audio overview a partir de un tema o documento. El script está optimizado para narración natural, con introducción, cuerpo y conclusión. Se guarda como recurso en la biblioteca.',
    group: 'audio',
  },

  // Research
  {
    id: 'deep_research',
    label: 'Deep Research',
    description: 'Lanza una investigación profunda multi-paso sobre un tema usando búsqueda web iterativa. Realiza múltiples consultas, verifica fuentes cruzadas y produce un informe exhaustivo con citas. Tarda más pero genera análisis de alta calidad.',
    group: 'research',
  },

  // Graph
  {
    id: 'generate_knowledge_graph',
    label: 'Knowledge Graph',
    description: 'Genera un grafo de conocimiento que conecta conceptos, entidades y relaciones extraídos de documentos. El grafo se visualiza en la vista de Grafo de Dome y permite explorar conexiones entre ideas de la biblioteca.',
    group: 'graph',
  },
  {
    id: 'get_related_resources',
    label: 'Related Resources',
    description: 'Devuelve los recursos relacionados con un recurso dado basándose en los enlaces del grafo de conocimiento. Permite al agente descubrir conexiones temáticas entre documentos que el usuario ha vinculado explícita o implícitamente.',
    group: 'graph',
  },
  {
    id: 'create_resource_link',
    label: 'Create Link',
    description: 'Crea un enlace semántico entre dos recursos de la biblioteca con una etiqueta que describe la relación (ej. "contradice", "amplía", "cita"). Los enlaces enriquecen el grafo de conocimiento y facilitan la navegación conceptual.',
    group: 'graph',
  },
  {
    id: 'analyze_graph_structure',
    label: 'Analyze Graph',
    description: 'Analiza la estructura del grafo de conocimiento del proyecto: nodos centrales, clusters temáticos, recursos aislados y caminos de conexión. Útil para identificar lagunas de conocimiento y áreas bien documentadas.',
    group: 'graph',
  },

  // Notebook
  {
    id: 'notebook_get',
    label: 'Notebook Get',
    description: 'Obtiene el contenido completo de un notebook con todas sus celdas (código, markdown, output). Permite al agente leer y entender el flujo de análisis documentado en un notebook de Dome.',
    group: 'notebook',
  },
  {
    id: 'notebook_add_cell',
    label: 'Notebook Add Cell',
    description: 'Añade una nueva celda (código o markdown) a un notebook en una posición específica. Permite al agente extender análisis existentes, añadir notas explicativas o insertar nuevos bloques de código documentado.',
    group: 'notebook',
  },
  {
    id: 'notebook_update_cell',
    label: 'Notebook Update Cell',
    description: 'Actualiza el contenido de una celda existente en un notebook. Útil para corregir código, mejorar explicaciones o actualizar outputs de análisis previamente guardados.',
    group: 'notebook',
  },
  {
    id: 'notebook_delete_cell',
    label: 'Notebook Delete Cell',
    description: 'Elimina una celda de un notebook por su índice. Permite al agente limpiar notebooks, eliminar celdas redundantes o reorganizar el flujo de análisis.',
    group: 'notebook',
  },

  // Excel
  {
    id: 'excel_get',
    label: 'Excel Get',
    description: 'Lee el contenido completo de un archivo Excel: hojas, rangos, valores y fórmulas. Devuelve los datos estructurados para que el agente pueda analizarlos, calcular estadísticas e identificar patrones.',
    group: 'excel',
  },
  {
    id: 'excel_get_file_path',
    label: 'Excel File Path',
    description: 'Obtiene la ruta absoluta en disco de un archivo Excel de la biblioteca. Necesario cuando otras herramientas externas o scripts necesitan acceder directamente al archivo.',
    group: 'excel',
  },
  {
    id: 'excel_set_cell',
    label: 'Excel Set Cell',
    description: 'Establece el valor de una celda específica en una hoja de Excel (ej. A1, B3). Permite al agente escribir resultados de cálculos, labels o actualizaciones puntuales en hojas de cálculo existentes.',
    group: 'excel',
  },
  {
    id: 'excel_set_range',
    label: 'Excel Set Range',
    description: 'Escribe un rango de valores en múltiples celdas de Excel en una sola operación. Ideal para poblar tablas completas, actualizar series de datos o insertar resultados de análisis de forma eficiente.',
    group: 'excel',
  },
  {
    id: 'excel_add_row',
    label: 'Excel Add Row',
    description: 'Añade una nueva fila al final de una hoja de Excel con los valores especificados. Útil para registrar nuevas entradas de datos, logs de actividad o resultados incrementales en hojas de seguimiento.',
    group: 'excel',
  },
  {
    id: 'excel_add_sheet',
    label: 'Excel Add Sheet',
    description: 'Añade una nueva hoja (pestaña) a un archivo Excel existente con el nombre indicado. Permite organizar análisis complejos en hojas separadas dentro del mismo archivo.',
    group: 'excel',
  },
  {
    id: 'excel_create',
    label: 'Excel Create',
    description: 'Crea un nuevo archivo Excel en la biblioteca con estructura inicial definida: cabeceras, datos de muestra y formato básico. El archivo se guarda como recurso y queda disponible para edición posterior.',
    group: 'excel',
  },
  {
    id: 'excel_export',
    label: 'Excel Export',
    description: 'Exporta un archivo Excel a formato CSV o lo abre en la aplicación nativa del sistema. Permite compartir o procesar los datos con otras herramientas externas a Dome.',
    group: 'excel',
  },

  // PPT
  {
    id: 'ppt_create',
    label: 'PPT Create',
    description: 'Crea una presentación PowerPoint (.pptx) con diapositivas estructuradas a partir de un esquema de contenido. Soporta múltiples layouts, imágenes, gráficos y temas visuales. Guarda el archivo en la biblioteca.',
    group: 'ppt',
  },
  {
    id: 'ppt_get_file_path',
    label: 'PPT File Path',
    description: 'Obtiene la ruta absoluta en disco de un archivo PowerPoint de la biblioteca. Necesario para abrir el archivo con la aplicación nativa o para procesamiento externo.',
    group: 'ppt',
  },
  {
    id: 'ppt_get_slides',
    label: 'PPT Get Slides',
    description: 'Lee el contenido de las diapositivas de una presentación existente: títulos, textos, notas del presentador y estructura. Permite al agente analizar o continuar una presentación ya creada.',
    group: 'ppt',
  },
  {
    id: 'ppt_export',
    label: 'PPT Export',
    description: 'Exporta una presentación PowerPoint a PDF o abre el archivo en la aplicación nativa (Keynote, PowerPoint). Permite compartir la presentación generada en formatos universales.',
    group: 'ppt',
  },

  // Calendar
  {
    id: 'calendar_list',
    label: 'Calendar List',
    description: 'Lista todos los calendarios disponibles del usuario. Permite al agente conocer qué calendarios existen (personal, trabajo, proyectos) antes de crear o consultar eventos en el calendario correcto.',
    group: 'calendar',
  },
  {
    id: 'calendar_get_upcoming',
    label: 'Calendar Upcoming',
    description: 'Obtiene los próximos eventos del calendario en un rango de fechas. Permite al agente conocer la agenda del usuario para planificar tareas, evitar conflictos y sugerir fechas disponibles.',
    group: 'calendar',
  },
  {
    id: 'calendar_create_event',
    label: 'Calendar Create Event',
    description: 'Crea un nuevo evento en el calendario con título, fecha, hora, duración, descripción y recordatorios. Ideal para que el agente registre tareas, deadlines, reuniones y milestones de proyectos automáticamente.',
    group: 'calendar',
  },
  {
    id: 'calendar_update_event',
    label: 'Calendar Update Event',
    description: 'Actualiza un evento existente en el calendario: cambia título, fecha, hora o descripción. Permite al agente ajustar la planificación cuando cambian los plazos o los detalles de una tarea.',
    group: 'calendar',
  },
  {
    id: 'calendar_delete_event',
    label: 'Calendar Delete Event',
    description: 'Elimina un evento del calendario por su ID. Permite al agente limpiar la agenda cuando una tarea se completa, cancela o se reprograma definitivamente.',
    group: 'calendar',
  },
];

const GROUP_LABELS: Record<ToolCatalogEntry['group'], string> = {
  web: 'Web',
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
  calendar: 'Calendario',
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
