# Dome - Claude Code Style Guide

## Contexto del Proyecto

**Dome** es una aplicación de escritorio para gestión de conocimiento e investigación académica.

### Stack Principal
- **Runtime**: Bun (NO Node.js)
- **Frontend**: Next.js 14 + React 18
- **Desktop**: Electron 32
- **Base de Datos**: SQLite (bun:sqlite) + LanceDB (vectorial)
- **Estilos**: Tailwind CSS + CSS Variables
- **Editor**: Tiptap
- **Estado**: Zustand
- **Lenguaje**: TypeScript (strict mode)

## Reglas de Código

### Indentación y Formato
- **2 espacios** para indentación (configurado en .editorconfig)
- Fin de línea: LF (Unix)
- Charset: UTF-8
- Insertar línea final en archivos
- Eliminar espacios en blanco al final de líneas

### TypeScript
```typescript
// ✅ BIEN - Tipos explícitos
interface Resource {
  id: string;
  title: string;
  type: 'note' | 'pdf' | 'video';
}

function createResource(data: Partial<Resource>): Resource {
  // ...
}

// ❌ MAL - Uso de any
function createResource(data: any): any {
  // ...
}
```

### React Components
```tsx
// ✅ BIEN - Componente tipado con destructuring
interface Props {
  resource: Resource;
  onEdit?: (id: string) => void;
}

export default function ResourceCard({ resource, onEdit }: Props) {
  return (
    <div className="card">
      <h3 style={{ color: 'var(--primary)' }}>{resource.title}</h3>
    </div>
  );
}

// ❌ MAL - Props sin tipo
export default function ResourceCard(props) {
  return <div>{props.resource.title}</div>;
}
```

### CSS Variables vs Tailwind
```tsx
// ✅ BIEN - CSS Variables para colores
<div style={{ backgroundColor: 'var(--bg-secondary)' }}>

// ✅ BIEN - Tailwind para layout
<div className="flex flex-col gap-4 p-6">

// ❌ MAL - Colores hardcodeados
<div style={{ backgroundColor: '#f9fafb' }}>
```

### Imports
```typescript
// ✅ BIEN - Orden correcto
import { useState } from 'react';
import { Resource } from '@/types';
import { useAppStore } from '@/lib/store/useAppStore';
import { formatDate } from '@/lib/utils';

// ❌ MAL - Imports relativos profundos
import { formatDate } from '../../../lib/utils';
```

### Base de Datos (SQLite)
```typescript
// ✅ BIEN - Prepared statement
const query = db.prepare('SELECT * FROM resources WHERE id = ?');
const resource = query.get(resourceId);

// ❌ MAL - String concatenation (SQL injection risk)
const query = db.exec(`SELECT * FROM resources WHERE id = '${resourceId}'`);
```

### Error Handling
```typescript
// ✅ BIEN - Try-catch con logging
try {
  const result = await generateEmbeddings(text);
  return result;
} catch (error) {
  console.error('Error al generar embeddings:', error);
  throw new Error('No se pudieron generar los embeddings');
}

// ❌ MAL - Ignorar errores
try {
  const result = await generateEmbeddings(text);
} catch (error) {
  // Silent fail
}
```

### Electron Security
```typescript
// ✅ BIEN - Seguridad habilitada
const mainWindow = new BrowserWindow({
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    preload: path.join(__dirname, 'preload.cjs'),
  },
});

// ❌ MAL - Node.js expuesto al renderer
const mainWindow = new BrowserWindow({
  webPreferences: {
    nodeIntegration: true,
    contextIsolation: false,
  },
});
```

## Patrones Específicos de Dome

### Estructura de Componentes
```
app/components/
  ResourceCard.tsx      # Componente individual
  Modal.tsx             # Componente reutilizable
  Editor.tsx            # Editor Tiptap
```

### Zustand Store
```typescript
// ✅ BIEN - Store tipado
interface AppState {
  resources: Resource[];
  addResource: (resource: Resource) => void;
}

export const useAppStore = create<AppState>((set) => ({
  resources: [],
  addResource: (resource) => set((state) => ({
    resources: [...state.resources, resource]
  })),
}));
```

### Generación de IDs
```typescript
// ✅ BIEN - Usar función centralizada
import { generateId } from '@/lib/utils';

const newResource = {
  id: generateId(),
  title: 'Nueva nota',
};
```

### Rutas de Archivos
```typescript
// ✅ BIEN - Usar función de paths
import { getUserDataPath } from '@/lib/utils/paths';

const dbPath = path.join(getUserDataPath(), 'dome.db');

// ❌ MAL - Hardcodear rutas
const dbPath = '/Users/usuario/Library/dome.db';
```

## Directrices de IA

### Cuando generar embeddings
```typescript
// Generar embeddings al:
// 1. Crear un nuevo recurso
// 2. Editar el contenido de un recurso
// 3. Importar documentos

async function createResource(data: ResourceData) {
  // 1. Guardar en SQLite
  queries.createResource.run(...);

  // 2. Generar embeddings
  const chunks = chunkText(data.content);
  const embeddings = await generateEmbeddings(chunks);

  // 3. Guardar en LanceDB
  await insertResourceEmbeddings(embeddings);
}
```

### Búsqueda Semántica
```typescript
// Flujo de búsqueda semántica:
// 1. Usuario hace query
// 2. Generar embedding del query
// 3. Buscar en LanceDB
// 4. Obtener metadatos de SQLite
// 5. Mostrar resultados

async function semanticSearch(query: string) {
  const queryEmbedding = await generateEmbeddings([query]);
  const results = await searchResourceEmbeddings(queryEmbedding[0]);

  // JOIN con SQLite para metadatos completos
  return results.map(r => ({
    ...r,
    resource: queries.getResourceById.get(r.resource_id)
  }));
}
```

## Variables CSS Disponibles

```css
/* Colores */
--brand-primary       /* #0ea5e9 */
--primary             /* Texto principal */
--secondary           /* Texto secundario */
--bg                  /* Fondo principal */
--bg-secondary        /* Fondo secundario */
--border              /* Bordes */
--base                /* Color interactivo */

/* Layout */
--sidebar-width       /* 264px */
--header-height       /* 64px */

/* Transiciones */
--transition-fast     /* 150ms */
--transition-base     /* 200ms */

/* Radius */
--radius-sm           /* 0.375rem */
--radius-md           /* 0.5rem */
--radius-lg           /* 0.75rem */
```

## Comandos Útiles

```bash
# Desarrollo
bun run dev              # Solo Next.js
bun run electron:dev     # App completa

# Testing
bun run test:db          # Probar bases de datos

# Limpieza
bun run clean            # Limpiar datos locales
```

## Recordatorios

1. **Siempre** usar CSS Variables para colores
2. **Nunca** hardcodear rutas de archivos
3. **Validar** todos los inputs del usuario
4. **Preparar** queries SQL (prevenir injection)
5. **Tipear** todo con TypeScript
6. **Loguear** errores con console.error
7. **2 espacios** de indentación
8. **Bun** como runtime (NO npm/node)

## Prioridades de Desarrollo

1. **Seguridad** (validación, sanitización)
2. **Performance** (lazy loading, memoización)
3. **Type Safety** (TypeScript strict)
4. **UX** (feedback visual, estados de carga)
5. **Accesibilidad** (keyboard nav, ARIA)
