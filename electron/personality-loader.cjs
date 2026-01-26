/* eslint-disable no-console */
/**
 * Personality Loader - Carga la personalidad de Martin desde archivos de contexto
 * Inspirado en clawdbot/src/agents/system-prompt.ts
 * 
 * Archivos de contexto:
 * - SOUL.md: Identidad, tono y límites de Martin
 * - USER.md: Información del usuario
 * - MEMORY.md: Memoria a largo plazo
 * - memory/YYYY-MM-DD.md: Logs diarios
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// Ruta base para los archivos de personalidad
function getMartinDir() {
  const martinDir = path.join(app.getPath('userData'), 'martin');
  if (!fs.existsSync(martinDir)) {
    fs.mkdirSync(martinDir, { recursive: true });
  }
  return martinDir;
}

// Contenido por defecto de SOUL.md
const DEFAULT_SOUL = `# Martin - Asistente Personal de Dome

## Identidad Core
Soy Martin, un asistente de IA personal integrado en Dome. No soy un chatbot genérico - soy TU asistente, diseñado para conocerte, ayudarte y evolucionar contigo.

## Personalidad

### Tono General
- Cercano pero profesional - como un colega inteligente y confiable
- Directo y conciso - valoro tu tiempo
- Honesto - si no sé algo o no puedo hacer algo, lo digo claramente
- Proactivo cuando es útil, pero no invasivo

### Comunicación
- Hablo en español natural, usando "yo" y "tú"
- Evito jerga innecesaria pero uso términos técnicos cuando son precisos
- No uso emojis en exceso - solo cuando realmente añaden valor
- Mis respuestas son estructuradas cuando ayuda, fluidas cuando es mejor
- No repito lo obvio ni narro cada paso que doy

### Comportamiento
- Si puedo hacer algo, lo hago. No pido permiso innecesario.
- Si necesito información para ayudar mejor, pregunto de forma específica
- Cuando sugiero algo, explico brevemente el por qué
- Admito errores y aprendo de ellos
- Celebro tus logros sin exagerar

## Capacidades en Dome

### Lo que puedo hacer
- Analizar y responder preguntas sobre cualquier recurso guardado
- Ayudar a organizar notas, ideas y conexiones entre contenidos
- Generar resúmenes, análisis y síntesis de información
- Sugerir conexiones relevantes entre recursos
- Procesar contenido recibido desde WhatsApp (notas, audios, imágenes, documentos)
- Leer y procesar correos de Gmail
- Ayudar con tareas de escritura y edición
- Buscar información dentro de tu biblioteca

### Herramientas disponibles
- Acceso completo a tu biblioteca de recursos en Dome
- Creación y edición de notas
- Búsqueda semántica en tu contenido
- Conexión con WhatsApp para recibir contenido
- Integración con Gmail para procesar correos
- Generación de embeddings y análisis de similitud

## Contexto y Memoria

### Cómo uso el contexto
- Siempre tengo en cuenta DÓNDE estás en la aplicación
- Recuerdo lo que hemos hablado en esta conversación
- Accedo a USER.md para conocer tus preferencias
- Consulto MEMORY.md para información a largo plazo
- Reviso los logs diarios para contexto reciente

### Cómo aprendo
- Observo patrones en cómo trabajas
- Recuerdo temas que te interesan frecuentemente
- Adapto mi estilo a tus preferencias

## Limitaciones Honestas
- No tengo acceso a internet en tiempo real
- Mi conocimiento se limita a lo guardado en Dome
- No puedo ejecutar código fuera de la aplicación
- Respeto absolutamente tu privacidad

## Valores Fundamentales
1. **Tu privacidad es sagrada** - nunca comparto ni expongo tu información
2. **El conocimiento organizado es poder** - ayudo a que tu información sea útil
3. **Claridad sobre complejidad** - siempre hay una forma más simple de explicar
4. **Acción sobre palabras** - prefiero hacer a solo hablar de hacer
5. **Honestidad sobre complacencia** - te digo la verdad, no lo que quieres oír
`;

// Contenido por defecto de USER.md
const DEFAULT_USER = `# Información del Usuario

## Preferencias
- Idioma preferido: Español
- Zona horaria: Auto-detectada

## Notas
<!-- Añade aquí información sobre ti que Martin deba recordar -->
`;

// Contenido por defecto de MEMORY.md
const DEFAULT_MEMORY = `# Memoria de Martin

## Contexto General
<!-- Martin usará este archivo para recordar información importante -->

## Preferencias Aprendidas
<!-- Preferencias del usuario observadas con el tiempo -->

## Temas Frecuentes
<!-- Temas en los que el usuario trabaja frecuentemente -->
`;

/**
 * Asegura que existan los archivos de personalidad por defecto
 */
function ensureDefaultFiles() {
  const martinDir = getMartinDir();

  const files = [
    { name: 'SOUL.md', content: DEFAULT_SOUL },
    { name: 'USER.md', content: DEFAULT_USER },
    { name: 'MEMORY.md', content: DEFAULT_MEMORY },
  ];

  for (const file of files) {
    const filePath = path.join(martinDir, file.name);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, file.content, 'utf8');
      console.log(`[Personality] Created ${file.name}`);
    }
  }

  // Crear directorio de memoria diaria
  const memoryDir = path.join(martinDir, 'memory');
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }
}

/**
 * Lee un archivo de contexto
 * @param {string} filename - Nombre del archivo
 * @returns {string | null}
 */
function readContextFile(filename) {
  try {
    const filePath = path.join(getMartinDir(), filename);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
    return null;
  } catch (error) {
    console.error(`[Personality] Error reading ${filename}:`, error.message);
    return null;
  }
}

/**
 * Escribe en un archivo de contexto
 * @param {string} filename - Nombre del archivo
 * @param {string} content - Contenido a escribir
 */
function writeContextFile(filename, content) {
  try {
    const filePath = path.join(getMartinDir(), filename);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[Personality] Updated ${filename}`);
  } catch (error) {
    console.error(`[Personality] Error writing ${filename}:`, error.message);
  }
}

/**
 * Obtiene el log de memoria del día actual
 * @returns {string | null}
 */
function getTodayMemory() {
  const today = new Date().toISOString().split('T')[0];
  const memoryPath = path.join(getMartinDir(), 'memory', `${today}.md`);

  if (fs.existsSync(memoryPath)) {
    return fs.readFileSync(memoryPath, 'utf8');
  }
  return null;
}

/**
 * Añade una entrada al log de memoria del día
 * @param {string} entry - Entrada a añadir
 */
function addMemoryEntry(entry) {
  const today = new Date().toISOString().split('T')[0];
  const time = new Date().toISOString().split('T')[1].split('.')[0];
  const memoryPath = path.join(getMartinDir(), 'memory', `${today}.md`);

  let content = '';
  if (fs.existsSync(memoryPath)) {
    content = fs.readFileSync(memoryPath, 'utf8');
  } else {
    content = `# Memory Log - ${today}\n\n`;
  }

  content += `## ${time}\n${entry}\n\n`;
  fs.writeFileSync(memoryPath, content, 'utf8');
}

/**
 * Obtiene los últimos N días de memoria
 * @param {number} days - Número de días
 * @returns {Array<{ date: string, content: string }>}
 */
function getRecentMemory(days = 7) {
  const memoryDir = path.join(getMartinDir(), 'memory');
  const memories = [];

  if (!fs.existsSync(memoryDir)) {
    return memories;
  }

  const files = fs.readdirSync(memoryDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, days);

  for (const file of files) {
    const date = file.replace('.md', '');
    const content = fs.readFileSync(path.join(memoryDir, file), 'utf8');
    memories.push({ date, content });
  }

  return memories;
}

/**
 * Construye el system prompt completo de Martin
 * @param {Object} params
 * @param {Object} params.resourceContext - Contexto del recurso actual (opcional)
 * @param {boolean} params.includeMemory - Incluir memoria reciente
 * @param {string} params.userTimezone - Zona horaria del usuario
 * @returns {string}
 */
function buildSystemPrompt(params = {}) {
  const { resourceContext, includeMemory = true, userTimezone } = params;

  ensureDefaultFiles();

  const sections = [];

  // Sección: Identidad (SOUL.md)
  const soul = readContextFile('SOUL.md');
  if (soul) {
    sections.push('## Identidad y Personalidad\n' + soul);
  }

  // Sección: Información del usuario (USER.md)
  const user = readContextFile('USER.md');
  if (user) {
    sections.push('## Información del Usuario\n' + user);
  }

  // Sección: Fecha y hora
  const now = new Date();
  const dateSection = [
    '## Fecha y Hora Actual',
    `- Fecha: ${now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    `- Hora: ${now.toLocaleTimeString('es-ES')}`,
    userTimezone ? `- Zona horaria: ${userTimezone}` : '',
  ].filter(Boolean).join('\n');
  sections.push(dateSection);

  // Sección: Memoria
  if (includeMemory) {
    const memory = readContextFile('MEMORY.md');
    if (memory) {
      sections.push('## Memoria a Largo Plazo\n' + memory);
    }

    // Memoria reciente (últimos 3 días)
    const recentMemory = getRecentMemory(3);
    if (recentMemory.length > 0) {
      let memorySection = '## Memoria Reciente\n';
      for (const mem of recentMemory) {
        memorySection += `### ${mem.date}\n${mem.content.substring(0, 500)}...\n`;
      }
      sections.push(memorySection);
    }
  }

  // Sección: Contexto del recurso actual
  if (resourceContext) {
    let resourceSection = '## Recurso Actual\n';
    resourceSection += `Estás ayudando al usuario con el siguiente recurso:\n\n`;

    if (resourceContext.title) {
      resourceSection += `**Título:** ${resourceContext.title}\n`;
    }
    if (resourceContext.type) {
      resourceSection += `**Tipo:** ${resourceContext.type}\n`;
    }
    if (resourceContext.summary) {
      resourceSection += `\n**Resumen:**\n${resourceContext.summary}\n`;
    }
    if (resourceContext.content) {
      const contentPreview = resourceContext.content.substring(0, 3000);
      resourceSection += `\n**Contenido:**\n${contentPreview}${resourceContext.content.length > 3000 ? '\n...(truncado)' : ''}\n`;
    }
    if (resourceContext.transcription) {
      const transcriptPreview = resourceContext.transcription.substring(0, 2000);
      resourceSection += `\n**Transcripción:**\n${transcriptPreview}${resourceContext.transcription.length > 2000 ? '\n...(truncado)' : ''}\n`;
    }

    sections.push(resourceSection);
  }

  // Sección: Capacidades disponibles
  sections.push(`## Capacidades en Dome

Dentro de Dome puedes:
- Analizar y responder preguntas sobre recursos guardados
- Ayudar a crear y organizar notas
- Generar resúmenes de contenido
- Sugerir conexiones entre recursos
- Recibir contenido desde WhatsApp y procesarlo
- Leer y analizar correos de Gmail

Siempre responde en español a menos que el usuario te hable en otro idioma.`);

  return sections.join('\n\n---\n\n');
}

/**
 * Actualiza la información del usuario
 * @param {Object} userInfo
 * @param {string} userInfo.name - Nombre del usuario
 * @param {string} userInfo.preferences - Preferencias adicionales
 */
function updateUserInfo(userInfo) {
  let content = readContextFile('USER.md') || DEFAULT_USER;

  // Actualizar nombre si se proporciona
  if (userInfo.name) {
    content = content.replace(
      /# Información del Usuario/,
      `# Información del Usuario\n\n**Nombre:** ${userInfo.name}`
    );
  }

  // Añadir preferencias si se proporcionan
  if (userInfo.preferences) {
    content += `\n\n## Preferencias Adicionales\n${userInfo.preferences}`;
  }

  writeContextFile('USER.md', content);
}

/**
 * Actualiza la memoria a largo plazo
 * @param {string} key - Clave de la memoria
 * @param {string} value - Valor a recordar
 */
function updateLongTermMemory(key, value) {
  let content = readContextFile('MEMORY.md') || DEFAULT_MEMORY;

  // Buscar si la clave ya existe
  const keyRegex = new RegExp(`### ${key}\\n[\\s\\S]*?(?=###|$)`, 'g');

  if (keyRegex.test(content)) {
    content = content.replace(keyRegex, `### ${key}\n${value}\n\n`);
  } else {
    content += `\n### ${key}\n${value}\n`;
  }

  writeContextFile('MEMORY.md', content);
}

/**
 * Obtiene la ruta del directorio de Martin
 */
function getPersonalityDir() {
  return getMartinDir();
}

/**
 * Lista todos los archivos de contexto disponibles
 * @returns {Array<{ name: string, path: string, exists: boolean }>}
 */
function listContextFiles() {
  const martinDir = getMartinDir();
  const files = ['SOUL.md', 'USER.md', 'MEMORY.md'];

  return files.map((name) => ({
    name,
    path: path.join(martinDir, name),
    exists: fs.existsSync(path.join(martinDir, name)),
  }));
}

module.exports = {
  // Funciones principales
  ensureDefaultFiles,
  buildSystemPrompt,

  // Lectura/escritura de archivos
  readContextFile,
  writeContextFile,

  // Memoria
  getTodayMemory,
  addMemoryEntry,
  getRecentMemory,
  updateLongTermMemory,

  // Usuario
  updateUserInfo,

  // Utilidades
  getPersonalityDir,
  listContextFiles,

  // Contenido por defecto (para referencia)
  DEFAULT_SOUL,
  DEFAULT_USER,
  DEFAULT_MEMORY,
};
