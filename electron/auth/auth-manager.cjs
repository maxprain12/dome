/* eslint-disable no-console */
/**
 * Auth Manager - Gestiona credenciales de proveedores de IA
 * Soporta API keys, OAuth tokens, y variables de entorno
 * Inspirado en clawdbot/src/agents/model-auth.ts
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app } = require('electron');

// Constantes de encriptación
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// Mapeo de variables de entorno por proveedor
const ENV_MAP = {
  anthropic: ['ANTHROPIC_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  google: ['GEMINI_API_KEY'],
  ollama: [], // Ollama no requiere API key
};

// Tipos de autenticación
const AUTH_TYPES = {
  API_KEY: 'api_key',
  OAUTH: 'oauth',
  TOKEN: 'token',
};

let _encryptionKey = null;
let _credentialsCache = null;

/**
 * Obtiene o genera la clave de encriptación
 * Se almacena en un archivo seguro en el directorio de usuario
 */
function getEncryptionKey() {
  if (_encryptionKey) return _encryptionKey;

  const keyPath = path.join(app.getPath('userData'), '.dome-key');

  if (fs.existsSync(keyPath)) {
    _encryptionKey = fs.readFileSync(keyPath);
  } else {
    _encryptionKey = crypto.randomBytes(KEY_LENGTH);
    fs.writeFileSync(keyPath, _encryptionKey, { mode: 0o600 });
  }

  return _encryptionKey;
}

/**
 * Encripta datos sensibles
 * @param {string} plaintext - Texto a encriptar
 * @returns {string} - Texto encriptado en formato base64
 */
function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Formato: iv:authTag:encrypted
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Desencripta datos
 * @param {string} ciphertext - Texto encriptado
 * @returns {string} - Texto desencriptado
 */
function decrypt(ciphertext) {
  try {
    const key = getEncryptionKey();
    const parts = ciphertext.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }

    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('[Auth] Error decrypting:', error.message);
    return null;
  }
}

/**
 * Obtiene la ruta del archivo de credenciales
 */
function getCredentialsPath() {
  const domePath = path.join(app.getPath('userData'), '.dome');
  if (!fs.existsSync(domePath)) {
    fs.mkdirSync(domePath, { recursive: true, mode: 0o700 });
  }
  return path.join(domePath, 'credentials.json');
}

/**
 * Carga las credenciales desde el archivo
 */
function loadCredentials() {
  if (_credentialsCache) return _credentialsCache;

  const credPath = getCredentialsPath();

  if (!fs.existsSync(credPath)) {
    _credentialsCache = { profiles: {} };
    return _credentialsCache;
  }

  try {
    const raw = fs.readFileSync(credPath, 'utf8');
    _credentialsCache = JSON.parse(raw);
    return _credentialsCache;
  } catch (error) {
    console.error('[Auth] Error loading credentials:', error.message);
    _credentialsCache = { profiles: {} };
    return _credentialsCache;
  }
}

/**
 * Guarda las credenciales en el archivo
 */
function saveCredentials(credentials) {
  const credPath = getCredentialsPath();
  fs.writeFileSync(credPath, JSON.stringify(credentials, null, 2), { mode: 0o600 });
  _credentialsCache = credentials;
}

/**
 * Normaliza el ID del proveedor
 * @param {string} provider - Proveedor de IA
 * @returns {string} - ID normalizado
 */
function normalizeProviderId(provider) {
  const normalized = provider.toLowerCase().trim();

  const aliases = {
    claude: 'anthropic',
    'claude-3': 'anthropic',
    'gpt-4': 'openai',
    'gpt-3.5': 'openai',
    chatgpt: 'openai',
    gemini: 'google',
    'google-ai': 'google',
  };

  return aliases[normalized] || normalized;
}

/**
 * Resuelve la API key desde variables de entorno
 * @param {string} provider - Proveedor de IA
 * @returns {{ apiKey: string, source: string } | null}
 */
function resolveEnvApiKey(provider) {
  const normalized = normalizeProviderId(provider);
  const envVars = ENV_MAP[normalized] || [];

  for (const envVar of envVars) {
    const value = process.env[envVar]?.trim();
    if (value) {
      const isOAuth = envVar.includes('OAUTH');
      return {
        apiKey: value,
        source: `env:${envVar}`,
        mode: isOAuth ? AUTH_TYPES.OAUTH : AUTH_TYPES.API_KEY,
      };
    }
  }

  return null;
}

/**
 * Crea un nuevo perfil de autenticación
 * @param {Object} params
 * @param {string} params.provider - Proveedor de IA
 * @param {string} params.type - Tipo de autenticación
 * @param {string} params.credentials - Credenciales (se encriptarán)
 * @param {boolean} params.isDefault - Si es el perfil por defecto
 * @returns {string} - ID del perfil creado
 */
function createAuthProfile({ provider, type, credentials, isDefault = false }) {
  const creds = loadCredentials();
  const profileId = `${normalizeProviderId(provider)}-${Date.now()}`;

  // Si es default, quitar el flag de otros perfiles del mismo proveedor
  if (isDefault) {
    for (const id of Object.keys(creds.profiles)) {
      if (creds.profiles[id].provider === normalizeProviderId(provider)) {
        creds.profiles[id].isDefault = false;
      }
    }
  }

  creds.profiles[profileId] = {
    id: profileId,
    provider: normalizeProviderId(provider),
    type,
    credentials: encrypt(credentials),
    isDefault,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  saveCredentials(creds);
  console.log(`[Auth] Created profile: ${profileId}`);

  return profileId;
}

/**
 * Actualiza un perfil de autenticación
 * @param {string} profileId - ID del perfil
 * @param {Object} updates - Actualizaciones
 */
function updateAuthProfile(profileId, updates) {
  const creds = loadCredentials();

  if (!creds.profiles[profileId]) {
    throw new Error(`Profile not found: ${profileId}`);
  }

  if (updates.credentials) {
    updates.credentials = encrypt(updates.credentials);
  }

  if (updates.isDefault) {
    // Quitar el flag de otros perfiles del mismo proveedor
    const provider = creds.profiles[profileId].provider;
    for (const id of Object.keys(creds.profiles)) {
      if (creds.profiles[id].provider === provider && id !== profileId) {
        creds.profiles[id].isDefault = false;
      }
    }
  }

  creds.profiles[profileId] = {
    ...creds.profiles[profileId],
    ...updates,
    updatedAt: Date.now(),
  };

  saveCredentials(creds);
  console.log(`[Auth] Updated profile: ${profileId}`);
}

/**
 * Elimina un perfil de autenticación
 * @param {string} profileId - ID del perfil
 */
function deleteAuthProfile(profileId) {
  const creds = loadCredentials();

  if (!creds.profiles[profileId]) {
    throw new Error(`Profile not found: ${profileId}`);
  }

  delete creds.profiles[profileId];
  saveCredentials(creds);
  console.log(`[Auth] Deleted profile: ${profileId}`);
}

/**
 * Lista los perfiles de un proveedor
 * @param {string} provider - Proveedor de IA (opcional)
 * @returns {Array} - Lista de perfiles (sin credenciales desencriptadas)
 */
function listProfiles(provider = null) {
  const creds = loadCredentials();
  const normalized = provider ? normalizeProviderId(provider) : null;

  return Object.values(creds.profiles)
    .filter((profile) => !normalized || profile.provider === normalized)
    .map((profile) => ({
      id: profile.id,
      provider: profile.provider,
      type: profile.type,
      isDefault: profile.isDefault,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    }));
}

/**
 * Resuelve la API key para un proveedor
 * Prioridad:
 * 1. Perfil específico (si se proporciona profileId)
 * 2. Perfil por defecto del proveedor
 * 3. Variables de entorno
 * 
 * @param {Object} params
 * @param {string} params.provider - Proveedor de IA
 * @param {string} params.profileId - ID del perfil (opcional)
 * @returns {{ apiKey: string, source: string, mode: string } | null}
 */
function resolveApiKey({ provider, profileId = null }) {
  const normalized = normalizeProviderId(provider);
  const creds = loadCredentials();

  // 1. Perfil específico
  if (profileId && creds.profiles[profileId]) {
    const profile = creds.profiles[profileId];
    const apiKey = decrypt(profile.credentials);
    if (apiKey) {
      return {
        apiKey,
        source: `profile:${profileId}`,
        mode: profile.type,
        profileId,
      };
    }
  }

  // 2. Perfil por defecto
  const defaultProfile = Object.values(creds.profiles).find(
    (p) => p.provider === normalized && p.isDefault
  );

  if (defaultProfile) {
    const apiKey = decrypt(defaultProfile.credentials);
    if (apiKey) {
      return {
        apiKey,
        source: `profile:${defaultProfile.id}`,
        mode: defaultProfile.type,
        profileId: defaultProfile.id,
      };
    }
  }

  // 3. Cualquier perfil del proveedor
  const anyProfile = Object.values(creds.profiles).find(
    (p) => p.provider === normalized
  );

  if (anyProfile) {
    const apiKey = decrypt(anyProfile.credentials);
    if (apiKey) {
      return {
        apiKey,
        source: `profile:${anyProfile.id}`,
        mode: anyProfile.type,
        profileId: anyProfile.id,
      };
    }
  }

  // 4. Variables de entorno
  const envResult = resolveEnvApiKey(normalized);
  if (envResult) {
    return envResult;
  }

  return null;
}

/**
 * Verifica si hay credenciales disponibles para un proveedor
 * @param {string} provider - Proveedor de IA
 * @returns {boolean}
 */
function hasCredentials(provider) {
  return resolveApiKey({ provider }) !== null;
}

/**
 * Obtiene el modo de autenticación para un proveedor
 * @param {string} provider - Proveedor de IA
 * @returns {'api-key' | 'oauth' | 'token' | 'mixed' | 'unknown'}
 */
function getAuthMode(provider) {
  const normalized = normalizeProviderId(provider);
  const creds = loadCredentials();

  const profiles = Object.values(creds.profiles).filter(
    (p) => p.provider === normalized
  );

  if (profiles.length === 0) {
    const envResult = resolveEnvApiKey(normalized);
    if (envResult) {
      return envResult.mode;
    }
    return 'unknown';
  }

  const modes = new Set(profiles.map((p) => p.type));

  if (modes.size > 1) return 'mixed';
  if (modes.has(AUTH_TYPES.OAUTH)) return 'oauth';
  if (modes.has(AUTH_TYPES.TOKEN)) return 'token';
  return 'api-key';
}

/**
 * Valida una API key haciendo una petición de prueba
 * @param {string} provider - Proveedor de IA
 * @param {string} apiKey - API key a validar
 * @returns {Promise<{ valid: boolean, error?: string }>}
 */
async function validateApiKey(provider, apiKey) {
  const normalized = normalizeProviderId(provider);

  try {
    switch (normalized) {
      case 'anthropic': {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'Hi' }],
          }),
        });

        if (response.ok || response.status === 429) {
          return { valid: true };
        }

        const error = await response.json();
        return {
          valid: false,
          error: error.error?.message || `HTTP ${response.status}`,
        };
      }

      case 'openai': {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        if (response.ok) {
          return { valid: true };
        }

        const error = await response.json();
        return {
          valid: false,
          error: error.error?.message || `HTTP ${response.status}`,
        };
      }

      case 'google': {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );

        if (response.ok) {
          return { valid: true };
        }

        const error = await response.json();
        return {
          valid: false,
          error: error.error?.message || `HTTP ${response.status}`,
        };
      }

      default:
        return { valid: true }; // No validamos proveedores desconocidos
    }
  } catch (error) {
    return {
      valid: false,
      error: error.message,
    };
  }
}

/**
 * Exporta las credenciales (encriptadas) para backup
 * @returns {string} - JSON de credenciales
 */
function exportCredentials() {
  const creds = loadCredentials();
  return JSON.stringify(creds, null, 2);
}

/**
 * Importa credenciales desde un backup
 * @param {string} json - JSON de credenciales
 * @param {boolean} merge - Si es true, combina con existentes
 */
function importCredentials(json, merge = false) {
  const imported = JSON.parse(json);

  if (merge) {
    const existing = loadCredentials();
    const merged = {
      profiles: {
        ...existing.profiles,
        ...imported.profiles,
      },
    };
    saveCredentials(merged);
  } else {
    saveCredentials(imported);
  }

  console.log('[Auth] Credentials imported');
}

/**
 * Limpia la caché de credenciales
 */
function clearCache() {
  _credentialsCache = null;
}

module.exports = {
  // Constantes
  AUTH_TYPES,

  // Funciones principales
  createAuthProfile,
  updateAuthProfile,
  deleteAuthProfile,
  listProfiles,
  resolveApiKey,
  hasCredentials,
  getAuthMode,
  validateApiKey,

  // Utilidades
  normalizeProviderId,
  resolveEnvApiKey,
  exportCredentials,
  importCredentials,
  clearCache,
};
