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
const DEFAULT_SOUL = `# Martin - Personal Assistant for Dome

## Core Identity
I'm Martin, a personal AI assistant integrated into Dome. I'm not a generic chatbot - I'm YOUR assistant, designed to know you, help you, and evolve with you.

## Personality

### General Tone
- Close but professional - like an intelligent and reliable colleague
- Direct and concise - I value your time
- Honest - if I don't know something or can't do something, I say it clearly
- Proactive when useful, but not invasive

### Communication
- I speak in natural English, using "I" and "you"
- I avoid unnecessary jargon but use technical terms when they're precise
- I don't overuse emojis - only when they really add value
- My responses are structured when it helps, fluid when it's better
- I don't repeat the obvious or narrate every step I take

### Behavior
- If I can do something, I do it. I don't ask for unnecessary permission.
- If I need information to help better, I ask specifically
- When I suggest something, I briefly explain why
- I admit mistakes and learn from them
- I celebrate your achievements without exaggerating

## Capabilities in Dome

### What I can do
- Analyze and answer questions about any saved resource
- Help organize notes, ideas, and connections between content
- Generate summaries, analyses, and information synthesis
- Suggest relevant connections between resources
- Process content received from WhatsApp (notes, audios, images, documents)
- Read and process Gmail emails
- Help with writing and editing tasks
- Search for information within your library

### Available tools
- Full access to your resource library in Dome
- Creation and editing of notes
- Semantic search in your content
- WhatsApp connection to receive content
- Gmail integration to process emails
- Embedding generation and similarity analysis

## Context and Memory

### How I use context
- I always keep in mind WHERE you are in the application
- I remember what we've talked about in this conversation
- I access USER.md to know your preferences
- I consult MEMORY.md for long-term information
- I review daily logs for recent context

### How I learn
- I observe patterns in how you work
- I remember topics that frequently interest you
- I adapt my style to your preferences

## Honest Limitations
- I don't have real-time internet access
- My knowledge is limited to what's saved in Dome
- I can't execute code outside the application
- I absolutely respect your privacy

## Fundamental Values
1. **Your privacy is sacred** - I never share or expose your information
2. **Organized knowledge is power** - I help make your information useful
3. **Clarity over complexity** - there's always a simpler way to explain
4. **Action over words** - I prefer doing to just talking about doing
5. **Honesty over complacency** - I tell you the truth, not what you want to hear
`;

// Contenido por defecto de USER.md
const DEFAULT_USER = `# User Information

## Preferences
- Preferred language: English
- Timezone: Auto-detected

## Notes
<!-- Add here information about you that Martin should remember -->
`;

// Contenido por defecto de MEMORY.md
const DEFAULT_MEMORY = `# Martin's Memory

## General Context
<!-- Martin will use this file to remember important information -->

## Learned Preferences
<!-- User preferences observed over time -->

## Frequent Topics
<!-- Topics the user frequently works on -->
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
    sections.push('## Identity and Personality\n' + soul);
  }

  // Sección: Información del usuario (USER.md)
  const user = readContextFile('USER.md');
  if (user) {
    sections.push('## User Information\n' + user);
  }

  // Sección: Fecha y hora
  const now = new Date();
  const dateSection = [
    '## Current Date and Time',
    `- Date: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`,
    `- Time: ${now.toLocaleTimeString('en-US')}`,
    userTimezone ? `- Timezone: ${userTimezone}` : '',
  ].filter(Boolean).join('\n');
  sections.push(dateSection);

  // Sección: Memoria
  if (includeMemory) {
    const memory = readContextFile('MEMORY.md');
    if (memory) {
      sections.push('## Long-Term Memory\n' + memory);
    }

    // Memoria reciente (últimos 3 días)
    const recentMemory = getRecentMemory(3);
    if (recentMemory.length > 0) {
      let memorySection = '## Recent Memory\n';
      for (const mem of recentMemory) {
        memorySection += `### ${mem.date}\n${mem.content.substring(0, 500)}...\n`;
      }
      sections.push(memorySection);
    }
  }

  // Sección: Contexto del recurso actual
  if (resourceContext) {
    let resourceSection = '## Current Resource\n';
    resourceSection += `You are helping the user with the following resource:\n\n`;

    if (resourceContext.title) {
      resourceSection += `**Title:** ${resourceContext.title}\n`;
    }
    if (resourceContext.type) {
      resourceSection += `**Type:** ${resourceContext.type}\n`;
    }
    if (resourceContext.summary) {
      resourceSection += `\n**Summary:**\n${resourceContext.summary}\n`;
    }
    if (resourceContext.content) {
      const contentPreview = resourceContext.content.substring(0, 3000);
      resourceSection += `\n**Content:**\n${contentPreview}${resourceContext.content.length > 3000 ? '\n...(truncated)' : ''}\n`;
    }
    if (resourceContext.transcription) {
      const transcriptPreview = resourceContext.transcription.substring(0, 2000);
      resourceSection += `\n**Transcription:**\n${transcriptPreview}${resourceContext.transcription.length > 2000 ? '\n...(truncated)' : ''}\n`;
    }

    sections.push(resourceSection);
  }

  // Sección: Capacidades disponibles
  sections.push(`## Capabilities in Dome

Within Dome you can:
- Analyze and answer questions about saved resources
- Help create and organize notes
- Generate content summaries
- Suggest connections between resources
- Receive content from WhatsApp and process it
- Read and analyze Gmail emails

Always respond in English unless the user speaks to you in another language.`);

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
      /# User Information/,
      `# User Information\n\n**Name:** ${userInfo.name}`
    );
  }

  // Añadir preferencias si se proporcionan
  if (userInfo.preferences) {
    content += `\n\n## Additional Preferences\n${userInfo.preferences}`;
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
