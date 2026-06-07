/* eslint-disable no-console */
/**
 * Guide bootstrap: creates a rich onboarding guide on first launch.
 * Creates a folder structure in the default project with notes showcasing
 * all editor capabilities and how to use each section of the app.
 *
 * Primary seed guarded by settings `guide_seeded_v2`. Empty guide bodies from
 * older builds are patched once via `guide_body_repaired_v2`.
 */

'use strict';

const { randomUUID } = require('crypto');

const SEED_FLAG = 'guide_seeded_v2';
/** Bump when repair heuristics change (forces one more SQLite pass). */
const GUIDE_REPAIR_FLAG = 'guide_body_repaired_v2';
const PROJECT_ID = 'default';
/** Sidebar may truncate emoji; recognize both seeded title and alias. */
const GUIDE_FOLDER_TITLES = ['📚 Guía de Dome', 'Guía de Dome'];

/** @returns {Array<{ id: string }>} */
function listGuideRootFolders(db) {
  const placeholders = GUIDE_FOLDER_TITLES.map(() => '?').join(',');
  return db.prepare(`SELECT id FROM resources WHERE type = 'folder' AND title IN (${placeholders})`).all(
    ...GUIDE_FOLDER_TITLES,
  );
}

// ─── Tiny JSON content helpers ───────────────────────────────────────────────

function doc(...nodes) {
  return JSON.stringify({ type: 'doc', content: nodes });
}

function h(level, ...inline) {
  return { type: 'heading', attrs: { level }, content: inline };
}

function p(...inline) {
  return { type: 'paragraph', content: inline.length ? inline : undefined };
}

function text(t, marks) {
  const node = { type: 'text', text: t };
  if (marks && marks.length) node.marks = marks;
  return node;
}

function bold(t) { return text(t, [{ type: 'bold' }]); }
function italic(t) { return text(t, [{ type: 'italic' }]); }
function code(t) { return text(t, [{ type: 'code' }]); }
function link(t, href) { return text(t, [{ type: 'link', attrs: { href } }]); }

function mention(id, label) {
  return {
    type: 'mention',
    attrs: { id, label, resourceType: 'note', mentionSuggestionChar: '@' },
  };
}

function callout(variant, ...content) {
  return { type: 'callout', attrs: { variant }, content };
}

function toggle(summary, ...bodyContent) {
  return {
    type: 'toggleBlock',
    attrs: { collapsed: false },
    content: [
      { type: 'toggleSummary', content: [text(summary)] },
      { type: 'toggleBody', content: bodyContent },
    ],
  };
}

function ul(...items) {
  return {
    type: 'bulletList',
    content: items.map((c) => ({
      type: 'listItem',
      // c is already [paragraph, ...] — use it directly as listItem content
      content: Array.isArray(c) ? c : [p(c)],
    })),
  };
}

function ol(...items) {
  return {
    type: 'orderedList',
    content: items.map((c) => ({
      type: 'listItem',
      // c is already [paragraph, ...] — use it directly as listItem content
      content: Array.isArray(c) ? c : [p(c)],
    })),
  };
}

function tasks(...items) {
  return {
    type: 'taskList',
    content: items.map(([checked, ...inline]) => ({
      type: 'taskItem',
      attrs: { checked },
      content: [p(...inline)],
    })),
  };
}

function quote(...content) {
  return { type: 'blockquote', content };
}

function codeblock(lang, code) {
  return { type: 'codeBlock', attrs: { language: lang }, content: [{ type: 'text', text: code }] };
}

function hr() {
  return { type: 'horizontalRule' };
}

function sep() {
  return p();
}

// ─── Note content builders ────────────────────────────────────────────────────

function buildMainNote() {
  return doc(
    h(1, text('👋 Bienvenido a Dome')),
    callout('olive',
      p(
        bold('Dome'),
        text(' es tu espacio de conocimiento personal — un editor potente, un asistente IA integrado y un sistema de recursos interconectados.'),
      ),
    ),
    sep(),
    h(2, text('📚 Esta guía')),
    p(text('Explora la carpeta '), bold('Apartados'), text(' en el sidebar para descubrir todo lo que puedes hacer:')),
    ul(
      [p(text('✍️  '), bold('El editor de notas'), text(' — Bloques, slash commands, formatos y más'))],
      [p(text('🤖  '), bold('Asistente Many (IA)'), text(' — Tu copiloto de escritura e investigación'))],
      [p(text('🔗  '), bold('Backlinks y menciones'), text(' — Conecta ideas con @menciones'))],
      [p(text('📁  '), bold('Gestión de recursos'), text(' — PDFs, imágenes, URLs y notas'))],
      [p(text('⚡  '), bold('Agentes y automatizaciones'), text(' — Flujos de trabajo con IA'))],
      [p(text('🔍  '), bold('Búsqueda semántica'), text(' — Encuentra cualquier cosa al instante'))],
    ),
    sep(),
    h(2, text('💡 Cómo usar las @menciones')),
    p(text('Cuando estés en cualquier nota, escribe '), code('@'), text(' seguido del nombre de una nota para crear un enlace bidireccional. Por ejemplo, escribe '), code('@El editor'), text(' para vincular a la nota del editor.')),
    sep(),
    h(2, text('🚀 Primeros pasos')),
    tasks(
      [false, text('Abre el panel '), bold('Many'), text(' (botón ✦ en la barra superior) y hazle una pregunta')],
      [false, text('Escribe '), code('/'), text(' en cualquier nota para abrir el menú de bloques')],
      [false, text('Escribe '), code('@'), text(' para mencionar una nota o recurso')],
      [false, text('Selecciona texto y usa el menú de burbuja para aplicar formato con IA')],
      [false, text('Arrastra un PDF al sidebar para importarlo y chatear con él')],
    ),
    sep(),
    h(2, text('⌨️ Atajos esenciales')),
    ul(
      [p(code('⌘S'), text(' — Guardar manualmente (o guarda automático cada 1.5s)'))],
      [p(code('⌘J'), text(' — Insertar bloque IA en el cursor'))],
      [p(code('/'), text(' — Menú de bloques (slash command)'))],
      [p(code('@'), text(' — Mencionar recurso del workspace'))],
      [p(code('⌘K'), text(' — Crear/editar enlace'))],
      [p(code('⌘\\'), text(' — Modo enfocado (Focus mode)'))],
    ),
    sep(),
    callout('info',
      p(text('💡 '), bold('Tip:'), text(' Prueba el '), bold('modo enfocado'), text(' (icono 👁 en la barra) para escribir sin distracciones en tipografía serif.')),
    ),
  );
}

function buildEditorNote() {
  return doc(
    h(1, text('✍️ El editor de notas')),
    p(text('Dome usa un editor de bloques moderno basado en TipTap. Todo está diseñado para ser rápido y potente.')),
    sep(),
    h(2, text('⚡ Slash commands ( / )')),
    p(text('Escribe '), code('/'), text(' en cualquier línea vacía para abrir el menú de bloques. Puedes buscar escribiendo el nombre del bloque.')),
    callout('olive',
      p(bold('Categorías disponibles:')),
      ul(
        [p(bold('Texto'), text(' — Párrafo, H1, H2, H3, Cita'))],
        [p(bold('Listas'), text(' — Viñetas, Numerada, To-do (checkboxes)'))],
        [p(bold('Bloques Dome'), text(' — Callout, Toggle, Código, Divisor, Columnas, Tabla'))],
        [p(bold('AI'), text(' — Pedir a Many, Continuar escribiendo, Resumen'))],
        [p(bold('Embebidos'), text(' — Imagen, Mención @, YouTube/iframe'))],
      ),
    ),
    sep(),
    h(2, text('📦 Bloques especiales')),
    toggle('Callout — notas destacadas',
      p(text('Los callouts resaltan información importante. Hay 5 variantes: '), bold('info'), text(', '), bold('warning'), text(', '), bold('error'), text(', '), bold('success'), text(', '), bold('olive'), text(' (acento Dome).')),
      callout('info', p(text('ℹ️ Esto es un callout de tipo '), bold('info'), text('.'))),
      callout('warning', p(text('⚠️ Esto es un callout de tipo '), bold('warning'), text('.'))),
      callout('olive', p(text('✦ Esto es un callout de tipo '), bold('olive'), text(' — ideal para tips de IA.'))),
    ),
    toggle('Toggle — bloques colapsables',
      p(text('Los toggles permiten ocultar contenido hasta que el lector lo expanda. Haz clic en el triángulo para colapsar/expandir.')),
      toggle('Ejemplo de toggle anidado',
        p(text('Los toggles pueden anidarse dentro de otros toggles para jerarquías complejas.')),
      ),
    ),
    toggle('Bloques de código',
      codeblock('javascript', `// Ejemplo de código con syntax highlighting
function greet(name) {
  return \`Hola, \${name}! Bienvenido a Dome.\`;
}

console.log(greet('Mundo'));`),
      p(text('Los bloques de código soportan syntax highlighting para '), bold('JavaScript'), text(', Python, TypeScript, Bash, SQL, y más.')),
    ),
    toggle('Bloques AI (Many)',
      p(text('Los bloques AI permiten hacer preguntas a Many '), bold('directamente dentro del documento'), text('. El resultado se inserta como contenido del editor.')),
      p(text('Inserta uno con '), code('/'), text(' → '), bold('Pedir a Many'), text(' o con '), code('⌘J'), text('.')),
    ),
    sep(),
    h(2, text('✨ Formatos de texto')),
    p(
      text('Selecciona texto para ver el '),
      bold('menú de burbuja'),
      text('. Tienes: '),
      bold('Negrita'),
      text(', '),
      italic('Cursiva'),
      text(', '),
      text('Subrayado', [{ type: 'underline' }]),
      text(', '),
      text('Tachado', [{ type: 'strike' }]),
      text(', '),
      code('Código inline'),
      text(' y Enlace ('),
      code('⌘K'),
      text(').'),
    ),
    sep(),
    h(2, text('🗂️ Tablas y columnas')),
    p(text('Crea tablas con '), code('/tabla'), text(' y columnas con '), code('/columnas'), text('. Soportan drag & drop de filas/columnas y redimensionado.')),
    sep(),
    h(2, text('💾 Guardado automático')),
    callout('info',
      p(text('Dome guarda automáticamente '), bold('1.5 segundos'), text(' después del último cambio y al perder el foco. También puedes usar '), code('⌘S'), text(' para guardar manualmente.')),
      p(text('El indicador de estado en la barra superior muestra: '), bold('Guardado'), text(' · '), bold('Sin guardar'), text(' · '), bold('Guardando…'), text(' · '), bold('Error')),
    ),
  );
}

function buildManyNote() {
  return doc(
    h(1, text('🤖 Asistente Many (IA)')),
    p(text('Many es el asistente de IA integrado en Dome. Está presente en todas partes: panel lateral, editor, barra de burbuja y búsqueda.')),
    sep(),
    h(2, text('📍 Dónde está Many')),
    ul(
      [p(bold('Botón ✦ Many'), text(' en la barra de acción de cualquier nota — abre el panel lateral de chat'))],
      [p(bold('Menú de burbuja'), text(' — selecciona texto y usa la píldora '), bold('Many ▾'), text(' para acciones IA sobre la selección'))],
      [p(bold('Bloque IA'), text(' — '), code('/pedir a many'), text(' para insertar un prompt directamente en el documento'))],
      [p(bold('Búsqueda'), text(' — Many puede responder preguntas sobre tus recursos'))],
    ),
    sep(),
    h(2, text('💬 Cómo chatear con Many')),
    ol(
      [p(text('Abre el panel Many con el botón '), bold('✦ Many'), text(' o ', ), code('⌘J'))],
      [p(text('Escribe tu pregunta o instrucción en el campo de texto'))],
      [p(text('Many tiene acceso automático al '), bold('contexto de la nota abierta'), text(' y a tus fuentes'))],
      [p(text('Puedes adjuntar archivos, mencionar recursos con '), code('@'), text(', o pegar imágenes'))],
    ),
    sep(),
    h(2, text('🎯 Acciones IA sobre selección')),
    p(text('Selecciona cualquier texto en el editor y usa la píldora '), bold('Many ▾'), text(' para:')),
    ul(
      [p(bold('Mejorar redacción'), text(' — mejora claridad y fluidez'))],
      [p(bold('Hacer más corto'), text(' — condensa el texto manteniendo el significado'))],
      [p(bold('Expandir'), text(' — añade más detalle y profundidad'))],
      [p(bold('Resumir'), text(' — genera un resumen ejecutivo'))],
      [p(bold('Continuar'), text(' — Many continúa el texto desde donde lo dejaste'))],
      [p(bold('Traducir'), text(' — traduce a cualquier idioma'))],
      [p(bold('Convertir en tareas'), text(' — extrae acciones accionables en lista to-do'))],
      [p(bold('Explicar'), text(' — explica el contenido de forma accesible'))],
    ),
    sep(),
    h(2, text('📎 Contexto y fuentes')),
    callout('olive',
      p(text('Many puede leer tus PDFs, notas y recursos automáticamente. Abre el panel '), bold('Fuentes'), text(' (botón 📋 en la barra) para controlar qué documentos tiene disponibles.')),
    ),
    sep(),
    h(2, text('🔧 Configuración')),
    p(text('Ve a '), bold('Ajustes → IA'), text(' para:')),
    ul(
      [p(text('Elegir proveedor: '), bold('OpenAI, Anthropic, Google, Ollama (local)'))],
      [p(text('Configurar el modelo principal y el modelo de embeddings'))],
      [p(text('Ajustar el presupuesto de tokens'))],
    ),
    callout('info',
      p(text('💡 Para privacidad total, usa '), bold('Ollama'), text(' para ejecutar modelos locales sin enviar datos a servidores externos.')),
    ),
  );
}

function buildBacklinksNote() {
  return doc(
    h(1, text('🔗 Backlinks y menciones')),
    p(text('Dome conecta tus ideas automáticamente. Cada vez que mencionas una nota, se crea un '), bold('backlink'), text(' bidireccional.')),
    sep(),
    h(2, text('@ Menciones')),
    p(text('Escribe '), code('@'), text(' en el editor seguido del nombre del recurso para crear una mención:')),
    codeblock('', '@ + nombre de nota/PDF/recurso → selecciona del menú emergente'),
    p(text('Las menciones se muestran como chips interactivos: haz '), bold('clic'), text(' en uno para abrir ese recurso.')),
    sep(),
    callout('olive',
      p(bold('Ejemplo:'), text(' En esta misma nota puedes ver cómo funciona. Las menciones en la nota principal de esta guía son backlinks reales hacia cada apartado.')),
    ),
    sep(),
    h(2, text('🔍 Ver backlinks de una nota')),
    p(text('El panel lateral derecho (botón 📖 en la barra) muestra:')),
    ul(
      [p(bold('Backlinks'), text(' — qué notas mencionan la nota actual'))],
      [p(bold('Menciones salientes'), text(' — qué recursos menciona esta nota'))],
      [p(bold('Resumen IA'), text(' — Many puede generar un resumen de la nota'))],
    ),
    sep(),
    h(2, text('📊 Metadatos de nota')),
    p(text('La barra de metadatos debajo del título muestra:')),
    ul(
      [p(bold('Palabras'), text(' y tiempo de lectura estimado'))],
      [p(bold('Última edición'), text(' relativa (hace X minutos)'))],
      [p(bold('Etiquetas'), text(' — haz clic en '), code('+'), text(' para añadir tags'))],
      [p(bold('Backlinks'), text(' — número de notas que apuntan aquí'))],
      [p(bold('AI ready'), text(' — indica si la nota ha sido indexada para búsqueda semántica'))],
    ),
    sep(),
    h(2, text('🏷️ Etiquetas (tags)')),
    p(text('Añade etiquetas a tus notas para organizarlas temáticamente. Las etiquetas se pueden usar como filtros en el sidebar y en la búsqueda.')),
    tasks(
      [false, text('Prueba: escribe '), code('@'), text(' y busca esta nota desde otra')],
      [false, text('Abre el panel lateral (📖) para ver los backlinks de esta nota')],
      [false, text('Añade una etiqueta usando el '), code('+'), text(' en la barra de metadatos')],
    ),
  );
}

function buildRecursosNote() {
  return doc(
    h(1, text('📁 Gestión de recursos')),
    p(text('Dome no es solo un editor de notas: es un workspace completo para tu conocimiento. Puedes importar y trabajar con múltiples tipos de recursos.')),
    sep(),
    h(2, text('📄 Tipos de recursos')),
    ul(
      [p(bold('📝 Notas'), text(' — documentos de texto con el editor de bloques'))],
      [p(bold('📄 PDFs'), text(' — arrastra o importa PDFs; Many los puede leer y responder preguntas'))],
      [p(bold('🖼️ Imágenes'), text(' — importa y referencia imágenes en tus notas'))],
      [p(bold('🎵 Audio / Video'), text(' — archivos multimedia con transcripción automática'))],
      [p(bold('🌐 URLs'), text(' — guarda páginas web con extracción de contenido'))],
      [p(bold('📊 Excel/CSV'), text(' — hojas de cálculo con análisis IA'))],
      [p(bold('📑 PowerPoint'), text(' — presenta y extrae slides como imágenes'))],
    ),
    sep(),
    h(2, text('🗂️ Organización con carpetas')),
    p(text('Usa el sidebar para organizar recursos en carpetas (proyectos). Arrastra recursos entre carpetas para reorganizarlos.')),
    callout('info',
      p(text('Las carpetas en Dome son '), bold('proyectos'), text('. Cada proyecto tiene sus propias notas, PDFs y recursos, aunque puedes mencionar recursos entre proyectos.')),
    ),
    sep(),
    h(2, text('📥 Importar recursos')),
    ol(
      [p(bold('Drag & drop'), text(' — arrastra archivos directamente al sidebar o al editor'))],
      [p(bold('Botón +'), text(' — usa el botón de nuevo recurso en el sidebar'))],
      [p(bold('Portapapeles'), text(' — '), code('/imagen'), text(' pega una imagen desde el portapapeles'))],
      [p(bold('URL'), text(' — pega una URL en el chat de Many para importar la página'))],
    ),
    sep(),
    h(2, text('🔍 Panel de fuentes')),
    p(text('El panel '), bold('Fuentes'), text(' (botón 📋 en la barra de acción) permite:')),
    ul(
      [p(text('Ver todos los recursos relacionados con la nota actual'))],
      [p(text('Seleccionar qué recursos puede usar Many como contexto'))],
      [p(text('Buscar dentro de los recursos del proyecto'))],
    ),
    sep(),
    h(2, text('🖥️ Visor de recursos')),
    p(text('Abre cualquier recurso (PDF, vídeo, etc.) haciendo clic en él. El visor se abre en un '), bold('panel dividido'), text(' junto a tu nota, o en '), bold('pestaña separada'), text('.')),
    tasks(
      [false, text('Importa un PDF y abre el chat con Many en ese documento')],
      [false, text('Arrastra una imagen al editor para insertarla como bloque')],
      [false, text('Prueba el modo dividido: botón ⊞ en la barra de acción')],
    ),
  );
}

function buildAgentsNote() {
  return doc(
    h(1, text('⚡ Agentes y automatizaciones')),
    p(text('Dome incluye un sistema de agentes IA que pueden realizar tareas complejas de forma autónoma o semi-autónoma.')),
    sep(),
    h(2, text('🤖 ¿Qué es un agente?')),
    p(text('Un agente es un asistente IA especializado con:')),
    ul(
      [p(bold('Instrucciones personalizadas'), text(' — define su personalidad, rol y capacidades'))],
      [p(bold('Herramientas'), text(' — acceso a búsqueda web, gestión de archivos, creación de notas, etc.'))],
      [p(bold('Skills'), text(' — habilidades especializadas que amplían sus capacidades (SKILL.md)'))],
      [p(bold('Memoria'), text(' — puede recordar contexto entre conversaciones'))],
    ),
    sep(),
    h(2, text('🏗️ Crear un agente')),
    ol(
      [p(text('Ve a la sección '), bold('Agentes'), text(' en el sidebar'))],
      [p(text('Haz clic en '), bold('+ Nuevo agente'))],
      [p(text('Define nombre, descripción e instrucciones del sistema'))],
      [p(text('Selecciona las herramientas que tendrá disponibles'))],
      [p(text('¡Empieza a chatear!'))],
    ),
    callout('olive',
      p(text('✦ '), bold('Tip:'), text(' Puedes usar Many directamente sin crear un agente. Los agentes son útiles cuando quieres una IA '), bold('especializada'), text(' para tareas concretas (investigación, código, análisis de datos…).')),
    ),
    sep(),
    h(2, text('🔄 Automatizaciones')),
    p(text('Las automatizaciones ejecutan flujos de trabajo de forma programada o ante eventos:')),
    ul(
      [p(bold('Disparadores'), text(' — tiempo programado, nuevo recurso, cambio en nota…'))],
      [p(bold('Acciones'), text(' — ejecutar un agente, crear nota, enviar resumen, actualizar etiquetas…'))],
      [p(bold('Flujos visuales'), text(' — editor de nodos para flujos complejos multi-paso'))],
    ),
    sep(),
    h(2, text('🎯 Skills (habilidades)')),
    p(text('Las Skills son archivos '), code('SKILL.md'), text(' que añaden capacidades especializadas a todos los agentes. Se guardan en '), code('~/.dome/skills/')),
    codeblock('markdown', `# Mi Skill personalizada

## Descripción
Esta skill hace que los agentes sean expertos en análisis financiero.

## Instrucciones
Cuando el usuario mencione datos financieros, aplica estos pasos:
1. Identifica métricas clave (ROI, EBITDA, margen bruto...)
2. Compara con benchmarks del sector
3. Genera insights accionables`),
    sep(),
    h(2, text('📋 Runs y logs')),
    p(text('Cada ejecución de agente queda registrada en la sección '), bold('Actividad'), text('. Puedes revisar qué herramientas usó, el razonamiento paso a paso y el resultado final.')),
    tasks(
      [false, text('Crea tu primer agente personalizado')],
      [false, text('Prueba una automatización de resumen diario')],
      [false, text('Explora las Skills disponibles en la sección de Marketplace')],
    ),
  );
}

function buildSearchNote() {
  return doc(
    h(1, text('🔍 Búsqueda semántica')),
    p(text('Dome combina búsqueda por palabras clave con búsqueda semántica (IA) para que puedas encontrar cualquier cosa, incluso si no recuerdas las palabras exactas.')),
    sep(),
    h(2, text('🧠 ¿Cómo funciona?')),
    callout('info',
      p(text('Dome usa un sistema de búsqueda '), bold('híbrido'), text(':')),
      ul(
        [p(bold('FTS (Full-Text Search)'), text(' — búsqueda exacta por palabras clave, muy rápida'))],
        [p(bold('Embeddings semánticos'), text(' — entiende el '), italic('significado'), text(', no solo las palabras'))],
        [p(bold('Grafo de conocimiento'), text(' — tiene en cuenta los backlinks y relaciones entre notas'))],
      ),
    ),
    sep(),
    h(2, text('🔎 Cómo buscar')),
    ol(
      [p(text('Abre la búsqueda con '), code('⌘F'), text(' o el icono de lupa en el sidebar'))],
      [p(text('Escribe tu consulta en lenguaje natural: '), italic('"ideas sobre machine learning de la semana pasada"'))],
      [p(text('Usa filtros: tipo de recurso, proyecto, fecha, etiqueta'))],
      [p(text('Los resultados muestran el fragmento relevante dentro del documento'))],
    ),
    sep(),
    h(2, text('⚡ Búsqueda vs. pregunta a Many')),
    toggle('¿Cuándo usar búsqueda?',
      p(text('Usa la búsqueda cuando quieras '), bold('encontrar un documento específico'), text(' o recordar '), bold('dónde guardaste algo'), text('. Es instantánea y muestra los fragmentos relevantes.')),
    ),
    toggle('¿Cuándo preguntar a Many?',
      p(text('Usa Many cuando quieras '), bold('sintetizar información'), text(' de varios documentos, obtener una '), bold('respuesta elaborada'), text(' o analizar el contenido de tus recursos.')),
    ),
    sep(),
    h(2, text('🗄️ Indexación')),
    p(text('Dome indexa automáticamente todos tus recursos en segundo plano. El indicador '), bold('AI ready'), text(' en la barra de metadatos de una nota confirma que está lista para búsqueda semántica.')),
    callout('olive',
      p(text('💡 La indexación semántica puede tardar unos segundos después de crear o editar un recurso. Dome usa embeddings locales '), bold('(Nomic Embed)'), text(' que funcionan sin internet y con privacidad total.')),
    ),
    sep(),
    h(2, text('🏷️ Filtros avanzados')),
    ul(
      [p(code('tipo:pdf'), text(' — filtra solo PDFs'))],
      [p(code('proyecto:investigación'), text(' — limita al proyecto especificado'))],
      [p(code('etiqueta:importante'), text(' — filtra por tag'))],
      [p(code('hace:7d'), text(' — recursos modificados en los últimos 7 días'))],
    ),
    tasks(
      [false, text('Busca algo con lenguaje natural: "mis notas de reuniones del mes pasado"')],
      [false, text('Prueba filtrar por tipo de archivo')],
      [false, text('Verifica el indicador "AI ready" en una nota')],
    ),
  );
}

// ─── Guide body repair (empty JSON from legacy Collaboration hydrate bug) ───

/**
 * @param {unknown} raw
 */
function guideContentLooksEmpty(raw) {
  if (raw == null) return true;
  const s = String(raw).trim();
  if (!s) return true;
  try {
    const j = JSON.parse(s);
    if (!j || j.type !== 'doc' || !Array.isArray(j.content)) return false;
    if (j.content.length === 0) return true;
    if (j.content.length === 1) {
      const b0 = j.content[0];
      if (
        b0 &&
        typeof b0 === 'object' &&
        b0.type === 'paragraph' &&
        (!b0.content || b0.content.length === 0)
      ) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * @returns {(() => string) | null}
 */
function resolveGuideBodyBuilder(noteTitle) {
  switch (noteTitle) {
    case 'Bienvenido a Dome 👋':
      return buildMainNote;
    case '✍️ El editor de notas':
      return buildEditorNote;
    case '🤖 Asistente Many (IA)':
      return buildManyNote;
    case '🔗 Backlinks y menciones':
      return buildBacklinksNote;
    case '📁 Gestión de recursos':
      return buildRecursosNote;
    case '⚡ Agentes y automatizaciones':
      return buildAgentsNote;
    case '🔍 Búsqueda semántica':
      return buildSearchNote;
    default:
      return null;
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @returns {Array<{ id: string, title: string, content: string | null, type: string }>}
 */
function listGuideNotebookRows(db) {
  /** @type {Array<{ id: string, title: string, content: string | null, type: string }>} */
  const notes = [];
  const roots = listGuideRootFolders(db);
  for (const root of roots) {
    /** @type {string} */
    const folderId = root.id;
    const children = db
      .prepare('SELECT id, title, content, type FROM resources WHERE folder_id = ?')
      .all(folderId);
    for (const row of children) {
      if (row.type === 'note') {
        notes.push(row);
      }
      if (row.type === 'folder' && row.title === 'Apartados') {
        const subs = db.prepare(
          "SELECT id, title, content, type FROM resources WHERE folder_id = ? AND type = 'note'",
        ).all(row.id);
        notes.push(...subs);
      }
    }
  }
  return notes;
}

/**
 * Rehydrate guide chapter bodies once on machines that seeded structure but persisted empty TipTap docs.
 *
 * @param {import('better-sqlite3').Database} db
 */
function repairGuideBodiesIfNeeded(db) {
  try {
    const done = db.prepare('SELECT value FROM settings WHERE key = ?').get(GUIDE_REPAIR_FLAG);
    if (done?.value === '1') return;

    const noteRows = listGuideNotebookRows(db);
    if (noteRows.length === 0) return;

    const now = Date.now();
    /** @type {number} */
    let updatedCount = 0;
    db.transaction(() => {
      const upd = db.prepare('UPDATE resources SET content = ?, updated_at = ? WHERE id = ?');
      for (const row of noteRows) {
        if (!guideContentLooksEmpty(row.content)) continue;
        const build = resolveGuideBodyBuilder(row.title);
        if (!build) continue;
        upd.run(build(), now, row.id);
        updatedCount += 1;
      }
      db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
        GUIDE_REPAIR_FLAG,
        '1',
        now,
      );
    })();

    if (updatedCount > 0) {
      console.log(`[Guide] 🔧 Restauradas ${updatedCount} notas de la guía (cuerpo vacío).`);
    }
  } catch (err) {
    console.warn('[Guide] ⚠️ Reparación de guía omitida:', err?.message || err);
  }
}

// ─── Main seeder ─────────────────────────────────────────────────────────────

/**
 * @param {import('better-sqlite3').Database} db
 */
function seedGuide(db) {
  try {
    // Guard: only run full INSERT once — then optionally repair truncated bodies from older builds
    const flagRow = db.prepare('SELECT value FROM settings WHERE key = ?').get(SEED_FLAG);
    if (flagRow?.value === '1') {
      repairGuideBodiesIfNeeded(db);
      return;
    }

    const now = Date.now();

    // Clean up any previous guide attempts (v1 may have left empty notes)
    const deleteOldGuide = db.transaction(() => {
      const oldFolders = listGuideRootFolders(db);
      for (const folder of oldFolders) {
        // Delete resources in sub-folders
        const subFolders = db.prepare(
          'SELECT id FROM resources WHERE folder_id = ? AND type = ?'
        ).all(folder.id, 'folder');
        for (const sub of subFolders) {
          db.prepare('DELETE FROM resources WHERE folder_id = ?').run(sub.id);
        }
        // Delete sub-folders themselves
        db.prepare('DELETE FROM resources WHERE folder_id = ?').run(folder.id);
        // Delete the root guide folder and its direct children
        db.prepare('DELETE FROM resources WHERE id = ? OR folder_id = ?').run(folder.id, folder.id);
      }
    });
    deleteOldGuide();

    // Pre-generate all IDs so we can cross-reference in content
    const ids = {
      guideFolder:     randomUUID(),
      apartadosFolder: randomUUID(),
      main:            randomUUID(),
      editor:          randomUUID(),
      many:            randomUUID(),
      backlinks:       randomUUID(),
      recursos:        randomUUID(),
      agents:          randomUUID(),
      search:          randomUUID(),
    };

    const insertResource = db.prepare(`
      INSERT INTO resources (id, project_id, type, title, content, file_path, folder_id, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction(() => {
      // 1. Guía root folder
      insertResource.run(
        ids.guideFolder, PROJECT_ID, 'folder', '📚 Guía de Dome',
        null, null, null, JSON.stringify({ dome_note_icon: '📚', color: '#7b76d0' }), now - 9000, now - 9000,
      );

      // 2. Apartados sub-folder
      insertResource.run(
        ids.apartadosFolder, PROJECT_ID, 'folder', 'Apartados',
        null, null, ids.guideFolder, JSON.stringify({ color: '#596037' }), now - 8000, now - 8000,
      );

      // 3. Main note (inside guide folder)
      insertResource.run(
        ids.main, PROJECT_ID, 'note', 'Bienvenido a Dome 👋',
        buildMainNote(), null, ids.guideFolder,
        JSON.stringify({ dome_note_icon: '🏠' }), now - 7000, now - 7000,
      );

      // 4. Sub-notes (inside Apartados folder)
      const subNotes = [
        { id: ids.editor,    title: '✍️ El editor de notas',       content: buildEditorNote(),    offset: 6000 },
        { id: ids.many,      title: '🤖 Asistente Many (IA)',       content: buildManyNote(),      offset: 5000 },
        { id: ids.backlinks, title: '🔗 Backlinks y menciones',     content: buildBacklinksNote(), offset: 4000 },
        { id: ids.recursos,  title: '📁 Gestión de recursos',       content: buildRecursosNote(),  offset: 3000 },
        { id: ids.agents,    title: '⚡ Agentes y automatizaciones', content: buildAgentsNote(),    offset: 2000 },
        { id: ids.search,    title: '🔍 Búsqueda semántica',        content: buildSearchNote(),    offset: 1000 },
      ];

      for (const note of subNotes) {
        insertResource.run(
          note.id, PROJECT_ID, 'note', note.title,
          note.content, null, ids.apartadosFolder,
          null, now - note.offset, now - note.offset,
        );
      }
    });

    insertMany();

    // Mark as seeded (+ skip future repair scans — bodies are fresh from builders)
    db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      SEED_FLAG, '1', now,
    );
    db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)').run(
      GUIDE_REPAIR_FLAG, '1', now,
    );

    console.log('[Guide] ✅ Guía de Dome creada correctamente (' + Object.keys(ids).length + ' recursos)');
  } catch (err) {
    console.warn('[Guide] ⚠️ No se pudo crear la guía (non-fatal):', err?.message);
  }
}

module.exports = { seedGuide };
