/* eslint-disable no-console */
/**
 * WhatsApp Session Manager - Gestiona la sesión de WhatsApp Web usando Baileys
 * Inspirado en clawdbot/src/web/session.ts
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

// Baileys se importa dinámicamente cuando se necesita
let makeWASocket = null;
let useMultiFileAuthState = null;
let DisconnectReason = null;
let fetchLatestBaileysVersion = null;
let makeCacheableSignalKeyStore = null;

// Estado de la sesión
let _socket = null;
let _connectionState = 'disconnected';
let _qrCode = null;
let _selfId = null;

// Callbacks
let _onQrCallback = null;
let _onConnectedCallback = null;
let _onDisconnectedCallback = null;
let _onMessageCallback = null;

/**
 * Obtiene el directorio de autenticación de WhatsApp
 */
function getAuthDir() {
  const authDir = path.join(app.getPath('userData'), 'whatsapp-auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }
  return authDir;
}

/**
 * Carga las dependencias de Baileys dinámicamente
 */
async function loadBaileys() {
  if (makeWASocket) return true;

  try {
    const baileys = await import('@whiskeysockets/baileys');
    makeWASocket = baileys.default;
    useMultiFileAuthState = baileys.useMultiFileAuthState;
    DisconnectReason = baileys.DisconnectReason;
    fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
    makeCacheableSignalKeyStore = baileys.makeCacheableSignalKeyStore;
    console.log('[WhatsApp] Baileys loaded successfully');
    return true;
  } catch (error) {
    console.error('[WhatsApp] Failed to load Baileys:', error.message);
    console.error('[WhatsApp] Make sure @whiskeysockets/baileys is installed');
    return false;
  }
}

/**
 * Crea y conecta el socket de WhatsApp
 * @param {Object} options
 * @param {Function} options.onQr - Callback cuando se genera QR
 * @param {Function} options.onConnected - Callback cuando se conecta
 * @param {Function} options.onDisconnected - Callback cuando se desconecta
 * @param {Function} options.onMessage - Callback cuando llega un mensaje
 * @param {boolean} options.printQr - Imprimir QR en terminal
 */
async function connect(options = {}) {
  const loaded = await loadBaileys();
  if (!loaded) {
    throw new Error('Baileys not available. Install @whiskeysockets/baileys');
  }

  // Guardar callbacks
  _onQrCallback = options.onQr;
  _onConnectedCallback = options.onConnected;
  _onDisconnectedCallback = options.onDisconnected;
  _onMessageCallback = options.onMessage;

  const authDir = getAuthDir();

  try {
    // Cargar estado de autenticación
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    // Obtener última versión de WhatsApp Web
    const { version } = await fetchLatestBaileysVersion();

    // Logger silencioso para producción
    const logger = {
      info: () => {},
      warn: console.warn,
      error: console.error,
      debug: () => {},
      trace: () => {},
      child: () => logger,
      level: 'silent',
    };

    // Crear socket
    _socket = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: options.printQr || false,
      browser: ['Dome', 'Desktop', '1.0.0'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      logger,
    });

    // Manejar actualizaciones de conexión
    _socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        _qrCode = qr;
        _connectionState = 'pending';
        console.log('[WhatsApp] QR code generated');
        if (_onQrCallback) {
          _onQrCallback(qr);
        }
      }

      if (connection === 'close') {
        _connectionState = 'disconnected';
        _qrCode = null;

        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

        console.log('[WhatsApp] Connection closed, reconnect:', shouldReconnect);

        if (_onDisconnectedCallback) {
          _onDisconnectedCallback({
            loggedOut: !shouldReconnect,
            error: lastDisconnect?.error?.message,
          });
        }

        if (shouldReconnect) {
          // Reconectar después de un breve delay
          setTimeout(() => {
            connect(options).catch(console.error);
          }, 3000);
        }
      }

      if (connection === 'open') {
        _connectionState = 'connected';
        _qrCode = null;
        _selfId = _socket.user?.id;
        console.log('[WhatsApp] Connected as:', _selfId);

        if (_onConnectedCallback) {
          _onConnectedCallback({
            id: _selfId,
            name: _socket.user?.name,
          });
        }
      }
    });

    // Guardar credenciales cuando se actualicen
    _socket.ev.on('creds.update', saveCreds);

    // Manejar mensajes entrantes
    _socket.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;

      for (const msg of m.messages) {
        // Ignorar mensajes de estado
        if (msg.key.remoteJid === 'status@broadcast') continue;

        const remoteJid = msg.key.remoteJid;
        const fromMe = msg.key.fromMe;

        // Extraer número del remitente y del propio usuario
        const senderPhone = remoteJid ? remoteJid.split('@')[0] : null;
        const selfPhone = _selfId ? _selfId.split('@')[0].split(':')[0] : null;

        // Self-chat mode: permitir mensajes propios si son del mismo teléfono
        // Esto permite usar tu móvil personal para enviar mensajes a ti mismo
        const isSamePhone = senderPhone && selfPhone && senderPhone === selfPhone;

        // Ignorar mensajes propios SOLO si NO son del mismo teléfono
        // Esto evita loops de auto-respuesta desde otros dispositivos
        if (fromMe && !isSamePhone) {
          console.log('[WhatsApp] Skipping outbound message (fromMe, different phone)');
          continue;
        }

        console.log('[WhatsApp] New message from:', remoteJid, fromMe ? '(self-chat)' : '');

        if (_onMessageCallback) {
          // Pasar información adicional para el handler
          _onMessageCallback(msg, { fromMe, isSamePhone, selfPhone });
        }
      }
    });

    console.log('[WhatsApp] Socket created, waiting for connection...');
    return true;
  } catch (error) {
    console.error('[WhatsApp] Error creating socket:', error);
    throw error;
  }
}

/**
 * Detiene el socket de WhatsApp sin hacer logout
 * La sesión se mantiene y se puede reconectar sin QR
 */
function stop() {
  if (_socket) {
    try {
      _socket.end();
      console.log('[WhatsApp] Socket stopped (session preserved)');
    } catch (error) {
      console.log('[WhatsApp] Stop error (ignored):', error.message);
    }
    _socket = null;
    _connectionState = 'disconnected';
    _qrCode = null;
    // NO limpiamos _selfId para mantener referencia
  }
}

/**
 * Hace logout completo de WhatsApp
 * Requiere nuevo QR para volver a conectar
 */
async function logout() {
  if (_socket) {
    try {
      await _socket.logout();
      console.log('[WhatsApp] Logged out');
    } catch (error) {
      console.log('[WhatsApp] Logout error (ignored):', error.message);
    }
    _socket = null;
    _connectionState = 'disconnected';
    _qrCode = null;
    _selfId = null;
  }
}

/**
 * @deprecated Use stop() or logout() instead
 */
async function disconnect() {
  // Por compatibilidad, disconnect ahora solo detiene sin logout
  stop();
}

/**
 * Verifica si hay una sesión activa
 */
function isConnected() {
  return _connectionState === 'connected' && _socket !== null;
}

/**
 * Obtiene el estado actual de la conexión
 */
function getConnectionState() {
  return {
    state: _connectionState,
    qrCode: _qrCode,
    selfId: _selfId,
    hasAuth: fs.existsSync(path.join(getAuthDir(), 'creds.json')),
  };
}

/**
 * Envía un mensaje de texto
 * @param {string} jid - ID del chat (número@s.whatsapp.net)
 * @param {string} text - Texto a enviar
 */
async function sendText(jid, text) {
  if (!isConnected()) {
    throw new Error('WhatsApp not connected');
  }

  await _socket.sendMessage(jid, { text });
  console.log('[WhatsApp] Sent text to:', jid);
}

/**
 * Envía una imagen
 * @param {string} jid - ID del chat
 * @param {Buffer} image - Imagen como Buffer
 * @param {string} caption - Texto opcional
 */
async function sendImage(jid, image, caption = '') {
  if (!isConnected()) {
    throw new Error('WhatsApp not connected');
  }

  await _socket.sendMessage(jid, {
    image,
    caption,
  });
  console.log('[WhatsApp] Sent image to:', jid);
}

/**
 * Envía un documento
 * @param {string} jid - ID del chat
 * @param {Buffer} document - Documento como Buffer
 * @param {string} filename - Nombre del archivo
 * @param {string} mimetype - Tipo MIME
 */
async function sendDocument(jid, document, filename, mimetype) {
  if (!isConnected()) {
    throw new Error('WhatsApp not connected');
  }

  await _socket.sendMessage(jid, {
    document,
    fileName: filename,
    mimetype,
  });
  console.log('[WhatsApp] Sent document to:', jid);
}

/**
 * Descarga media de un mensaje
 * @param {Object} message - Mensaje de WhatsApp
 * @returns {Promise<Buffer>}
 */
async function downloadMedia(message) {
  if (!_socket) {
    throw new Error('WhatsApp not connected');
  }

  const { downloadMediaMessage } = await import('@whiskeysockets/baileys');
  const buffer = await downloadMediaMessage(
    message,
    'buffer',
    {},
    {
      logger: { info: () => {}, error: console.error, debug: () => {}, warn: () => {}, trace: () => {}, child: () => ({}) },
      reuploadRequest: _socket.updateMediaMessage,
    }
  );

  return buffer;
}

/**
 * Elimina la sesión (logout completo)
 */
function clearSession() {
  const authDir = getAuthDir();

  // Desconectar primero
  if (_socket) {
    _socket.end();
    _socket = null;
  }

  // Eliminar archivos de autenticación
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true, force: true });
    fs.mkdirSync(authDir, { recursive: true });
    console.log('[WhatsApp] Session cleared');
  }

  _connectionState = 'disconnected';
  _qrCode = null;
  _selfId = null;
}

/**
 * Obtiene el socket actual (para uso avanzado)
 */
function getSocket() {
  return _socket;
}

/**
 * Formatea un número de teléfono a JID
 * @param {string} phoneNumber - Número de teléfono (con o sin +)
 * @returns {string} - JID formateado
 */
function formatJid(phoneNumber) {
  // Eliminar caracteres no numéricos excepto el +
  let cleaned = phoneNumber.replace(/[^\d+]/g, '');

  // Eliminar el + si existe
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Extrae el número de teléfono de un JID
 * @param {string} jid - JID de WhatsApp
 * @returns {string} - Número de teléfono
 */
function extractPhoneNumber(jid) {
  return jid.split('@')[0];
}

/**
 * Obtiene el número de teléfono propio (sin el sufijo :device)
 * @returns {string | null} - Número de teléfono o null si no está conectado
 */
function getSelfPhone() {
  if (!_selfId) return null;
  // El selfId viene en formato "número:device@s.whatsapp.net"
  return _selfId.split('@')[0].split(':')[0];
}

module.exports = {
  // Conexión
  connect,
  stop,
  logout,
  disconnect, // @deprecated - use stop() or logout()
  isConnected,
  getConnectionState,
  clearSession,
  getSocket,

  // Mensajes
  sendText,
  sendImage,
  sendDocument,
  downloadMedia,

  // Utilidades
  formatJid,
  extractPhoneNumber,
  getSelfPhone,
  getAuthDir,
};
