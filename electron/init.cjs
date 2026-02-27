/* eslint-disable no-console */
/**
 * Initialization Module - Main Process
 * Handles initialization logic for SQLite, filesystem, and settings.
 * Vector database (LanceDB) has been replaced by PageIndex (reasoning-based RAG).
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const database = require('./database.cjs');

let isInitialized = false;
let isInitializing = false;
let initializationPromise = null;

/**
 * Initialize SQLite database
 */
function initSQLite() {
  console.log('📦 Inicializando base de datos SQLite...');
  database.initDatabase();
  console.log('✅ Base de datos SQLite inicializada');
}

/**
 * Initialize default settings
 */
function initializeDefaultSettings() {
  console.log('⚙️ Inicializando configuración...');
  const timestamp = Date.now();
  const queries = database.getQueries();

  // Check if onboarding_completed exists, if not, initialize it
  const onboardingRow = queries.getSetting.get('onboarding_completed');
  if (!onboardingRow) {
    queries.setSetting.run('onboarding_completed', 'false', timestamp);
  }

  // Initialize default preferences if they don't exist
  const themeRow = queries.getSetting.get('app_theme');
  if (!themeRow) {
    queries.setSetting.run('app_theme', 'light', timestamp);
  }

  const autoSaveRow = queries.getSetting.get('app_auto_save');
  if (!autoSaveRow) {
    queries.setSetting.run('app_auto_save', 'true', timestamp);
  }

  const autoBackupRow = queries.getSetting.get('app_auto_backup');
  if (!autoBackupRow) {
    queries.setSetting.run('app_auto_backup', 'true', timestamp);
  }

  const citationStyleRow = queries.getSetting.get('app_citation_style');
  if (!citationStyleRow) {
    queries.setSetting.run('app_citation_style', 'apa', timestamp);
  }

  const mcpServersRow = queries.getSetting.get('mcp_servers');
  if (!mcpServersRow) {
    queries.setSetting.run('mcp_servers', '[]', timestamp);
  }

  const mcpEnabledRow = queries.getSetting.get('mcp_enabled');
  if (!mcpEnabledRow) {
    queries.setSetting.run('mcp_enabled', 'true', timestamp);
  }

  const aiSkillsRow = queries.getSetting.get('ai_skills');
  if (!aiSkillsRow) {
    queries.setSetting.run('ai_skills', '[]', timestamp);
  }

  console.log('✅ Configuración inicializada');
}

/**
 * Initialize file system directories
 */
async function initFileSystem() {
  console.log('📁 Inicializando sistema de archivos...');
  const userDataPath = app.getPath('userData');
  const filesDir = path.join(userDataPath, 'dome-files');

  const directories = [
    filesDir,
    path.join(filesDir, 'pdfs'),
    path.join(filesDir, 'images'),
    path.join(filesDir, 'videos'),
    path.join(filesDir, 'audio'),
    path.join(filesDir, 'documents'),
    path.join(filesDir, 'temp'),
  ];

  for (const dir of directories) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  console.log('✅ Sistema de archivos inicializado');
}

/**
 * Create avatars directory
 */
function createAvatarsDirectory() {
  const userDataPath = app.getPath('userData');
  const avatarsPath = path.join(userDataPath, 'avatars');

  if (!fs.existsSync(avatarsPath)) {
    fs.mkdirSync(avatarsPath, { recursive: true });
    console.log('✅ Avatars directory created');
  }
}

// LanceDB / embedding functions removed — PageIndex (reasoning-based RAG) handles document search.
// No-op stubs kept for backward compatibility with any code that calls these.

/** @deprecated No-op. LanceDB removed. */
async function createResourceEmbeddingsTable() { return null; }
/** @deprecated No-op. LanceDB removed. */
async function createSourceEmbeddingsTable() { return null; }
/** @deprecated No-op. LanceDB removed. */
async function createAnnotationEmbeddingsTable() { return null; }

/**
 * Check onboarding status
 */
function checkOnboardingStatus() {
  try {
    const queries = database.getQueries();
    const row = queries.getSetting.get('onboarding_completed');
    const completed = row?.value === 'true';
    return !completed;
  } catch (error) {
    console.warn('Could not check onboarding status:', error);
    return true; // Default to showing onboarding
  }
}

/**
 * Helper to wrap a promise with a timeout
 * @param {Promise} promise - The promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Name of operation for logging
 * @returns {Promise}
 */
function withTimeout(promise, timeoutMs, operationName) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

/**
 * Main initialization function
 * Uses a mutex to prevent concurrent initializations
 */
async function initializeApp() {
  const startTime = Date.now();
  console.log('[Init] Starting initialization...');

  // If already initialized, return immediately
  if (isInitialized) {
    console.log('[Init] ⚠️ App already initialized');
    return {
      success: true,
      needsOnboarding: checkOnboardingStatus(),
    };
  }

  // If initialization is in progress, wait for it
  if (isInitializing && initializationPromise) {
    console.log('[Init] ⚠️ Initialization already in progress, waiting...');
    return initializationPromise;
  }

  // Mark as initializing and create the promise
  isInitializing = true;
  initializationPromise = doInitialize(startTime);
  
  try {
    const result = await initializationPromise;
    return result;
  } finally {
    isInitializing = false;
    initializationPromise = null;
  }
}

/**
 * Internal initialization function
 */
async function doInitialize(startTime) {

  console.log('🚀 Inicializando Dome...');

  try {
    // 1. Initialize SQLite database (critical - must succeed)
    console.log('[Init] Step 1: SQLite database...');
    initSQLite();
    console.log('[Init] Step 1 completed in', Date.now() - startTime, 'ms');

    // 1.1. Check database integrity and repair if needed
    console.log('[Init] Step 1.1: Database integrity check...');
    const integrity = database.checkIntegrity();
    if (!integrity.ok) {
      console.warn('[DB] ⚠️ Database integrity check failed:', integrity.errors);
      console.log('[DB] Attempting to repair FTS tables...');
      const repaired = database.repairFTSTables();
      if (repaired) {
        console.log('[DB] ✅ Database repaired successfully');
      } else {
        console.error('[DB] ❌ Failed to repair database');
      }
    } else {
      console.log('[DB] ✅ Database integrity check passed');
    }

    // 2. Initialize default settings (critical - must succeed)
    console.log('[Init] Step 2: Default settings...');
    initializeDefaultSettings();
    console.log('[Init] Step 2 completed in', Date.now() - startTime, 'ms');

    // 3. Initialize file system (critical - must succeed)
    console.log('[Init] Step 3: File system...');
    await withTimeout(initFileSystem(), 5000, 'File system initialization');
    console.log('[Init] Step 3 completed in', Date.now() - startTime, 'ms');

    // 4. Create avatars directory
    console.log('[Init] Step 4: Avatars directory...');
    createAvatarsDirectory();
    console.log('[Init] Step 4 completed in', Date.now() - startTime, 'ms');

    // 5. Check onboarding status
    console.log('[Init] Step 5: Onboarding status...');
    const needsOnboarding = checkOnboardingStatus();
    console.log('[Init] Step 5 completed in', Date.now() - startTime, 'ms');

    isInitialized = true;
    console.log('[Init] ✅ Dome inicializado correctamente en', Date.now() - startTime, 'ms');

    return {
      success: true,
      needsOnboarding,
    };
  } catch (error) {
    console.error('[Init] ❌ Error al inicializar Dome:', error);
    console.error('[Init] Stack:', error.stack);
    // Return success but with onboarding needed to at least show the UI
    isInitialized = true; // Mark as initialized to prevent retries
    return {
      success: true,
      needsOnboarding: true,
    };
  }
}

/** @deprecated No-op. LanceDB removed. */
function getVectorDB() { return null; }
/** @deprecated No-op. LanceDB removed. */
function getVectorDBPath() { return null; }

module.exports = {
  initializeApp,
  checkOnboardingStatus,
  isInitialized: () => isInitialized,
  // Kept as no-ops for backward compatibility (LanceDB removed)
  getVectorDB,
  getVectorDBPath,
  isVectorDBAvailable: () => false,
  createAnnotationEmbeddingsTable,
  createResourceEmbeddingsTable,
};
