/* eslint-disable no-console */
/**
 * Initialization Module - Main Process
 * Handles all initialization logic for SQLite, LanceDB, filesystem, and settings
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { Schema, Field, Utf8, Int32, Float32, Float64, FixedSizeList, Struct } = require('apache-arrow');
const database = require('./database.cjs');

let vectorDB = null;
let isInitialized = false;
let vectorDBAvailable = false;

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
    queries.setSetting.run('app_theme', 'auto', timestamp);
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
 * Initialize LanceDB vector database
 * Returns true if successful, false if failed (non-blocking)
 * @returns {Promise<boolean>}
 */
async function initVectorDB() {
  try {
    console.log('🔮 Inicializando base de datos vectorial...');
    
    // Try to load vectordb module - this can fail with native module issues
    let vectordb;
    try {
      vectordb = require('vectordb');
    } catch (loadError) {
      console.warn('⚠️ No se pudo cargar el módulo vectordb:', loadError.message);
      console.warn('⚠️ La búsqueda semántica estará deshabilitada');
      console.warn('⚠️ Esto puede ocurrir si los módulos nativos no están compilados para esta versión de Electron');
      vectorDBAvailable = false;
      return false;
    }
    
    const userDataPath = app.getPath('userData');
    const vectorDBPath = path.join(userDataPath, 'dome-vector');

    // Ensure directory exists
    if (!fs.existsSync(vectorDBPath)) {
      fs.mkdirSync(vectorDBPath, { recursive: true });
    }

    vectorDB = await vectordb.connect(vectorDBPath);
    vectorDBAvailable = true;
    console.log('✅ Base de datos vectorial inicializada correctamente');
    return true;
  } catch (error) {
    console.error('❌ Error al inicializar base de datos vectorial:', error.message);
    console.warn('⚠️ La búsqueda semántica estará deshabilitada');
    vectorDBAvailable = false;
    return false;
  }
}

/**
 * Create resource embeddings table
 * Returns null if vectorDB is not available
 */
async function createResourceEmbeddingsTable() {
  if (!vectorDB || !vectorDBAvailable) {
    console.log('⚠️ Saltando creación de resource_embeddings (vectorDB no disponible)');
    return null;
  }

  try {
    const tables = await vectorDB.tableNames();
    if (tables.includes('resource_embeddings')) {
      console.log('✓ Tabla resource_embeddings ya existe');
      return await vectorDB.openTable('resource_embeddings');
    }

    // Create table with sample data
    const sampleData = [{
      id: 'sample',
      resource_id: 'sample',
      chunk_index: 0,
      text: 'Sample text for initialization',
      vector: new Array(1536).fill(0), // OpenAI embeddings dimension
      metadata: {
        resource_type: 'note',
        title: 'Sample',
        project_id: 'sample',
        created_at: Date.now(),
      },
    }];

    const table = await vectorDB.createTable('resource_embeddings', sampleData);

    // Delete sample data
    await table.delete('id = "sample"');

    console.log('✅ Tabla resource_embeddings creada');
    return table;
  } catch (error) {
    console.error('❌ Error al crear tabla de embeddings:', error.message);
    return null;
  }
}

/**
 * Create source embeddings table
 * Returns null if vectorDB is not available
 */
async function createSourceEmbeddingsTable() {
  if (!vectorDB || !vectorDBAvailable) {
    console.log('⚠️ Saltando creación de source_embeddings (vectorDB no disponible)');
    return null;
  }

  try {
    const tables = await vectorDB.tableNames();
    if (tables.includes('source_embeddings')) {
      console.log('✓ Tabla source_embeddings ya existe');
      return await vectorDB.openTable('source_embeddings');
    }

    const sampleData = [{
      id: 'sample',
      source_id: 'sample',
      chunk_index: 0,
      text: 'Sample source text',
      vector: new Array(1536).fill(0),
      metadata: {
        source_type: 'article',
        title: 'Sample',
        authors: 'Sample',
        year: 2024,
        created_at: Date.now(),
      },
    }];

    const table = await vectorDB.createTable('source_embeddings', sampleData);
    await table.delete('id = "sample"');

    console.log('✅ Tabla source_embeddings creada');
    return table;
  } catch (error) {
    console.error('❌ Error al crear tabla de fuentes:', error.message);
    return null;
  }
}

/**
 * Build Arrow schema for annotation_embeddings table.
 * Uses Utf8 for all strings (never Dictionary) to avoid "two different dictionaries
 * with the same Id" when serializing to LanceDB.
 * @param {number} embeddingDimension - Dimension of embedding vectors
 * @returns {import('apache-arrow').Schema}
 */
function buildAnnotationEmbeddingsSchema(embeddingDimension) {
  return new Schema([
    new Field('id', new Utf8()),
    new Field('resource_id', new Utf8()),
    new Field('annotation_id', new Utf8()),
    new Field('chunk_index', new Int32()),
    new Field('text', new Utf8()),
    new Field('vector', new FixedSizeList(embeddingDimension, new Field('item', new Float32()))),
    new Field('metadata', new Struct([
      new Field('annotation_type', new Utf8()),
      new Field('page_index', new Int32()),
      new Field('created_at', new Float64()),
      new Field('resource_type', new Utf8()),
      new Field('title', new Utf8()),
      new Field('project_id', new Utf8()),
    ])),
  ]);
}

/**
 * Create annotation embeddings table
 * Uses 1024 dimensions by default (Ollama bge-m3), but can be overridden
 * Returns null if vectorDB is not available
 * @param {number} embeddingDimension - Dimension of embedding vectors
 * @param {boolean} forceRecreate - If true, drop existing table and recreate
 */
async function createAnnotationEmbeddingsTable(embeddingDimension = 1024, forceRecreate = false) {
  if (!vectorDB || !vectorDBAvailable) {
    console.log('⚠️ Saltando creación de annotation_embeddings (vectorDB no disponible)');
    return null;
  }

  try {
    const tables = await vectorDB.tableNames();
    const tableExists = tables.includes('annotation_embeddings');
    
    if (tableExists && !forceRecreate) {
      console.log('✓ Tabla annotation_embeddings ya existe');
      return await vectorDB.openTable('annotation_embeddings');
    }

    // If table exists and we need to recreate, drop it first
    if (tableExists && forceRecreate) {
      try {
        await vectorDB.dropTable('annotation_embeddings');
        console.log('🗑️ Tabla annotation_embeddings eliminada para recreación');
      } catch (dropError) {
        console.warn('⚠️ No se pudo eliminar la tabla existente:', dropError.message);
        // Continue anyway - createTable might handle it
      }
    }

    // Create table with sample data using the correct embedding dimension
    const sampleData = [{
      id: 'sample',
      resource_id: 'sample',
      annotation_id: 'sample',
      chunk_index: 0,
      text: 'Sample annotation text',
      vector: new Array(embeddingDimension).fill(0),
      metadata: {
        annotation_type: 'highlight',
        page_index: 0,
        created_at: Date.now(),
        resource_type: 'pdf',
        title: 'Sample',
        project_id: 'sample',
      },
    }];

    const table = await vectorDB.createTable({
      name: 'annotation_embeddings',
      data: sampleData,
      schema: buildAnnotationEmbeddingsSchema(embeddingDimension),
    });

    // Delete sample data
    await table.delete('id = "sample"');

    console.log(`✅ Tabla annotation_embeddings creada con dimensión ${embeddingDimension}`);
    return table;
  } catch (error) {
    console.error('❌ Error al crear tabla de embeddings de anotaciones:', error.message);
    return null;
  }
}

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
 * Main initialization function
 */
async function initializeApp() {
  if (isInitialized) {
    console.log('⚠️ App already initialized');
    return {
      success: true,
      needsOnboarding: checkOnboardingStatus(),
    };
  }

  console.log('🚀 Inicializando Dome...');

  try {
    // 1. Initialize SQLite database
    initSQLite();

    // 1.1. Check database integrity and repair if needed
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

    // 2. Initialize default settings
    initializeDefaultSettings();

    // 3. Initialize file system
    await initFileSystem();

    // 4. Create avatars directory
    createAvatarsDirectory();

    // 5. Initialize vector database (optional - app works without it)
    const vectorInitialized = await initVectorDB();
    if (vectorInitialized) {
      await createResourceEmbeddingsTable();
      await createSourceEmbeddingsTable();
      await createAnnotationEmbeddingsTable();
    } else {
      console.warn('⚠️ Vector database skipped - semantic search will be disabled');
    }

    // 6. Check onboarding status
    const needsOnboarding = checkOnboardingStatus();

    isInitialized = true;
    console.log('✅ Dome inicializado correctamente');

    return {
      success: true,
      needsOnboarding,
    };
  } catch (error) {
    console.error('❌ Error al inicializar Dome:', error);
    // Return success but with onboarding needed to at least show the UI
    return {
      success: true,
      needsOnboarding: true,
    };
  }
}

/**
 * Get vector database instance
 */
function getVectorDB() {
  return vectorDB;
}

module.exports = {
  initializeApp,
  checkOnboardingStatus,
  getVectorDB,
  isInitialized: () => isInitialized,
  isVectorDBAvailable: () => vectorDBAvailable,
  createAnnotationEmbeddingsTable,
};
