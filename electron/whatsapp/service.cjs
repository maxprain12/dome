/* eslint-disable no-console */
/**
 * WhatsApp Service - Servicio principal que coordina sesión y manejo de mensajes
 * Este es el punto de entrada para toda la funcionalidad de WhatsApp
 */

const session = require('./session.cjs');
const messageHandler = require('./message-handler.cjs');

// Estado del servicio
let _isRunning = false;
let _windowManager = null;

/**
 * Inicializa el servicio de WhatsApp
 * @param {Object} deps - Dependencias
 * @param {Object} deps.database - Módulo de base de datos
 * @param {Object} deps.fileStorage - Módulo de almacenamiento de archivos
 * @param {Object} deps.windowManager - Gestor de ventanas
 * @param {Object} deps.ollamaService - Servicio de Ollama (opcional)
 */
function init(deps) {
  _windowManager = deps.windowManager;

  // Inicializar el handler de mensajes
  messageHandler.init({
    ...deps,
    session,
  });

  console.log('[WhatsApp Service] Initialized');
}

/**
 * Inicia el servicio de WhatsApp
 * @param {Object} options
 * @param {boolean} options.printQr - Imprimir QR en terminal
 */
async function start(options = {}) {
  if (_isRunning) {
    console.log('[WhatsApp Service] Already running');
    return { success: true, state: session.getConnectionState() };
  }

  try {
    await session.connect({
      printQr: options.printQr || false,

      onQr: (qr) => {
        console.log('[WhatsApp Service] QR Code generated');
        // Notificar a las ventanas
        if (_windowManager) {
          _windowManager.broadcast('whatsapp:qr', { qr });
        }
      },

      onConnected: (user) => {
        console.log('[WhatsApp Service] Connected as:', user.id);
        _isRunning = true;
        // Notificar a las ventanas
        if (_windowManager) {
          _windowManager.broadcast('whatsapp:connected', user);
        }
      },

      onDisconnected: (reason) => {
        console.log('[WhatsApp Service] Disconnected:', reason);
        _isRunning = false;
        // Notificar a las ventanas
        if (_windowManager) {
          _windowManager.broadcast('whatsapp:disconnected', reason);
        }
      },

      onMessage: async (message, context = {}) => {
        try {
          const result = await messageHandler.handleMessage(message, context);
          console.log('[WhatsApp Service] Message handled:', result);
        } catch (error) {
          console.error('[WhatsApp Service] Error handling message:', error);
        }
      },
    });

    return { success: true, state: session.getConnectionState() };
  } catch (error) {
    console.error('[WhatsApp Service] Error starting:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Detiene el servicio de WhatsApp (mantiene la sesión)
 * Se puede reconectar sin necesidad de nuevo QR
 */
async function stop() {
  try {
    session.stop();
    _isRunning = false;
    console.log('[WhatsApp Service] Stopped (session preserved)');
    return { success: true };
  } catch (error) {
    console.error('[WhatsApp Service] Error stopping:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Hace logout completo de WhatsApp
 * Requiere nuevo QR para volver a conectar
 */
async function logout() {
  try {
    await session.logout();
    _isRunning = false;
    console.log('[WhatsApp Service] Logged out');
    return { success: true };
  } catch (error) {
    console.error('[WhatsApp Service] Error logging out:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Reinicia el servicio de WhatsApp
 */
async function restart() {
  await stop();
  return await start();
}

/**
 * Obtiene el estado actual del servicio
 */
function getStatus() {
  const connectionState = session.getConnectionState();
  return {
    isRunning: _isRunning,
    ...connectionState,
  };
}

/**
 * Limpia la sesión y todos los datos de autenticación
 */
function clearSession() {
  session.clearSession();
  _isRunning = false;
  return { success: true };
}

/**
 * Envía un mensaje de texto
 * @param {string} phoneNumber - Número de teléfono
 * @param {string} text - Texto a enviar
 */
async function sendMessage(phoneNumber, text) {
  if (!session.isConnected()) {
    return { success: false, error: 'WhatsApp not connected' };
  }

  try {
    const jid = session.formatJid(phoneNumber);
    await session.sendText(jid, text);
    return { success: true };
  } catch (error) {
    console.error('[WhatsApp Service] Error sending message:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Envía una imagen
 * @param {string} phoneNumber - Número de teléfono
 * @param {Buffer} image - Imagen como Buffer
 * @param {string} caption - Texto opcional
 */
async function sendImage(phoneNumber, image, caption = '') {
  if (!session.isConnected()) {
    return { success: false, error: 'WhatsApp not connected' };
  }

  try {
    const jid = session.formatJid(phoneNumber);
    await session.sendImage(jid, image, caption);
    return { success: true };
  } catch (error) {
    console.error('[WhatsApp Service] Error sending image:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Configura el callback para procesar preguntas con Many
 * @param {Function} callback - Función que recibe (question, context) y devuelve respuesta
 */
function setMartinCallback(callback) {
  messageHandler.setMartinCallback(callback);
}

// Exportar funciones de allowlist del handler
const {
  addToAllowlist,
  removeFromAllowlist,
  getAllowlist,
  isAuthorized,
} = messageHandler;

module.exports = {
  // Ciclo de vida
  init,
  start,
  stop,
  logout,
  restart,
  getStatus,
  clearSession,

  // Mensajes
  sendMessage,
  sendImage,

  // Many
  setMartinCallback,

  // Allowlist
  addToAllowlist,
  removeFromAllowlist,
  getAllowlist,
  isAuthorized,

  // Acceso a módulos internos
  session,
  messageHandler,
};
