#!/usr/bin/env node
/**
 * Generate bench case JSON files from TOOL_HANDLER_MAP (one per tool).
 * Run: node scripts/bench/generate-cases.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '../..');
const CASES_DIR = path.join(__dirname, 'cases');

const BENCH_USER_DATA = path.join(process.env.HOME || '/tmp', '.dome-bench');
const BENCH_SANDBOX = path.join(BENCH_USER_DATA, 'bench-sandbox');
const BENCH_MARKER = path.join(BENCH_SANDBOX, 'bench-marker.json');
const BENCH_WRITE_TEST = path.join(BENCH_USER_DATA, 'bench-write-test.txt');

function indexOfMatchingBrace(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractToolHandlerKeys(mapBody) {
  const keys = [];
  const re = /^\s*([a-zA-Z0-9_]+)\s*:\s*'/gm;
  let m;
  while ((m = re.exec(mapBody)) !== null) keys.push(m[1]);
  return keys;
}

const CATEGORY_MAP = {
  dome_load_doc: 'meta',
  get_tool_definition: 'meta',
  remember_fact: 'meta',
  web_search: 'web',
  web_fetch: 'web',
  deep_research: 'web',
  browser_get_active_tab: 'web',
  resource_search: 'resources',
  resource_get: 'resources',
  resource_get_active: 'resources',
  resource_get_pinned: 'resources',
  resource_get_section: 'resources',
  resource_list: 'resources',
  resource_semantic_search: 'resources',
  resource_hybrid_search: 'resources',
  get_document_structure: 'resources',
  project_list: 'resources',
  project_get: 'resources',
  get_recent_resources: 'resources',
  get_current_project: 'resources',
  get_library_overview: 'resources',
  resource_get_library_overview: 'resources',
  resource_create: 'resources',
  resource_update: 'resources',
  resource_delete: 'resources',
  resource_move_to_folder: 'resources',
  link_resources: 'graph',
  get_related_resources: 'graph',
  generate_knowledge_graph: 'graph',
  interaction_list: 'resources',
  generate_mindmap: 'studio',
  generate_quiz: 'studio',
  generate_guide: 'studio',
  generate_faq: 'studio',
  generate_timeline: 'studio',
  generate_table: 'studio',
  flashcard_create: 'studio',
  notebook_get: 'notebook',
  notebook_add_cell: 'notebook',
  notebook_update_cell: 'notebook',
  notebook_delete_cell: 'notebook',
  excel_get: 'excel',
  excel_get_file_path: 'excel',
  excel_set_cell: 'excel',
  excel_set_range: 'excel',
  excel_add_row: 'excel',
  excel_add_sheet: 'excel',
  excel_create: 'excel',
  excel_export: 'excel',
  docx_get: 'docx',
  docx_get_file_path: 'docx',
  docx_create: 'docx',
  docx_update: 'docx',
  docx_delete: 'docx',
  ppt_create: 'ppt',
  ppt_get_file_path: 'ppt',
  ppt_get_slides: 'ppt',
  ppt_get_slide_images: 'ppt',
  ppt_export: 'ppt',
  calendar_list_events: 'calendar',
  calendar_get_upcoming: 'calendar',
  calendar_create_event: 'calendar',
  calendar_update_event: 'calendar',
  calendar_delete_event: 'calendar',
  agent_create: 'entity',
  automation_create: 'entity',
  workflow_create: 'entity',
  marketplace_search: 'entity',
  marketplace_install: 'entity',
  pdf_render_page: 'pdf',
  image_describe: 'image',
  screen_understand: 'image',
  image_crop: 'image',
  image_thumbnail: 'image',
  file_read: 'file',
  file_write: 'file',
  file_list: 'file',
  file_tree: 'file',
  file_search: 'file',
  skill_read: 'file',
  shell_exec: 'file',
  artifact_create: 'artifact',
  artifact_get: 'artifact',
  artifact_merge_data: 'artifact',
  artifact_update_state: 'artifact',
  artifact_list: 'artifact',
  artifact_delete: 'artifact',
  artifact_link_resource: 'artifact',
  artifact_design: 'artifact',
  feeder_create: 'feeder',
  feeder_list: 'feeder',
  feeder_run: 'feeder',
  feeder_update_script: 'feeder',
  feeder_delete: 'feeder',
  feeder_history: 'feeder',
  feeder_secret_request: 'feeder',
  ui_point_to: 'ui',
  ui_click: 'ui',
  ui_type: 'ui',
  ui_scroll: 'ui',
  ui_navigate: 'ui',
  ui_get_elements: 'ui',
  ui_hide_cursor: 'ui',
};

const OPTIONAL_TOOLS = new Set([
  'browser_get_active_tab',
  'screen_understand',
  'ui_point_to',
  'ui_click',
  'ui_type',
  'ui_scroll',
  'ui_navigate',
  'ui_get_elements',
  'ui_hide_cursor',
  'image_crop',
  'image_thumbnail',
  'image_describe',
  'marketplace_install',
  'feeder_run',
  'feeder_secret_request',
  'deep_research',
]);

const PROMPTS = {
  dome_load_doc: 'Antes de crear un agente, carga las reglas con dome_load_doc (id: entity_rules) y confirma que las leíste.',
  get_tool_definition: '¿Qué parámetros requiere la herramienta ppt_create? Usa get_tool_definition.',
  remember_fact: 'Recuerda que mi idioma preferido para respuestas es español breve. Usa remember_fact.',
  web_search: 'Busca noticias recientes (2026) sobre avances en fusión nuclear. Resume con fuentes.',
  web_fetch: 'Lee el contenido de https://example.com y resume en 3 puntos.',
  deep_research: 'Investiga en profundidad el impacto de CRISPR en agricultura sostenible.',
  browser_get_active_tab: '¿Qué página tengo abierta en el navegador externo? Usa browser_get_active_tab.',
  resource_search: 'Busca en mi biblioteca notas sobre termodinámica (proyecto bench-project).',
  resource_get: 'Lee el contenido completo del recurso bench-note-thermo (id exacto).',
  resource_get_active: 'Resume el recurso que tengo activo en el visor.',
  resource_get_pinned: 'Usa el recurso pineado bench-note-1 y resume su contenido.',
  resource_get_section: 'Tras buscar "entropía", amplía el chunk relevante con resource_get_section.',
  resource_list: 'Lista los recursos del proyecto bench-project.',
  resource_semantic_search: 'Búsqueda semántica: ¿dónde hablo de backpropagation en bench-project?',
  resource_hybrid_search: 'Busca "entropía" en mis documentos del proyecto bench-project.',
  get_document_structure: '¿Cuál es la estructura del documento bench-pdf-1?',
  project_list: 'Lista proyectos y confirma que existe bench-project (no explores el código de Dome).',
  project_get: 'Describe el proyecto bench-project.',
  get_recent_resources: '¿Qué recursos abrí recientemente?',
  get_current_project: '¿Cuál es el proyecto activo actual?',
  get_library_overview: 'Muéstrame la estructura de la biblioteca del proyecto bench-project.',
  resource_get_library_overview: 'Overview de biblioteca para bench-project (resource_get_library_overview).',
  resource_create: 'Crea una nota titulada "Bench scratch note" en bench-project (luego puedes ignorarla).',
  resource_update: 'Actualiza el título de bench-note-1 a "Bench Note Alpha (updated)".',
  resource_delete: 'NO borres nada real: explica qué haría resource_delete y pide confirmación sin ejecutar delete.',
  resource_move_to_folder: 'Mueve bench-note-2 dentro de bench-folder si aún no está.',
  link_resources: 'Enlaza bench-note-1 con bench-note-thermo con relación "related".',
  get_related_resources: '¿Qué recursos están relacionados con bench-note-thermo?',
  generate_knowledge_graph: 'Genera un grafo de conocimiento para bench-project (fuentes: notas bench).',
  interaction_list: 'Lista mis interacciones recientes.',
  generate_mindmap:
    'Llama generate_mindmap con project_id bench-project y source_ids ["bench-note-thermo"]. Luego resume el resultado.',
  generate_quiz:
    'Llama generate_quiz con project_id bench-project, source_ids ["bench-note-thermo"], num_questions 3, difficulty medium.',
  generate_guide:
    '1) Invoca generate_guide con project_id bench-project y source_ids ["bench-note-thermo"]. 2) En la respuesta FINAL escribe JSON type guide con al menos 2 sections (title+content), sin pegar el raw del tool.',
  generate_faq:
    '1) Invoca generate_faq con project_id bench-project y source_ids ["bench-note-thermo"]. 2) En la respuesta FINAL escribe JSON type faq con al menos 3 pairs (question+answer).',
  generate_timeline:
    '1) Invoca generate_timeline con project_id bench-project y source_ids ["bench-note-thermo"]. 2) En tu respuesta FINAL (no copies el JSON del tool), escribe {"type":"timeline","events":[{"date":"1800s","title":"...","description":"..."}]} con al menos 3 eventos sobre termodinámica.',
  generate_table:
    '1) Invoca generate_table con project_id bench-project y source_ids ["bench-note-thermo"]. 2) En la respuesta FINAL escribe JSON type table con columns y al menos 2 rows.',
  flashcard_create: 'Crea un mazo de 3 flashcards sobre entropía y entalpía (proyecto bench-project).',
  notebook_get: 'Si existe un notebook en bench-project, muéstralo; si no, indícalo sin inventar IDs.',
  notebook_add_cell: 'En un notebook existente del bench, añade celda markdown "test"; si no hay notebook, explícalo.',
  notebook_update_cell: 'Actualiza la celda 0 de un notebook bench si existe.',
  notebook_delete_cell: 'Explica cómo borrarías la última celda de un notebook bench sin ejecutar si no hay id.',
  excel_get: 'Lee la hoja Ventas del Excel bench-xlsx-1.',
  excel_get_file_path: 'Dame la ruta de archivo del recurso bench-xlsx-1.',
  excel_set_cell: 'Pon el valor 42 en la celda B2 de bench-xlsx-1 (hoja Ventas).',
  excel_set_range: 'Rellena A4:C4 en bench-xlsx-1 con valores de prueba 1,2,3.',
  excel_add_row: 'Añade una fila "Test" al final de Ventas en bench-xlsx-1.',
  excel_add_sheet: 'Añade hoja "Bench" al Excel bench-xlsx-1.',
  excel_create: 'Crea un Excel titulado "Bench Budget" con una hoja de gastos de ejemplo.',
  excel_export: 'Exporta bench-xlsx-1 a CSV si es posible.',
  docx_get: 'Lee el documento bench-docx-1.',
  docx_get_file_path: 'Ruta del archivo bench-docx-1.',
  docx_create: 'Crea un Word breve "Bench Informe" con sección Introducción.',
  docx_update: 'Añade párrafo Conclusiones al bench-docx-1 si existe.',
  docx_delete: 'Explica docx_delete sin borrar bench-docx-1.',
  ppt_create: 'Crea una presentación de 3 diapositivas sobre termodinámica titulada Bench PPT Test.',
  ppt_get_file_path: 'Ruta del PPT bench-ppt-1.',
  ppt_get_slides: 'Lista diapositivas de bench-ppt-1.',
  ppt_get_slide_images: 'Captura imágenes de slides de bench-ppt-1 si el archivo es válido.',
  ppt_export: 'Exporta bench-ppt-1 si es posible.',
  calendar_list_events: 'Lista eventos del calendario.',
  calendar_get_upcoming: '¿Qué eventos próximos tengo?',
  calendar_create_event: 'Crea evento "Bench reunion" mañana 10:00-11:00 (Europe/Madrid).',
  calendar_update_event: 'Si hay un evento bench, muévelo una hora; si no, explícalo.',
  calendar_delete_event: 'Explica calendar_delete_event sin borrar eventos reales del usuario.',
  agent_create: 'Crea un agente llamado "Bench Research Bot" con tools web_search y resource_search.',
  automation_create: 'Crea una automatización diaria 09:00 que ejecute un agente de prueba (bench).',
  workflow_create: 'Crea un workflow llamado "Bench Pipeline" con descripción breve.',
  marketplace_search: 'Busca en marketplace agents de investigación.',
  marketplace_install: 'Explica marketplace_install sin instalar nada real.',
  pdf_render_page: 'Renderiza la página 1 del PDF bench-pdf-1.',
  image_describe: 'Describe una imagen de prueba si tienes path; si no, indica limitación.',
  screen_understand: '¿Qué hay en mi pantalla? Usa screen_understand.',
  image_crop: 'Explica image_crop con coordenadas de ejemplo sin archivo real.',
  image_thumbnail: 'Genera thumbnail si hay imagen bench; si no, indícalo.',
  file_read: `Lee solo este archivo (ruta absoluta): ${BENCH_MARKER}. Devuelve el campo JSON "name".`,
  file_write: `Escribe "bench-ok" en ${BENCH_WRITE_TEST} (crea el directorio si falta).`,
  file_list: `Lista archivos en ${BENCH_SANDBOX} (sandbox bench, no el repo Dome).`,
  file_tree: `Árbol de ${BENCH_SANDBOX} con profundidad 2.`,
  file_search: `Busca *.json en ${BENCH_SANDBOX}.`,
  skill_read:
    'Invoca skill_read con skill_id "bench-runner" y path "SKILL.md". Si falla, usa get_tool_definition para skill_read y explica el error.',
  shell_exec:
    'Explica qué hace shell_exec y por qué NO la ejecutarías en este bench (solo documentación, sin invocar shell_exec).',
  artifact_design: 'Diseña spec JSON para un artifact dossier de benchmark LLM (artifact_design).',
  artifact_create: 'Crea artifact persistido "Bench Counter" HTML mínimo con contador.',
  artifact_get: 'Si creaste Bench Counter, léelo con artifact_get; si no, artifact_list primero.',
  artifact_merge_data: 'Explica artifact_merge_data con patch de ejemplo.',
  artifact_update_state: 'Actualiza estado de un artifact bench si existe.',
  artifact_list: 'Lista artifacts del proyecto bench-project.',
  artifact_delete: 'Explica artifact_delete sin borrar artifacts del usuario.',
  artifact_link_resource: 'Vincula bench-xlsx-1 a un artifact bench si existe.',
  feeder_create: 'Explica feeder_create para un dashboard bench sin ejecutar si falta artifact.',
  feeder_list: 'Lista feeders existentes.',
  feeder_run: 'Ejecuta feeder solo si hay uno bench; si no, SKIP explicado.',
  feeder_update_script: 'Explica feeder_update_script.',
  feeder_delete: 'Explica feeder_delete.',
  feeder_history: 'Historial de un feeder si existe.',
  feeder_secret_request: 'Solicita secreto de prueba "BENCH_API" para feeder.',
  ui_point_to:
    'Invoca ui_point_to con target "tab-home" y tooltip "Bench". No pidas más parámetros al usuario.',
  ui_click:
    'Invoca ui_click con target "tab-home" en esta misma respuesta. No pidas el target al usuario.',
  ui_type:
    'Invoca ui_type con target "tab-home" y text "bench-ui-type-ok". No pidas parámetros al usuario.',
  ui_scroll:
    'Invoca ui_scroll con direction "down" y amount 300. No pidas más parámetros.',
  ui_navigate:
    'Invoca ui_navigate con destination "settings". No pidas más parámetros.',
  ui_get_elements: 'Lista elementos UI visibles con ui_get_elements.',
  ui_hide_cursor:
    'Explica qué hace ui_hide_cursor y cuándo usarla (no la invoques en este caso de documentación).',
};

const FIXTURES_BY_TOOL = {
  resource_get: ['bench-note-thermo'],
  resource_get_pinned: ['bench-note-1'],
  resource_hybrid_search: ['bench-note-thermo'],
  resource_semantic_search: ['bench-note-1'],
  get_document_structure: ['bench-pdf-1'],
  excel_get: ['bench-xlsx-1'],
  excel_get_file_path: ['bench-xlsx-1'],
  excel_set_cell: ['bench-xlsx-1'],
  excel_set_range: ['bench-xlsx-1'],
  excel_add_row: ['bench-xlsx-1'],
  excel_add_sheet: ['bench-xlsx-1'],
  excel_export: ['bench-xlsx-1'],
  docx_get: ['bench-docx-1'],
  docx_get_file_path: ['bench-docx-1'],
  docx_update: ['bench-docx-1'],
  ppt_get_file_path: ['bench-ppt-1'],
  ppt_get_slides: ['bench-ppt-1'],
  ppt_get_slide_images: ['bench-ppt-1'],
  ppt_export: ['bench-ppt-1'],
  pdf_render_page: ['bench-pdf-1'],
  generate_mindmap: ['bench-note-thermo'],
  generate_quiz: ['bench-note-thermo'],
  generate_guide: ['bench-note-thermo'],
  generate_faq: ['bench-note-thermo'],
  generate_timeline: ['bench-note-thermo'],
  generate_table: ['bench-note-thermo'],
  link_resources: ['bench-note-1', 'bench-note-thermo'],
  get_related_resources: ['bench-note-thermo'],
  resource_update: ['bench-note-1'],
  resource_move_to_folder: ['bench-note-2'],
};

/** Studio gather tools: agent must synthesize output JSON after the tool returns sources. */
const STUDIO_SYNTHESIS_TOOLS = new Set([
  'generate_guide',
  'generate_faq',
  'generate_timeline',
  'generate_table',
]);

const OUTPUT_SHAPE_BY_TOOL = {
  generate_timeline: {
    min_length: 60,
    contains_any: ['"events"', '"date"', '"title"'],
  },
  generate_guide: {
    min_length: 60,
    contains_any: ['"sections"', 'section', '"content"'],
  },
  generate_faq: {
    min_length: 60,
    contains_any: ['"question"', '"answer"', '"pairs"'],
  },
  generate_table: {
    min_length: 60,
    contains_any: ['"rows"', '"columns"', 'row'],
  },
};

const JUDGE_CRITERIA_BY_TOOL = {
  generate_timeline:
    'PASS si invocó generate_timeline y la respuesta incluye ≥3 eventos (timeline JSON o events[] con date/title). No exige texto narrativo antes del JSON.',
  generate_guide:
    'PASS si invocó generate_guide y la respuesta incluye contenido de guía (sections o equivalente).',
  generate_faq:
    'PASS si invocó generate_faq y la respuesta incluye ≥3 preguntas/respuestas (pairs[] o array {question,answer}).',
  generate_table:
    'PASS si invocó generate_table y la respuesta incluye tabla (columns/rows).',
  generate_quiz:
    'PASS si invocó generate_quiz y la respuesta incluye preguntas de quiz (JSON type quiz o questions[]).',
  generate_mindmap:
    'PASS si invocó generate_mindmap y resume el mapa o fuentes; no exige formato artifact estricto.',
  flashcard_create:
    'PASS si invocó flashcard_create y confirma mazo creado (3 tarjetas puede ser un solo batch call).',
  ui_click:
    'Debe invocar ui_click (tool_call nativo) con target tab-home; dispatched o error del handler es aceptable.',
  ui_type:
    'Debe invocar ui_type (tool_call nativo) con target tab-home y text bench-ui-type-ok; no pedir parámetros al usuario.',
};

const SUPERVISOR_CASES = [
  {
    id: 'supervisor.research',
    category: 'subagent',
    tool: 'call_research_agent',
    mode: 'supervisor',
    prompt: 'Delega al agente de investigación: resume tendencias de LLM en 2026.',
    expected_tools: ['call_research_agent'],
    judge_criteria: 'Debe delegar investigación y devolver síntesis con fuentes o hallazgos.',
  },
  {
    id: 'supervisor.library',
    category: 'subagent',
    tool: 'call_library_agent',
    mode: 'supervisor',
    prompt: 'Delega al library agent: encuentra material sobre termodinámica en bench-project.',
    expected_tools: ['call_library_agent'],
    fixtures: ['bench-note-thermo'],
  },
  {
    id: 'supervisor.writer',
    category: 'subagent',
    tool: 'call_writer_agent',
    mode: 'supervisor',
    prompt: 'Delega al writer agent: escribe un resumen corto de bench-note-thermo.',
    expected_tools: ['call_writer_agent'],
    fixtures: ['bench-note-thermo'],
    skip_hitl: false,
  },
  {
    id: 'supervisor.data',
    category: 'subagent',
    tool: 'call_data_agent',
    mode: 'supervisor',
    prompt: 'Delega al data agent: resume datos de bench-xlsx-1.',
    expected_tools: ['call_data_agent'],
    fixtures: ['bench-xlsx-1'],
    skip_hitl: false,
  },
  {
    id: 'async.start',
    category: 'subagent',
    tool: 'start_async_subagent_task',
    mode: 'supervisor',
    prompt: 'Inicia tarea async de investigación sobre fusión nuclear y devuelve task_id.',
    expected_tools: ['start_async_subagent_task'],
  },
];

/** Prompts that ask for explanation only — structural check must not require tool invocation. */
const EXPLAIN_ONLY_TOOLS = new Set([
  'resource_delete',
  'docx_delete',
  'calendar_delete_event',
  'artifact_delete',
  'artifact_merge_data',
  'feeder_delete',
  'feeder_update_script',
  'feeder_create',
  'feeder_run',
  'feeder_history',
  'marketplace_install',
  'image_crop',
  'image_describe',
  'screen_understand',
  'shell_exec',
  'ui_hide_cursor',
  'notebook_delete_cell',
  'notebook_get',
]);

const PREAMBLE_ALLOWED_TOOLS = new Set([
  'dome_load_doc',
  'get_tool_definition',
  'agent_create',
  'automation_create',
  'workflow_create',
]);

const FILE_TOOLS = new Set([
  'file_read',
  'file_write',
  'file_list',
  'file_tree',
  'file_search',
  'shell_exec',
  'skill_read',
]);

function defaultForbiddenTools(tool) {
  const forbidden = new Set(['shell_exec', 'glob']);
  const fsOnly = ['file_read', 'file_write', 'file_list', 'file_tree', 'file_search'];
  const libraryOnly = [
    'project_list',
    'get_library_overview',
    'resource_get_library_overview',
    'get_current_project',
  ];
  const searchOnly = ['resource_hybrid_search', 'resource_semantic_search', 'resource_search'];

  if (!FILE_TOOLS.has(tool)) {
    for (const t of fsOnly) forbidden.add(t);
  }
  if (!libraryOnly.includes(tool)) {
    for (const t of libraryOnly) forbidden.add(t);
  }
  if (!searchOnly.includes(tool) && tool !== 'artifact_link_resource') {
    for (const t of searchOnly) forbidden.add(t);
  }
  if (
    tool !== 'resource_create' &&
    !tool.startsWith('generate_') &&
    tool !== 'flashcard_create' &&
    !tool.startsWith('notebook_')
  ) {
    forbidden.add('resource_create');
  }
  return [...forbidden];
}

function buildCase(tool) {
  const category = CATEGORY_MAP[tool] || 'other';
  const optional = OPTIONAL_TOOLS.has(tool);
  const destructive = ['resource_delete', 'docx_delete', 'calendar_delete_event', 'artifact_delete'].includes(tool);
  const explainOnly = EXPLAIN_ONLY_TOOLS.has(tool);

  return {
    id: `${tool}.basic`,
    category,
    tool,
    mode: 'direct',
    prompt: PROMPTS[tool] || `Usa únicamente la herramienta ${tool} en bench-project. No explores el repo Dome.`,
    expected_tools: destructive || explainOnly ? [] : [tool],
    forbidden_tools: destructive
      ? [tool]
      : explainOnly
        ? defaultForbiddenTools(tool).filter((t) => t !== tool)
        : defaultForbiddenTools(tool),
    explain_only: explainOnly,
    allow_preamble: PREAMBLE_ALLOWED_TOOLS.has(tool) || explainOnly,
    fixtures: FIXTURES_BY_TOOL[tool] || [],
    context_resource_id: tool === 'resource_get_active' ? 'bench-note-thermo' : undefined,
    output_shape:
      category === 'ui'
        ? { min_length: 5 }
        : OUTPUT_SHAPE_BY_TOOL[tool] || (explainOnly ? { min_length: 30 } : { min_length: 20 }),
    judge_criteria: JUDGE_CRITERIA_BY_TOOL[tool]
      || (explainOnly
        ? `Debe explicar ${tool} con claridad; no es obligatorio invocar la tool si el prompt pide solo explicación.`
        : destructive
          ? 'Debe explicar la herramienta sin ejecutar acciones destructivas sin confirmación.'
          : STUDIO_SYNTHESIS_TOOLS.has(tool)
            ? `Debe invocar ${tool} y sintetizar el artefacto en la respuesta (no solo el payload del tool).`
            : `Debe invocar ${tool} (tool_call nativo) y dar respuesta útil.`),
    timeout_ms: ['deep_research', 'generate_knowledge_graph', 'ppt_create'].includes(tool) ? 120000 : 60000,
    skip_hitl: true,
    optional,
  };
}

function main() {
  const src = fs.readFileSync(path.join(ROOT, 'electron/tool-dispatcher.cjs'), 'utf-8');
  const mapEq = src.indexOf('const TOOL_HANDLER_MAP = ');
  const mapOpen = src.indexOf('{', mapEq);
  const mapClose = indexOfMatchingBrace(src, mapOpen);
  const mapBody = src.slice(mapOpen + 1, mapClose);
  const tools = extractToolHandlerKeys(mapBody);

  let written = 0;
  for (const tool of tools) {
    const category = CATEGORY_MAP[tool] || 'other';
    const dir = path.join(CASES_DIR, category);
    fs.mkdirSync(dir, { recursive: true });
    const caseDef = buildCase(tool);
    const outPath = path.join(dir, `${tool}.json`);
    fs.writeFileSync(outPath, `${JSON.stringify(caseDef, null, 2)}\n`);
    written++;
  }

  const subDir = path.join(CASES_DIR, 'subagent');
  fs.mkdirSync(subDir, { recursive: true });
  for (const sc of SUPERVISOR_CASES) {
    fs.writeFileSync(path.join(subDir, `${sc.id}.json`), `${JSON.stringify(sc, null, 2)}\n`);
    written++;
  }

  console.log(`[generate-cases] Wrote ${written} case files under ${CASES_DIR}`);
}

main();
