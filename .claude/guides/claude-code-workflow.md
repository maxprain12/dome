# Claude Code Workflow - Dome

## Guía para Claude Code al Trabajar en Dome

Esta guía contiene instrucciones específicas para Claude Code sobre cómo trabajar eficientemente en el proyecto Dome, siguiendo las mejores prácticas establecidas y aprovechando el sistema de sincronización cross-window.

## Pre-Commit Checklist

Antes de cada commit, verifica:

### 1. Separación de Procesos Electron

```bash
# ❌ Verificar que NO hay imports de Node.js en el renderer
grep -r "require('bun:sqlite')" app/
grep -r "require('node:fs')" app/
grep -r "from 'bun:sqlite'" app/

# ✅ Debe retornar 0 resultados en app/
```

**Regla de oro:**
- `electron/` → Main Process → ✅ Puede usar Node.js/Bun APIs
- `app/` → Renderer Process → ❌ Solo IPC vía window.electron

### 2. Sistema de Sincronización

Cuando modifiques operaciones CRUD:

```typescript
// ✅ HACER: Confiar en los listeners
const createResource = async (data) => {
  await window.electron.db.resources.create(data);
  // El listener actualizará el estado
};

// ❌ NO HACER: Actualizar estado local
const createResource = async (data) => {
  const result = await window.electron.db.resources.create(data);
  setResources(prev => [...prev, result.data]); // ← ELIMINAR
};
```

### 3. Broadcasts en Main Process

Si agregas un nuevo IPC handler que modifica datos:

```javascript
// electron/main.cjs
ipcMain.handle('db:nueva-entidad:create', (event, data) => {
  try {
    const queries = database.getQueries();
    queries.createNuevaEntidad.run(/* ... */);

    // ✅ CRÍTICO: Agregar broadcast
    windowManager.broadcast('nueva-entidad:created', data);

    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

### 4. Whitelist en Preload

Si agregas nuevos eventos:

```javascript
// electron/preload.cjs
const ALLOWED_CHANNELS = {
  on: [
    // ... existentes
    'nueva-entidad:created',  // ← AGREGAR
    'nueva-entidad:updated',
    'nueva-entidad:deleted',
  ]
};
```

## Comandos Útiles para Desarrollo

```bash
# Desarrollo completo (Electron + Next.js)
bun run electron:dev

# Solo Next.js (para probar UI)
bun run dev

# Testing de base de datos
bun run test:db

# Limpiar datos locales
bun run clean

# Build para producción
bun run build && bun run dist
```

## Testing de Sincronización Cross-Window

### Test Básico

1. Ejecutar aplicación: `bun run electron:dev`
2. Abrir 2 ventanas:
   - Ventana 1: Home
   - Ventana 2: Home en nueva ventana
3. Operaciones a probar:

```
┌──────────────────────────────────────────┐
│ Test 1: Crear Recurso                    │
├──────────────────────────────────────────┤
│ 1. Ventana 1: Crear nueva nota           │
│ 2. ✅ Verificar aparece en Ventana 2     │
│ 3. ✅ Título correcto                    │
│ 4. ✅ Sin duplicados                     │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ Test 2: Editar Recurso                   │
├──────────────────────────────────────────┤
│ 1. Ventana 1: Abrir workspace de nota    │
│ 2. Cambiar título a "Test Update"        │
│ 3. ✅ Verificar cambio en Ventana 2      │
│ 4. ✅ Actualización instantánea          │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ Test 3: Eliminar Recurso                 │
├──────────────────────────────────────────┤
│ 1. Ventana 2: Eliminar un recurso        │
│ 2. ✅ Desaparece en Ventana 1            │
│ 3. ✅ Sin errores en consola             │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ Test 4: Chat Multi-Ventana               │
├──────────────────────────────────────────┤
│ 1. Abrir mismo recurso en 2 ventanas     │
│ 2. Enviar mensaje en Ventana 1           │
│ 3. ✅ Aparece en Ventana 2 sin reload    │
│ 4. ✅ Orden correcto de mensajes         │
└──────────────────────────────────────────┘
```

### Test de Performance

```
┌──────────────────────────────────────────┐
│ Test de Filtrado con Datos               │
├──────────────────────────────────────────┤
│ 1. Importar 50+ archivos                 │
│ 2. Aplicar filtro (solo PDFs)            │
│ 3. ✅ Filtrado instantáneo (< 100ms)     │
│ 4. Crear nuevo PDF en otra ventana       │
│ 5. ✅ Aparece sin lag en filtro          │
└──────────────────────────────────────────┘
```

## Patrones a Seguir

### 1. Hooks con Listeners

**Estructura estándar:**

```typescript
// app/lib/hooks/useEntidad.ts
export function useEntidad(filter?: Filter) {
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 1. Fetch inicial
  const fetchItems = useCallback(async () => {
    // ...
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // 2. Setup listeners (CRÍTICO)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron) return;

    const unsubscribeCreate = window.electron.on('entidad:created',
      (item: Item) => {
        setItems(prev => {
          if (prev.some(i => i.id === item.id)) return prev;
          return [item, ...prev];
        });
      }
    );

    const unsubscribeUpdate = window.electron.on('entidad:updated',
      ({ id, updates }) => {
        setItems(prev =>
          prev.map(i => i.id === id ? { ...i, ...updates } : i)
        );
      }
    );

    const unsubscribeDelete = window.electron.on('entidad:deleted',
      ({ id }) => {
        setItems(prev => prev.filter(i => i.id !== id));
      }
    );

    // 3. Cleanup (OBLIGATORIO)
    return () => {
      unsubscribeCreate();
      unsubscribeUpdate();
      unsubscribeDelete();
    };
  }, [/* dependencias mínimas */]);

  // 4. CRUD sin actualizar estado local
  const createItem = useCallback(async (data) => {
    const result = await window.electron.db.entidad.create(data);
    // NO setItems() - listener se encarga
    return result;
  }, []);

  return {
    items,
    isLoading,
    createItem,
    // ...
  };
}
```

### 2. Componentes Memoizados

Para componentes que se renderizan en listas:

```typescript
export default memo(function ComponentCard({
  item,
  onClick
}: Props) {
  // ...
}, (prevProps, nextProps) => {
  // Comparador personalizado
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.updated_at === nextProps.item.updated_at &&
    prevProps.item.title === nextProps.item.title
  );
});
```

### 3. Keys Estables

```tsx
{/* ❌ NO usar índice */}
{items.map((item, idx) => <Card key={idx} />)}

{/* ✅ Usar ID único */}
{items.map((item) => <Card key={item.id} />)}

{/* ✅ Key compuesta si no hay ID */}
{items.map((item) => (
  <Card key={`${item.created_at}-${item.type}`} />
))}
```

## Errores Comunes y Soluciones

### Error: `existsSync is not a function`

**Causa:** Usando `fs` en el renderer

**Ubicación típica:** `app/lib/db/*.ts`

**Solución:**
```typescript
// ❌ ANTES (en renderer)
import fs from 'fs';
const exists = fs.existsSync(path);

// ✅ DESPUÉS (crear IPC handler)
// En electron/main.cjs
ipcMain.handle('file:exists', (event, filePath) => {
  return fs.existsSync(filePath);
});

// En app/
const exists = await window.electron.invoke('file:exists', path);
```

### Error: Duplicados en Lista

**Causa:** Listener agrega sin verificar duplicados

**Solución:**
```typescript
window.electron.on('resource:created', (resource) => {
  setResources(prev => {
    // ✅ Validar duplicados
    if (prev.some(r => r.id === resource.id)) {
      console.warn('Duplicate prevented:', resource.id);
      return prev;
    }
    return [resource, ...prev];
  });
});
```

### Error: Memory Leak - Listeners No Limpiados

**Causa:** No retornar cleanup en useEffect

**Solución:**
```typescript
// ❌ SIN cleanup
useEffect(() => {
  window.electron.on('resource:updated', handleUpdate);
}, []);

// ✅ CON cleanup
useEffect(() => {
  const unsubscribe = window.electron.on('resource:updated', handleUpdate);
  return unsubscribe; // ← CRÍTICO
}, []);
```

### Error: Cambios No Se Propagan

**Síntomas:**
- Crear recurso en ventana 1
- No aparece en ventana 2

**Diagnóstico:**
```javascript
// 1. Verificar broadcast en main.cjs
windowManager.broadcast('resource:created', resource);
console.log('[DEBUG] Broadcast sent:', resource.id);

// 2. Verificar listener en hook
window.electron.on('resource:created', (resource) => {
  console.log('[DEBUG] Listener received:', resource.id);
  // ...
});

// 3. Verificar whitelist en preload.cjs
const ALLOWED_CHANNELS = {
  on: [
    'resource:created', // ← Debe estar aquí
  ]
};
```

## Workflow para Nuevas Features

### Ejemplo: Agregar Sistema de Tags

#### 1. Main Process (electron/main.cjs)

```javascript
// Tags CRUD handlers
ipcMain.handle('db:tags:create', (event, tag) => {
  try {
    const queries = database.getQueries();
    queries.createTag.run(/* ... */);

    // ✅ Broadcast
    windowManager.broadcast('tag:created', tag);

    return { success: true, data: tag };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:tags:update', (event, tag) => {
  try {
    const queries = database.getQueries();
    queries.updateTag.run(/* ... */);

    // ✅ Broadcast
    windowManager.broadcast('tag:updated', {
      id: tag.id,
      updates: tag
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:tags:delete', (event, tagId) => {
  try {
    const queries = database.getQueries();
    queries.deleteTag.run(tagId);

    // ✅ Broadcast
    windowManager.broadcast('tag:deleted', { id: tagId });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

#### 2. Preload (electron/preload.cjs)

```javascript
const ALLOWED_CHANNELS = {
  invoke: [
    // ... existentes
    'db:tags:create',
    'db:tags:update',
    'db:tags:delete',
    'db:tags:getAll',
  ],
  on: [
    // ... existentes
    'tag:created',
    'tag:updated',
    'tag:deleted',
  ]
};

// Agregar a db object
db: {
  // ... existentes
  tags: {
    create: (tag) => ipcRenderer.invoke('db:tags:create', tag),
    update: (tag) => ipcRenderer.invoke('db:tags:update', tag),
    delete: (id) => ipcRenderer.invoke('db:tags:delete', id),
    getAll: () => ipcRenderer.invoke('db:tags:getAll'),
  }
}
```

#### 3. Hook (app/lib/hooks/useTags.ts)

```typescript
export function useTags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch inicial
  const fetchTags = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electron) return;
    try {
      const result = await window.electron.db.tags.getAll();
      if (result.success) {
        setTags(result.data);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  // Listeners
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron) return;

    const unsubscribeCreate = window.electron.on('tag:created',
      (tag: Tag) => {
        setTags(prev => {
          if (prev.some(t => t.id === tag.id)) return prev;
          return [tag, ...prev];
        });
      }
    );

    const unsubscribeUpdate = window.electron.on('tag:updated',
      ({ id, updates }) => {
        setTags(prev =>
          prev.map(t => t.id === id ? { ...t, ...updates } : t)
        );
      }
    );

    const unsubscribeDelete = window.electron.on('tag:deleted',
      ({ id }) => {
        setTags(prev => prev.filter(t => t.id !== id));
      }
    );

    return () => {
      unsubscribeCreate();
      unsubscribeUpdate();
      unsubscribeDelete();
    };
  }, []);

  // CRUD sin actualización local
  const createTag = useCallback(async (data) => {
    const result = await window.electron.db.tags.create(data);
    return result;
  }, []);

  return { tags, isLoading, createTag, /* ... */ };
}
```

## Debugging Tips

### 1. Verificar Listeners Activos

```typescript
// En DevTools Console
window.electron.on('resource:created', (data) => {
  console.log('LISTENER ACTIVE:', data);
});
```

### 2. Verificar Broadcasts

```javascript
// En electron/main.cjs
windowManager.broadcast('resource:created', resource);
console.log('[BROADCAST] Windows count:', windowManager.count());
console.log('[BROADCAST] Data:', resource);
```

### 3. Performance Profiler

```bash
# 1. Abrir React DevTools → Profiler
# 2. Iniciar grabación
# 3. Realizar operación (ej: filtrar recursos)
# 4. Detener grabación
# 5. Verificar:
#    ✅ Solo componentes afectados re-renderizan
#    ✅ Componentes memoizados NO se re-renderizan
```

## Referencias Rápidas

- [State Sync Guide](./state-sync-guide.md) - Guía completa del sistema
- [Architecture Rules](../.claude/rules/architecture-rules.md) - Reglas de arquitectura
- [Electron Best Practices](../.claude/rules/electron-best-practices.md) - Mejores prácticas
- [Style Guide](../.claude/rules/dome-style-guide.md) - Guía de estilos

---

**Última actualización:** 2026-01-18
**Versión:** 1.0.0
