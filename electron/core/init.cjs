/* eslint-disable no-console */
/**
 * Initialization Module - Main Process
 * Handles initialization logic for SQLite, filesystem, and settings.
 * Semantic search uses local Nomic embeddings and hybrid search in the main process (see `electron/services/`, `semantic-index-scheduler.cjs`).
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const database = require('./database.cjs');

let isInitialized = false;
let isInitializing = false;
let initializationPromise = null;

/**
 * Initialize database (DuckDB). Async — awaits `database.initDatabase()`.
 */
async function initSQLite() {
  console.log('📦 Inicializando base de datos DuckDB...');
  await database.initDatabase();
  console.log('✅ Base de datos DuckDB inicializada');
}

/**
 * Initialize default settings
 */
async function initializeDefaultSettings() {
  console.log('⚙️ Inicializando configuración...');
  const timestamp = Date.now();
  const queries = database.getQueries();

  // Check if onboarding_completed exists, if not, initialize it
  const onboardingRow = await queries.getSetting.get('onboarding_completed');
  if (!onboardingRow) {
    await queries.setSetting.run('onboarding_completed', 'false', timestamp);
  }

  // Initialize default preferences if they don't exist
  const themeRow = await queries.getSetting.get('app_theme');
  if (!themeRow) {
    await queries.setSetting.run('app_theme', 'light', timestamp);
  }

  const autoSaveRow = await queries.getSetting.get('app_auto_save');
  if (!autoSaveRow) {
    await queries.setSetting.run('app_auto_save', 'true', timestamp);
  }

  const autoBackupRow = await queries.getSetting.get('app_auto_backup');
  if (!autoBackupRow) {
    await queries.setSetting.run('app_auto_backup', 'true', timestamp);
  }

  const citationStyleRow = await queries.getSetting.get('app_citation_style');
  if (!citationStyleRow) {
    await queries.setSetting.run('app_citation_style', 'apa', timestamp);
  }

  const analyticsRow = await queries.getSetting.get('analytics_enabled');
  if (!analyticsRow) {
    await queries.setSetting.run('analytics_enabled', 'true', timestamp);
  }

  const mcpGlobalRow = await queries.getMcpGlobalSettings?.get?.();
  if (!mcpGlobalRow) {
    await queries.upsertMcpGlobalSettings.run(1, timestamp);
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

/**
 * Check onboarding status
 */
async function checkOnboardingStatus() {
  try {
    const queries = database.getQueries();
    const row = await queries.getSetting.get('onboarding_completed');
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

  // If already initialized, return immediately
  if (isInitialized) {
    return {
      success: true,
      needsOnboarding: await checkOnboardingStatus(),
    };
  }

  // If initialization is in progress, wait for it
  if (isInitializing && initializationPromise) {
    console.log('[Init] ⚠️ Initialization already in progress, waiting...');
    return initializationPromise;
  }

  console.log('[Init] Starting initialization...');

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
    // 1. Initialize DuckDB database (critical - must succeed)
    console.log('[Init] Step 1: DuckDB database...');
    await initSQLite();
    console.log('[Init] Step 1 completed in', Date.now() - startTime, 'ms');

    // 1.1. Check database integrity and repair if needed.
    // DuckDB has no PRAGMA quick_check/integrity_check; `database.checkIntegrity()`
    // runs a trivial catalog probe (`SELECT COUNT(*) FROM projects`). On failure
    // it tries FTS reindex, then backup restore.
    console.log('[Init] Step 1.1: Database integrity check...');
    const integrity = await database.checkIntegrity();
    if (!integrity.ok) {
      console.warn('[DB] ⚠️ Database integrity probe failed:', integrity.errors.join('; '));
      console.log('[DB] Attempting to repair FTS tables...');
      const repaired = await database.repairFTSTables();
      if (repaired) {
        console.log('[DB] ✅ Database repaired successfully');
      } else {
        console.warn('[DB] FTS repair failed, restoring from latest backup...');
        const restored = await database.restoreFromLatestBackupAndReinit();
        if (restored.restored) {
          console.log('[DB] ✅ Database restored from backup:', restored.backupPath);
        } else {
          console.error('[DB] ❌ Failed to repair database and no backup could be restored');
        }
      }
    } else {
      console.log('[DB] ✅ Database integrity check passed');
    }

    // 2. Initialize default settings (critical - must succeed)
    console.log('[Init] Step 2: Default settings...');
    await initializeDefaultSettings();
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
    const needsOnboarding = await checkOnboardingStatus();
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

module.exports = {
  initializeApp,
  checkOnboardingStatus,
  isInitialized: () => isInitialized,
};
