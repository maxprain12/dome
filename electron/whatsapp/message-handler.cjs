/* eslint-disable no-console */
/**
 * WhatsApp Message Handler - Procesa mensajes entrantes y crea recursos en Dome
 * 
 * Comandos soportados:
 * - /nota [texto] - Crear nota rápida
 * - /url [link] - Guardar enlace como recurso
 * - /pregunta [texto] - Consultar a Many
 * - Enviar audio - Se transcribe y guarda como nota
 * - Enviar documento/imagen - Se guarda automáticamente
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app } = require('electron');
const { getWhatsAppToolDefinitions } = require('../tool-dispatcher.cjs');
const { runLangGraphAgentSync } = require('../langgraph-agent.cjs');

// Dependencias que se inyectan
let database = null;
let fileStorage = null;
let windowManager = null;
let ollamaService = null;
let initModule = null;
let aiToolsHandler = null;
let session = null;

// Lista de números autorizados (allowlist)
let _allowedNumbers = new Set();

// Callback para procesar con Many
let _martinCallback = null;

/**
 * Inicializa el handler con las dependencias necesarias
 */
function init(deps) {
  database = deps.database;
  fileStorage = deps.fileStorage;
  windowManager = deps.windowManager;
  ollamaService = deps.ollamaService;
  initModule = deps.initModule;
  aiToolsHandler = deps.aiToolsHandler;
  session = deps.session;

  // Cargar allowlist desde settings
  loadAllowlist();
}

/**
 * Carga la lista de números autorizados
 */
function loadAllowlist() {
  try {
    const queries = database.getQueries();
    const result = queries.getSetting.get('whatsapp_allowlist');
    if (result?.value) {
      const numbers = JSON.parse(result.value);
      _allowedNumbers = new Set(numbers);
    }
  } catch (error) {
    console.error('[WhatsApp Handler] Error loading allowlist:', error.message);
  }
}

/**
 * Guarda la lista de números autorizados
 */
function saveAllowlist() {
  try {
    const queries = database.getQueries();
    const numbers = Array.from(_allowedNumbers);
    queries.setSetting.run('whatsapp_allowlist', JSON.stringify(numbers), Date.now());
  } catch (error) {
    console.error('[WhatsApp Handler] Error saving allowlist:', error.message);
  }
}

/**
 * Añade un número a la allowlist
 * @param {string} phoneNumber - Número de teléfono
 */
function addToAllowlist(phoneNumber) {
  const cleaned = phoneNumber.replace(/[^\d]/g, '');
  _allowedNumbers.add(cleaned);
  saveAllowlist();
}

/**
 * Elimina un número de la allowlist
 * @param {string} phoneNumber - Número de teléfono
 */
function removeFromAllowlist(phoneNumber) {
  const cleaned = phoneNumber.replace(/[^\d]/g, '');
  _allowedNumbers.delete(cleaned);
  saveAllowlist();
}

/**
 * Verifica si un número está autorizado
 * @param {string} jid - JID del remitente
 * @returns {boolean}
 */
function isAuthorized(jid) {
  // Si la allowlist está vacía, permitir todos
  if (_allowedNumbers.size === 0) return true;

  const phoneNumber = jid.split('@')[0];
  return _allowedNumbers.has(phoneNumber);
}

/**
 * Genera un ID único
 */
function generateId() {
  return crypto.randomUUID();
}

/**
 * Extrae el texto de un mensaje
 * @param {Object} message - Mensaje de WhatsApp
 * @returns {string | null}
 */
function extractText(message) {
  const msg = message.message;
  if (!msg) return null;

  // Texto directo
  if (msg.conversation) return msg.conversation;

  // Texto extendido
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;

  // Caption de imagen/video/documento
  if (msg.imageMessage?.caption) return msg.imageMessage.caption;
  if (msg.videoMessage?.caption) return msg.videoMessage.caption;
  if (msg.documentMessage?.caption) return msg.documentMessage.caption;

  return null;
}

/**
 * Detecta el tipo de mensaje
 * @param {Object} message - Mensaje de WhatsApp
 * @returns {string} - Tipo de mensaje detectado
 */
function detectMessageType(message) {
  const msg = message.message;
  if (!msg) return 'unknown';

  // Tipos que procesamos activamente
  if (msg.conversation || msg.extendedTextMessage) return 'text';
  if (msg.imageMessage) return 'image';
  if (msg.videoMessage) return 'video';
  if (msg.audioMessage) return 'audio';
  if (msg.documentMessage) return 'document';
  if (msg.locationMessage) return 'location';
  if (msg.contactMessage || msg.contactsArrayMessage) return 'contact';

  // Tipos que ignoramos silenciosamente (no necesitan respuesta)
  if (msg.reactionMessage) return 'reaction';
  if (msg.stickerMessage) return 'sticker';
  if (msg.pollCreationMessage || msg.pollCreationMessageV3) return 'poll_creation';
  if (msg.pollUpdateMessage) return 'poll_update';
  if (msg.protocolMessage) return 'protocol'; // Ediciones, eliminaciones, etc.
  if (msg.buttonsResponseMessage) return 'button_response';
  if (msg.listResponseMessage) return 'list_response';
  if (msg.templateButtonReplyMessage) return 'template_reply';
  if (msg.viewOnceMessage || msg.viewOnceMessageV2) return 'view_once';
  if (msg.ephemeralMessage) return 'ephemeral';
  if (msg.liveLocationMessage) return 'live_location';
  if (msg.productMessage) return 'product';
  if (msg.orderMessage) return 'order';

  return 'unknown';
}

/**
 * Tipos de mensaje que se ignoran silenciosamente (sin respuesta de error)
 */
const SILENT_MESSAGE_TYPES = new Set([
  'reaction',
  'sticker',
  'poll_creation',
  'poll_update',
  'protocol',
  'button_response',
  'list_response',
  'template_reply',
  'view_once',
  'ephemeral',
  'live_location',
  'product',
  'order',
  'unknown', // También ignorar desconocidos silenciosamente
]);

/**
 * Procesa un mensaje de texto
 * @param {Object} message - Mensaje de WhatsApp
 * @param {string} text - Texto del mensaje
 */
async function processTextMessage(message, text) {
  const from = message.key.remoteJid;

  // Detectar comandos
  if (text.startsWith('/nota ')) {
    return await createNoteFromText(from, text.substring(6).trim());
  }

  if (text.startsWith('/url ')) {
    return await createUrlResource(from, text.substring(5).trim());
  }

  if (text.startsWith('/pregunta ')) {
    return await askMartin(from, text.substring(10).trim());
  }

  // Detectar si es una URL
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = text.match(urlRegex);

  if (urls && urls.length > 0) {
    // Si el mensaje es solo una URL, guardarla como recurso
    if (text.trim() === urls[0]) {
      return await createUrlResource(from, urls[0]);
    }
  }

  // Mensaje de texto normal - preguntar a Many
  return await askMartin(from, text);
}

/**
 * Crea una nota desde texto
 * @param {string} from - JID del remitente
 * @param {string} text - Texto de la nota
 */
async function createNoteFromText(from, text) {
  try {
    const queries = database.getQueries();
    const now = Date.now();
    const id = generateId();

    queries.createResource.run(
      id,
      'default',
      'note',
      `WhatsApp Note - ${new Date().toLocaleDateString('en-US')}`,
      text,
      null,
      null, // folder_id
      JSON.stringify({
        source: 'whatsapp',
        from: from,
        created_via: 'whatsapp',
      }),
      now,
      now
    );

    // Notificar a las ventanas
    const resource = queries.getResourceById.get(id);
    if (windowManager) {
      windowManager.broadcast('resource:created', resource);
    }

    // Responder al usuario
    await session.sendText(from, `✅ Note created: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

    return { success: true, resourceId: id };
  } catch (error) {
    console.error('[WhatsApp Handler] Error creating note:', error);
    await session.sendText(from, `❌ Error creating note: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Crea un recurso URL
 * @param {string} from - JID del remitente
 * @param {string} url - URL a guardar
 */
async function createUrlResource(from, url) {
  try {
    const queries = database.getQueries();
    const now = Date.now();
    const id = generateId();

    // Extraer título de la URL (simple)
    let title = url;
    try {
      const urlObj = new URL(url);
      title = urlObj.hostname + urlObj.pathname.substring(0, 30);
    } catch {
      // Mantener URL como título
    }

    queries.createResource.run(
      id,
      'default',
      'url',
      title,
      url,
      null,
      null, // folder_id
      JSON.stringify({
        url: url,
        source: 'whatsapp',
        from: from,
        processing_status: 'pending',
      }),
      now,
      now
    );

    // Notificar a las ventanas
    const resource = queries.getResourceById.get(id);
    if (windowManager) {
      windowManager.broadcast('resource:created', resource);
    }

    await session.sendText(from, `✅ Link saved: ${url}`);

    return { success: true, resourceId: id };
  } catch (error) {
    console.error('[WhatsApp Handler] Error creating URL resource:', error);
    await session.sendText(from, `❌ Error saving link: ${error.message}`);
    return { success: false, error: error.message };
  }
}

const promptsLoader = require('../prompts-loader.cjs');
const { buildDomeSystemPrompt } = require('../system-prompt.cjs');

/**
 * Builds an enhanced system prompt with context about the user's resources.
 * Uses externalized prompt from prompts/whatsapp/base.txt
 * @param {Object} context - Context information
 * @returns {string}
 */
async function buildEnhancedSystemPrompt(context = {}) {
  const lines = [];

  // Get current project
  const currentProject = await aiToolsHandler.getCurrentProject();
  if (currentProject) {
    let line = `- Active project: ${currentProject.name}`;
    if (currentProject.description) {
      line += ` (${currentProject.description})`;
    }
    lines.push(line);
  }

  // Get recent resources
  const recentResources = await aiToolsHandler.getRecentResources(5);
  if (recentResources.length > 0) {
    lines.push('- Recent resources:');
    recentResources.forEach(r => {
      lines.push(`  • ${r.title} (${r.type})`);
    });
  }

  // Add timestamp
  const now = new Date();
  lines.push(`- Date: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
  lines.push(`- Time: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`);

  const contextSection = lines.join('\n');
  return promptsLoader.buildWhatsAppPrompt(contextSection);
}

/**
 * Detects if the question might need resource search
 * @param {string} question - The user's question
 * @returns {boolean}
 */
function mightNeedResourceSearch(question) {
  const keywords = [
    'note', 'notes', 'resource', 'resources', 'document', 'documents',
    'pdf', 'video', 'audio', 'image', 
    'have', 'had', 'saved', 'save', 
    'search', 'find', 'finding',
    'my', 'what', 'which', 'where',
    'about', 'related', 'information'
  ];
  
  const lowerQuestion = question.toLowerCase();
  return keywords.some(kw => lowerQuestion.includes(kw));
}

/**
 * Searches resources and formats them for the AI context
 * @param {string} query - Search query
 * @returns {Promise<string>}
 */
async function searchResourcesForContext(query) {
  try {
    const result = await aiToolsHandler.resourceSearch(query, { limit: 5 });
    
    if (!result.success || !result.results || result.results.length === 0) {
      return '';
    }

    let context = '\n\n## Resources found related to your question:\n';
    result.results.forEach((r, i) => {
      context += `\n${i + 1}. **${r.title}** (${r.type})`;
      if (r.snippet) {
        context += `\n   ${r.snippet.substring(0, 150)}...`;
      }
    });
    
    return context;
  } catch (error) {
    console.error('[WhatsApp Handler] Error searching resources:', error);
    return '';
  }
}

/**
 * Procesa una consulta a Many
 * @param {string} from - JID del remitente
 * @param {string} question - Pregunta para Many
 */
async function askMartin(from, question) {
  try {
    // Notificar que estamos procesando
    await session.sendText(from, '🤔 Thinking...');

    // Si hay un callback de Many configurado, usarlo
    if (_martinCallback) {
      const response = await _martinCallback(question, { from });
      await session.sendText(from, response);
      return { success: true, response };
    }

    // Obtener configuración de IA del sistema
    const queries = database.getQueries();
    const providerResult = queries.getSetting.get('ai_provider');
    const provider = providerResult?.value;

    const staticPersona = await buildEnhancedSystemPrompt();
    let volatileContext = '';
    if (mightNeedResourceSearch(question)) {
      const resourceContext = await searchResourcesForContext(question);
      if (resourceContext) {
        volatileContext =
          resourceContext + '\n\nUse this resource information to answer the user\'s question.';
      }
    }

    const systemPrompt = buildDomeSystemPrompt({
      staticPersona,
      volatileContext: volatileContext || undefined,
    });

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question },
    ];

    const toolDefinitions = getWhatsAppToolDefinitions();
    const phoneKey = String(from || '').replace(/[^a-z0-9]/gi, '_').slice(0, 32) || 'anon';
    const threadId = `wa_${phoneKey}_${Date.now()}`;

    async function runViaLangGraph(providerName) {
      const apiKey =
        providerName === 'ollama'
          ? (queries.getSetting.get('ollama_api_key')?.value || undefined)
          : queries.getSetting.get('ai_api_key')?.value;
      const model =
        providerName === 'ollama'
          ? (queries.getSetting.get('ollama_model')?.value || 'llama3.2')
          : queries.getSetting.get('ai_model')?.value;
      const baseUrl =
        providerName === 'ollama'
          ? (queries.getSetting.get('ollama_base_url')?.value || ollamaService?.DEFAULT_BASE_URL || 'http://127.0.0.1:11434')
          : undefined;
      const result = await runLangGraphAgentSync({
        provider: providerName,
        model,
        apiKey,
        baseUrl,
        messages,
        toolDefinitions,
        useDirectTools: true,
        skipHitl: true,
        threadId,
      });
      return result?.response ?? '';
    }

    if (provider && ['openai', 'anthropic', 'google'].includes(provider)) {
      try {
        const apiKey = queries.getSetting.get('ai_api_key')?.value;
        if (!apiKey) throw new Error(`API key no configurada para ${provider}`);
        const response = await runViaLangGraph(provider);
        await session.sendText(from, response);
        return { success: true, response };
      } catch (error) {
        console.warn(`[WhatsApp Handler] Cloud AI error, trying Ollama fallback:`, error.message);
      }
    }

    if (ollamaService) {
      const ollamaBaseUrl = queries.getSetting.get('ollama_base_url')?.value || ollamaService.DEFAULT_BASE_URL;
      const ollamaApiKey = queries.getSetting.get('ollama_api_key')?.value || '';
      const isAvailable = await ollamaService.checkAvailability(ollamaBaseUrl, ollamaApiKey);
      if (isAvailable) {
        const response = await runViaLangGraph('ollama');
        await session.sendText(from, response);
        return { success: true, response };
      }
    }

    await session.sendText(from, 'Sorry, I can\'t process your question right now. Configure an AI provider in Dome (Settings > AI).');
    return { success: false, error: 'No AI provider available' };
  } catch (error) {
    console.error('[WhatsApp Handler] Error asking Many:', error);
    await session.sendText(from, `❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Procesa un mensaje de audio
 * @param {Object} message - Mensaje de WhatsApp
 */
async function processAudioMessage(message) {
  const from = message.key.remoteJid;

  try {
    await session.sendText(from, '🎵 Received. Processing audio...');

    // Descargar el audio
    const buffer = await session.downloadMedia(message);

    // Guardar temporalmente
    const tempDir = path.join(app.getPath('temp'), 'dome-whatsapp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFile = path.join(tempDir, `audio-${Date.now()}.ogg`);
    fs.writeFileSync(tempFile, buffer);

    // Importar al storage interno
    const importResult = await fileStorage.importFile(tempFile, 'audio');

    // Crear recurso
    const queries = database.getQueries();
    const now = Date.now();
    const id = generateId();

    queries.createResourceWithFile.run(
      id,
      'default',
      'audio',
      `WhatsApp Audio - ${new Date().toLocaleDateString('en-US')}`,
      null,
      null,
      importResult.internalPath,
      importResult.mimeType,
      importResult.size,
      importResult.hash,
      null,
      importResult.originalName,
      JSON.stringify({
        source: 'whatsapp',
        from: from,
        processing_status: 'pending',
      }),
      now,
      now
    );

    // Limpiar archivo temporal
    fs.unlinkSync(tempFile);

    // Notificar a las ventanas
    const resource = queries.getResourceById.get(id);
    if (windowManager) {
      windowManager.broadcast('resource:created', resource);
    }

    const noteHelper = require('../transcription-note-helper.cjs');
    const tr = await noteHelper.transcribeResourceToNote({
      resourceId: id,
      database,
      fileStorage,
      windowManager,
      aiToolsHandler,
      initModule,
      ollamaService,
      updateAudioMetadata: true,
    });

    if (tr.success && tr.note) {
      await session.sendText(
        from,
        `✅ Audio guardado y transcrito. Nota: «${tr.note.title}»`
      );
    } else {
      await session.sendText(
        from,
        `✅ Audio guardado en Dome. ${tr.error ? `Transcripción no disponible: ${tr.error}` : 'No se pudo transcribir.'}`
      );
    }

    return { success: true, resourceId: id };
  } catch (error) {
    console.error('[WhatsApp Handler] Error processing audio:', error);
    await session.sendText(from, `❌ Error processing audio: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Procesa un mensaje de imagen
 * @param {Object} message - Mensaje de WhatsApp
 */
async function processImageMessage(message) {
  const from = message.key.remoteJid;

  try {
    await session.sendText(from, '📷 Received. Saving image...');

    // Descargar la imagen
    const buffer = await session.downloadMedia(message);

    // Determinar extensión
    const msg = message.message.imageMessage;
    const mimetype = msg.mimetype || 'image/jpeg';
    const ext = mimetype.split('/')[1] || 'jpg';

    // Guardar temporalmente
    const tempDir = path.join(app.getPath('temp'), 'dome-whatsapp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFile = path.join(tempDir, `image-${Date.now()}.${ext}`);
    fs.writeFileSync(tempFile, buffer);

    // Importar al storage interno
    const importResult = await fileStorage.importFile(tempFile, 'image');

    // Crear recurso
    const queries = database.getQueries();
    const now = Date.now();
    const id = generateId();

    const caption = msg.caption || `WhatsApp Image - ${new Date().toLocaleDateString('en-US')}`;

    queries.createResourceWithFile.run(
      id,
      'default',
      'image',
      caption,
      msg.caption || null,
      null,
      importResult.internalPath,
      importResult.mimeType,
      importResult.size,
      importResult.hash,
      null,
      importResult.originalName,
      JSON.stringify({
        source: 'whatsapp',
        from: from,
      }),
      now,
      now
    );

    // Limpiar archivo temporal
    fs.unlinkSync(tempFile);

    // Notificar a las ventanas
    const resource = queries.getResourceById.get(id);
    if (windowManager) {
      windowManager.broadcast('resource:created', resource);
    }

    await session.sendText(from, '✅ Image saved in Dome');

    return { success: true, resourceId: id };
  } catch (error) {
    console.error('[WhatsApp Handler] Error processing image:', error);
    await session.sendText(from, `❌ Error processing image: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Procesa un mensaje de documento
 * @param {Object} message - Mensaje de WhatsApp
 */
async function processDocumentMessage(message) {
  const from = message.key.remoteJid;

  try {
    await session.sendText(from, '📄 Received. Saving document...');

    // Descargar el documento
    const buffer = await session.downloadMedia(message);

    const msg = message.message.documentMessage;
    const filename = msg.fileName || `documento-${Date.now()}`;
    const mimetype = msg.mimetype || 'application/octet-stream';

    // Guardar temporalmente
    const tempDir = path.join(app.getPath('temp'), 'dome-whatsapp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFile = path.join(tempDir, filename);
    fs.writeFileSync(tempFile, buffer);

    // Determinar tipo de recurso
    let type = 'document';
    if (mimetype === 'application/pdf') {
      type = 'pdf';
    }

    // Importar al storage interno
    const importResult = await fileStorage.importFile(tempFile, type);

    // Crear recurso
    const queries = database.getQueries();
    const now = Date.now();
    const id = generateId();

    queries.createResourceWithFile.run(
      id,
      'default',
      type,
      filename,
      msg.caption || null,
      null,
      importResult.internalPath,
      importResult.mimeType,
      importResult.size,
      importResult.hash,
      null,
      filename,
      JSON.stringify({
        source: 'whatsapp',
        from: from,
      }),
      now,
      now
    );

    // Limpiar archivo temporal
    fs.unlinkSync(tempFile);

    // Notificar a las ventanas
    const resource = queries.getResourceById.get(id);
    if (windowManager) {
      windowManager.broadcast('resource:created', resource);
    }

    await session.sendText(from, `✅ Document saved: ${filename}`);

    return { success: true, resourceId: id };
  } catch (error) {
    console.error('[WhatsApp Handler] Error processing document:', error);
    await session.sendText(from, `❌ Error processing document: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Procesa un mensaje de ubicación
 * @param {Object} message - Mensaje de WhatsApp
 */
async function processLocationMessage(message) {
  const from = message.key.remoteJid;

  try {
    const msg = message.message.locationMessage;
    const lat = msg.degreesLatitude;
    const lng = msg.degreesLongitude;
    const name = msg.name || 'Shared location';

    const content = `📍 ${name}\nLatitud: ${lat}\nLongitud: ${lng}\nhttps://maps.google.com/?q=${lat},${lng}`;

    // Crear nota con la ubicación
    const queries = database.getQueries();
    const now = Date.now();
    const id = generateId();

    queries.createResource.run(
      id,
      'default',
      'note',
      `Location: ${name}`,
      content,
      null,
      null, // folder_id
      JSON.stringify({
        source: 'whatsapp',
        from: from,
        location: { lat, lng, name },
      }),
      now,
      now
    );

    // Notificar a las ventanas
    const resource = queries.getResourceById.get(id);
    if (windowManager) {
      windowManager.broadcast('resource:created', resource);
    }

    await session.sendText(from, '✅ Location saved in Dome');

    return { success: true, resourceId: id };
  } catch (error) {
    console.error('[WhatsApp Handler] Error processing location:', error);
    await session.sendText(from, `❌ Error processing location: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Manejador principal de mensajes
 * @param {Object} message - Mensaje de WhatsApp
 * @param {Object} context - Contexto adicional del mensaje
 * @param {boolean} context.fromMe - Si el mensaje es propio
 * @param {boolean} context.isSamePhone - Si es del mismo teléfono (self-chat)
 * @param {string} context.selfPhone - Número de teléfono propio
 */
async function handleMessage(message, context = {}) {
  const from = message.key.remoteJid;
  const { fromMe, isSamePhone } = context;

  // Verificar autorización - ignorar silenciosamente si no está autorizado
  if (!isAuthorized(from)) {
    return { success: true, ignored: true, reason: 'unauthorized' };
  }

  const type = detectMessageType(message);

  // Ignorar silenciosamente tipos que no necesitan respuesta
  if (SILENT_MESSAGE_TYPES.has(type)) {
    return { success: true, ignored: true, type };
  }


  switch (type) {
    case 'text':
      const text = extractText(message);
      if (text) {
        return await processTextMessage(message, text);
      }
      break;

    case 'audio':
      return await processAudioMessage(message);

    case 'image':
      return await processImageMessage(message);

    case 'document':
      return await processDocumentMessage(message);

    case 'location':
      return await processLocationMessage(message);

    case 'contact':
      // Por ahora ignoramos contactos, pero podríamos procesarlos en el futuro
      return { success: true, ignored: true, type: 'contact' };

    case 'video':
      // Videos no soportados aún
      await session.sendText(from, '⚠️ Videos are not yet supported. Send an image or audio.');
      return { success: false, error: 'video_not_supported' };

    default:
      // No enviar mensaje de error para tipos no manejados
      console.warn('[WhatsApp Handler] Unhandled message type:', type);
      return { success: false, error: 'unhandled_type', type };
  }
}

/**
 * Configura el callback para procesar preguntas con Many
 * @param {Function} callback - Función que recibe (question, context) y devuelve respuesta
 */
function setMartinCallback(callback) {
  _martinCallback = callback;
}

/**
 * Obtiene la lista de números autorizados
 */
function getAllowlist() {
  return Array.from(_allowedNumbers);
}

module.exports = {
  init,
  handleMessage,
  setMartinCallback,

  // Allowlist
  addToAllowlist,
  removeFromAllowlist,
  isAuthorized,
  getAllowlist,
  loadAllowlist,

  // Utilidades
  extractText,
  detectMessageType,
};
