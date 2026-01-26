# Guía del Sistema de Sincronización Cross-Window

## Descripción General

Dome utiliza un sistema bidireccional de eventos IPC para sincronizar el estado entre múltiples ventanas de la aplicación. Cuando se realiza una operación CRUD en una ventana, todas las demás ventanas se actualizan automáticamente sin necesidad de recargar.

## Arquitectura

### Flujo de Datos

```
┌──────────────────────────────────────────────────────────┐
│                    Renderer 1 (Ventana A)                 │
│              Usuario edita un documento                    │
└──────────────────┬───────────────────────────────────────┘
                   │
                   ▼
         IPC invoke('db:resources:update')
                   │
                   ▼
┌──────────────────────────────────────────────────────────┐
│                    Main Process                           │
│  1. Actualiza SQLite                    ✓                 │
│  2. windowManager.broadcast()           ▶────────────┐   │
│  3. Return success                                    │   │
└────────────────────────────────────────▲─────────────│───┘
                                        │             │
           ┌────────────────────────────┘             │
           │                                          │
    ┌──────▼────────┐                       ┌────────▼────────┐
    │  Renderer 1   │                       │  Renderer 2     │
    │  (Ventana A)  │                       │  (Ventana B)    │
    │               │                       │                 │
    │ Listener ✓    │                       │ Listener ✓      │
    │ Estado ✓      │                       │ Estado ✓        │
    └───────────────┘                       └─────────────────┘
         Actualizado                             Actualizado
```

### Componentes Clave

#### 1. Main Process (electron/main.cjs)

**Responsabilidades:**
- Ejecutar operaciones de base de datos
- Emitir eventos de broadcast a todas las ventanas
- Validar operaciones de seguridad

**Eventos Emitidos:**
```javascript
// Recursos
windowManager.broadcast('resource:created', resource);
windowManager.broadcast('resource:updated', { id, updates });
windowManager.broadcast('resource:deleted', { id });

// Interacciones
windowManager.broadcast('interaction:created', interaction);
windowManager.broadcast('interaction:updated', { id, updates });
windowManager.broadcast('interaction:deleted', { id });

// Proyectos
windowManager.broadcast('project:created', project);
```

#### 2. Preload Script (electron/preload.cjs)

**Responsabilidades:**
- Validar canales permitidos (whitelist)
- Exponer API segura al renderer
- Gestionar suscripciones de eventos

**Whitelist de Canales:**
```javascript
const ALLOWED_CHANNELS = {
  invoke: [
    'db:resources:create',
    'db:resources:update',
    'db:resources:delete',
    // ... otros canales
  ],
  on: [
    'resource:created',
    'resource:updated',
    'resource:deleted',
    'interaction:created',
    'interaction:updated',
    'interaction:deleted',
    'project:created',
  ]
};
```

#### 3. Hooks (Renderer)

**useResources.ts:**
```typescript
useEffect(() => {
  if (typeof window === 'undefined' || !window.electron) return;

  const unsubscribeCreate = window.electron.on('resource:created',
    (resource: Resource) => {
      setResources(prev => {
        if (prev.some(r => r.id === resource.id)) return prev;
        return [resource, ...prev];
      });
    }
  );

  const unsubscribeUpdate = window.electron.on('resource:updated',
    ({ id, updates }) => {
      setResources(prev =>
        prev.map(r => r.id === id ? { ...r, ...updates } : r)
      );
    }
  );

  const unsubscribeDelete = window.electron.on('resource:deleted',
    ({ id }) => {
      setResources(prev => prev.filter(r => r.id !== id));
    }
  );

  return () => {
    unsubscribeCreate();
    unsubscribeUpdate();
    unsubscribeDelete();
  };
}, []);
```

**useInteractions.ts:**
```typescript
useEffect(() => {
  if (typeof window === 'undefined' || !window.electron) return;

  const unsubscribeCreate = window.electron.on('interaction:created',
    (interaction: Interaction) => {
      if (interaction.resource_id === resourceId) {
        setInteractions(prev => {
          if (prev.some(i => i.id === interaction.id)) return prev;
          const parsed = parseInteraction(interaction);
          return [parsed, ...prev];
        });
      }
    }
  );

  // ... similar para update y delete

  return () => {
    unsubscribeCreate();
    unsubscribeUpdate();
    unsubscribeDelete();
  };
}, [resourceId]);
```

## Cómo Agregar Nuevos Eventos

### Paso 1: Agregar Canal a la Whitelist

```javascript
// electron/preload.cjs
const ALLOWED_CHANNELS = {
  on: [
    // ... existentes
    'tu-nuevo-evento:created',
    'tu-nuevo-evento:updated',
    'tu-nuevo-evento:deleted',
  ]
};
```

### Paso 2: Agregar Broadcast en Main Process

```javascript
// electron/main.cjs
ipcMain.handle('db:tu-entidad:create', (event, data) => {
  try {
    const queries = database.getQueries();
    queries.createTuEntidad.run(/* ... */);

    // ✅ Broadcast evento
    windowManager.broadcast('tu-nuevo-evento:created', data);

    return { success: true, data };
  } catch (error) {
    console.error('[DB] Error creating:', error);
    return { success: false, error: error.message };
  }
});
```

### Paso 3: Crear Hook con Listeners

```typescript
// app/lib/hooks/useTuEntidad.ts
export function useTuEntidad() {
  const [items, setItems] = useState<Item[]>([]);

  // Fetch inicial
  useEffect(() => {
    fetchItems();
  }, []);

  // Setup listeners
  useEffect(() => {
    if (typeof window === 'undefined' || !window.electron) return;

    const unsubscribeCreate = window.electron.on('tu-nuevo-evento:created',
      (item: Item) => {
        setItems(prev => {
          if (prev.some(i => i.id === item.id)) return prev;
          return [item, ...prev];
        });
      }
    );

    const unsubscribeUpdate = window.electron.on('tu-nuevo-evento:updated',
      ({ id, updates }) => {
        setItems(prev =>
          prev.map(i => i.id === id ? { ...i, ...updates } : i)
        );
      }
    );

    const unsubscribeDelete = window.electron.on('tu-nuevo-evento:deleted',
      ({ id }) => {
        setItems(prev => prev.filter(i => i.id !== id));
      }
    );

    return () => {
      unsubscribeCreate();
      unsubscribeUpdate();
      unsubscribeDelete();
    };
  }, []);

  // CRUD operations sin actualizar estado local
  const createItem = useCallback(async (data) => {
    const result = await window.electron.db.tuEntidad.create(data);
    // NO setItems() aquí - el listener se encarga
    return result;
  }, []);

  return { items, createItem, /* ... */ };
}
```

## Patrones de Actualización

### ✅ Correcto: Confiar en los Listeners

```typescript
const createResource = async (data) => {
  await window.electron.db.resources.create(data);
  // ✅ El listener actualizará el estado automáticamente
};
```

### ❌ Incorrecto: Actualización Manual

```typescript
const createResource = async (data) => {
  const result = await window.electron.db.resources.create(data);
  setResources(prev => [result.data, ...prev]); // ❌ Duplicado
  // El listener TAMBIÉN agregará el recurso
};
```

### Prevenir Duplicados

Los listeners deben validar que el item no exista antes de agregarlo:

```typescript
window.electron.on('resource:created', (resource) => {
  setResources(prev => {
    // ✅ Validar duplicados
    if (prev.some(r => r.id === resource.id)) return prev;
    return [resource, ...prev];
  });
});
```

## Optimizaciones de Performance

### 1. Memoización de Componentes

```typescript
// ResourceCard.tsx
export default memo(function ResourceCard({ resource, onClick }) {
  // ...
}, (prevProps, nextProps) => {
  // Solo re-renderizar si props relevantes cambiaron
  return (
    prevProps.resource.id === nextProps.resource.id &&
    prevProps.resource.title === nextProps.resource.title &&
    prevProps.resource.updated_at === nextProps.resource.updated_at
  );
});
```

### 2. Keys Estables en Listas

```tsx
{/* ❌ MAL - Usar índice */}
{messages.map((msg, idx) => (
  <div key={idx}>{msg.content}</div>
))}

{/* ✅ BIEN - Key estable basada en datos */}
{messages.map((msg) => (
  <div key={`${msg.created_at}-${msg.role}`}>
    {msg.content}
  </div>
))}
```

### 3. Filtrado Memoizado

```typescript
const filteredResources = useMemo(() => {
  let filtered = resources;

  if (selectedTypes.length > 0) {
    filtered = filtered.filter(r => selectedTypes.includes(r.type));
  }

  if (searchQuery) {
    filtered = filtered.filter(r =>
      r.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  return filtered;
}, [resources, selectedTypes, searchQuery]);
```

## Debugging

### Verificar Listeners Activos

```typescript
// En el componente
useEffect(() => {
  console.log('[Listeners] Setting up for resourceId:', resourceId);

  const cleanup = window.electron.on('resource:updated', (data) => {
    console.log('[Listener] Received update:', data);
  });

  return () => {
    console.log('[Listeners] Cleaning up for resourceId:', resourceId);
    cleanup();
  };
}, [resourceId]);
```

### Verificar Broadcasts

```javascript
// En electron/main.cjs
windowManager.broadcast('resource:updated', { id, updates });
console.log('[Broadcast] resource:updated:', { id, updates });
```

### Memory Leaks

Verificar que SIEMPRE se retornan funciones de cleanup:

```typescript
// ❌ MAL - Sin cleanup
useEffect(() => {
  window.electron.on('resource:updated', handleUpdate);
}, []);

// ✅ BIEN - Con cleanup
useEffect(() => {
  const unsubscribe = window.electron.on('resource:updated', handleUpdate);
  return unsubscribe; // Cleanup al desmontar
}, []);
```

## Testing

### Test Manual: Sincronización Cross-Window

1. Abrir 2 ventanas de la aplicación
2. Crear un recurso en ventana 1
3. ✅ Verificar que aparece instantáneamente en ventana 2
4. Editar el título en ventana 2
5. ✅ Verificar que se actualiza en ventana 1
6. Eliminar el recurso en ventana 1
7. ✅ Verificar que desaparece en ventana 2

### Test de Performance

1. Crear 100+ recursos
2. Aplicar filtros
3. ✅ Verificar que el filtrado es < 100ms
4. Crear nuevo recurso
5. ✅ Verificar que aparece sin lag

## Troubleshooting

### Problema: Actualizaciones No Se Propagan

**Causa:** Canal no está en la whitelist

**Solución:**
```javascript
// electron/preload.cjs
const ALLOWED_CHANNELS = {
  on: [
    'tu-canal-faltante', // ← Agregar aquí
  ]
};
```

### Problema: Duplicados en la Lista

**Causa:** Listener agrega sin verificar duplicados

**Solución:**
```typescript
window.electron.on('resource:created', (resource) => {
  setResources(prev => {
    if (prev.some(r => r.id === resource.id)) return prev; // ← Agregar
    return [resource, ...prev];
  });
});
```

### Problema: Re-renders Excesivos

**Causa:** Componente no está memoizado

**Solución:**
```typescript
export default memo(function ResourceCard({ resource }) {
  // ...
}, (prevProps, nextProps) => {
  return prevProps.resource.id === nextProps.resource.id &&
         prevProps.resource.updated_at === nextProps.resource.updated_at;
});
```

## Recursos Adicionales

- [Electron IPC Documentation](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [React Hooks Documentation](https://react.dev/reference/react)
- [React.memo Documentation](https://react.dev/reference/react/memo)
- [Dome Architecture Rules](../.claude/rules/architecture-rules.md)

---

**Última actualización:** 2026-01-18
**Versión:** 1.0.0
