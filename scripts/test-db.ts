#!/usr/bin/env bun

/**
 * Script de prueba para verificar que las bases de datos funcionan correctamente
 * Ejecutar con: bun run scripts/test-db.ts
 */

import { initDatabase, queries } from '../app/lib/db/sqlite';
import { initVectorDB, createResourceEmbeddingsTable, createSourceEmbeddingsTable } from '../app/lib/db/vector';
import { initFileSystem } from '../app/lib/files/manager';
import { generateId } from '../app/lib/utils';

async function testDatabases() {
  console.log('🧪 Iniciando pruebas de bases de datos...\n');

  try {
    // 1. Inicializar SQLite
    console.log('📦 1. Inicializando SQLite...');
    initDatabase();
    console.log('   ✅ SQLite inicializado\n');

    // 2. Inicializar sistema de archivos
    console.log('📁 2. Inicializando sistema de archivos...');
    await initFileSystem();
    console.log('   ✅ Sistema de archivos inicializado\n');

    // 3. Inicializar base de datos vectorial
    console.log('🔮 3. Inicializando base de datos vectorial...');
    await initVectorDB();
    await createResourceEmbeddingsTable();
    await createSourceEmbeddingsTable();
    console.log('   ✅ Base de datos vectorial inicializada\n');

    // 4. Probar operaciones básicas
    console.log('🔄 4. Probando operaciones básicas...');

    // Crear un proyecto de prueba
    const projectId = generateId();
    const now = Date.now();

    queries.createProject.run(
      projectId,
      'Proyecto de Prueba',
      'Este es un proyecto de prueba',
      null,
      now,
      now
    );
    console.log('   ✅ Proyecto creado:', projectId);

    // Crear un recurso de prueba
    const resourceId = generateId();
    queries.createResource.run(
      resourceId,
      projectId,
      'note',
      'Mi primera nota',
      '<p>Este es el contenido de mi primera nota en Dome</p>',
      null,
      null,
      now,
      now
    );
    console.log('   ✅ Recurso creado:', resourceId);

    // Leer proyectos
    const projects = queries.getProjects.all();
    console.log('   ✅ Proyectos encontrados:', projects.length);

    // Leer recursos
    const resources = queries.getResourcesByProject.all(projectId);
    console.log('   ✅ Recursos encontrados:', resources.length);

    // Búsqueda FTS
    const searchResults = queries.searchResources.all('primera nota');
    console.log('   ✅ Resultados de búsqueda:', searchResults.length);

    console.log('\n✅ Todas las pruebas pasaron exitosamente!\n');
    console.log('📊 Resumen:');
    console.log(`   - Proyectos: ${projects.length}`);
    console.log(`   - Recursos: ${resources.length}`);
    console.log(`   - Búsquedas: ${searchResults.length} resultados`);
    console.log('\n💡 Las bases de datos están listas para usar.');
    console.log('   Ejecuta: bun run electron:dev para iniciar la aplicación\n');

  } catch (error) {
    console.error('\n❌ Error durante las pruebas:', error);
    process.exit(1);
  }
}

// Ejecutar pruebas
testDatabases();
