const { ipcMain } = require('electron');
const lancedb = require('vectordb');
const path = require('path');
const fs = require('fs');

class VectorHandler {
  constructor() {
    this.db = null;
    this.table = null;
    this.tableName = 'vectors';
    this.initialized = false;
  }

  async initialize(userDataPath) {
    if (this.initialized) return;

    try {
      const dbPath = path.join(userDataPath, 'lancedb');
      if (!fs.existsSync(dbPath)) {
        fs.mkdirSync(dbPath, { recursive: true });
      }

      console.log('Inicializando LanceDB en:', dbPath);
      this.db = await lancedb.connect(dbPath);
      
      const tableNames = await this.db.tableNames();
      if (!tableNames.includes(this.tableName)) {
        console.log('Creando tabla de vectores...');
        // Schema inicial simple, se puede expandir
        // id: identificador único del chunk
        // text: contenido del chunk
        // vector: embedding (asumimos 384 dim para all-MiniLM-L6-v2 por defecto, o 768/1536 según modelo)
        // metadata: JSON string con info extra (source, page, etc)
        // timestamp: fecha de ingestión
        
        // LanceDB crea tablas inferidas del primer dato si no se pasa schema estricto.
        // Para asegurar, creamos una tabla vacía con un registro dummy y luego lo borramos, 
        // o esperamos al primer insert.
        // Mejor estrategia: Lazy init en el primer add, o crear con dummy.
        // Por ahora, lo dejaremos para createTable_deprecated o crearemos con un schema dummy.
        
        // NOTA: LanceDB Node API v0.4+ permite crear tablas vacías con schema, 
        // pero la API JS a veces prefiere datos.
        // Vamos a esperar al primer insert para crear la tabla si no existe,
        // o usar una estrategia de "ensureTable".
      } else {
        this.table = await this.db.openTable(this.tableName);
      }

      this.initialized = true;
      this.setupHandlers();
      console.log('VectorHandler inicializado correctamente');
    } catch (error) {
      console.error('Error inicializando VectorHandler:', error);
      throw error;
    }
  }

  setupHandlers() {
    ipcMain.handle('vector:add', async (_, items) => {
      return this.addItems(items);
    });

    ipcMain.handle('vector:search', async (_, { vector, limit = 5, filter = null }) => {
      return this.search(vector, limit, filter);
    });

    ipcMain.handle('vector:delete', async (_, filter) => {
      return this.delete(filter);
    });
    
    ipcMain.handle('vector:count', async () => {
        if (!this.table) return 0;
        return this.table.countRows();
    });
  }

  async ensureTable(firstItem) {
    if (this.table) return;

    const tableNames = await this.db.tableNames();
    if (tableNames.includes(this.tableName)) {
      this.table = await this.db.openTable(this.tableName);
    } else {
        if (!firstItem) throw new Error("No se puede crear tabla sin datos iniciales para inferir schema");
        console.log("Creando tabla nueva con schema inferido...");
        this.table = await this.db.createTable(this.tableName, [firstItem]);
    }
  }

  async addItems(items) {
    if (!this.initialized) throw new Error('VectorDB no inicializado');
    if (!items || items.length === 0) return { success: true, count: 0 };

    try {
      // Asegurar que items tengan el formato correcto
      // LanceDB espera array de objetos.
      // items: [{ vector: [...], text: "...", id: "...", ... }]
      
      if (!this.table) {
        // Usar el primer item para crear la tabla si no existe
        // Pero OJO: createTable consume los datos.
        // Si hay muchos items, createTable con todos es mejor.
        const tableNames = await this.db.tableNames();
        if (!tableNames.includes(this.tableName)) {
            this.table = await this.db.createTable(this.tableName, items);
            return { success: true, count: items.length };
        } else {
            this.table = await this.db.openTable(this.tableName);
        }
      }

      await this.table.add(items);
      return { success: true, count: items.length };
    } catch (error) {
      console.error('Error adding vectors:', error);
      return { success: false, error: error.message };
    }
  }

  async search(queryVector, limit = 5, filter = null) {
    if (!this.initialized) throw new Error('VectorDB no inicializado');
    if (!this.table) {
        // Intentar abrir por si acaso se creó en otra instancia (raro en sqlite mode)
        const tableNames = await this.db.tableNames();
        if (tableNames.includes(this.tableName)) {
            this.table = await this.db.openTable(this.tableName);
        } else {
            return []; // Tabla no existe, nada que buscar
        }
    }

    try {
      let query = this.table.search(queryVector).limit(limit);
      
      if (filter) {
          // LanceDB soporta filtrado SQL-like en where
          // filter ej: "source = 'document.pdf'"
          query = query.where(filter);
      }

      const results = await query.execute();
      return results;
    } catch (error) {
      console.error('Error searching vectors:', error);
      return [];
    }
  }

  async delete(filter) {
      if (!this.initialized || !this.table) return { success: false, error: 'Table not found' };
      try {
          if (filter) {
              await this.table.delete(filter);
          }
          return { success: true };
      } catch (error) {
          console.error('Error deleting vectors:', error);
          return { success: false, error: error.message };
      }
  }
}

module.exports = new VectorHandler();
