# Dome - Reglas de Arquitectura

## 🚨 REGLAS CRÍTICAS - NO ROMPER

### 1. Separación de Procesos en Electron

**NUNCA usar `better-sqlite3`, `node:fs`, u otros módulos de Node.js en el renderer process (Vite + React).**
**Tampoco imports a módulos virtuales de otros runtimes (prefijos no soportados por Node en Electron).**

#### ✅ Arquitectura Correcta:

```
┌─────────────────────────────┐
│   MAIN PROCESS              │
│   (electron/*.cjs)          │
│                             │
│   ✅ better-sqlite3         │
│   ✅ node:fs completo       │
│   ✅ APIs del SO            │
│   ✅ Operaciones de archivos│
│                             │
└─────────────┬───────────────┘
              │
              │ IPC
              │
┌─────────────▼───────────────┐
│   PRELOAD SCRIPT            │
│   (electron/preload.cjs)    │
│                             │
│   ✅ contextBridge          │
│   ✅ Exponer API mínima     │
│                             │
└─────────────┬───────────────┘
              │
              │ window.electron
              │
┌─────────────▼───────────────┐
│   RENDERER PROCESS          │
│   (app/**, Vite + React)    │
│                             │
│   ❌ NO better-sqlite3      │
│   ❌ NO node:fs directo     │
│   ❌ NO imports SQLite/Node directos │
│   ✅ Solo window.electron   │
│   ✅ Solo IPC calls         │
│                             │
└─────────────────────────────┘
```

### 2. Base de Datos (SQLite)

#### ✅ CORRECTO:

**Main Process** (`electron/database.cjs`):
```javascript
const Database = require('better-sqlite3');
const db = new Database(dbPath);
```

**IPC Handler** (`electron/main.cjs`):
```javascript
ipcMain.handle('db:projects:getAll', () => {
  const queries = database.getQueries();
  return queries.getProjects.all();
});
```

**Preload** (`electron/preload.cjs`):
```javascript
contextBridge.exposeInMainWorld('electron', {
  db: {
    projects: {
      getAll: () => ipcRenderer.invoke('db:projects:getAll')
    }
  }
});
```

**Renderer Client** (`app/lib/db/client.ts`):
```typescript
export const db = {
  async getProjects() {
    return window.electron.db.projects.getAll();
  }
};
```

#### ❌ INCORRECTO:

**NO hacer esto en el renderer** (`app/**/*.ts`):
```typescript
// ❌ ESTO NO FUNCIONA - better-sqlite3 no está disponible en el renderer
import Database from 'better-sqlite3';
const db = new Database('dome.db');

```

### 3. Operaciones de Archivos

#### ✅ CORRECTO:

**Main Process**:
```javascript
ipcMain.handle('file:read', (event, filePath) => {
  // Validar path
  if (!isValidPath(filePath)) {
    return { success: false, error: 'Invalid path' };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { success: true, data: content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

**Renderer**:
```typescript
const result = await window.electron.invoke('file:read', filePath);
```

#### ❌ INCORRECTO:

```typescript
// ❌ NO hacer esto en el renderer
import fs from 'fs';
const content = fs.readFileSync(filePath);
```

### 4. Estructura de Archivos

```
dome-local/
├── electron/                 # Main Process (Node.js)
│   ├── main.cjs             # ✅ better-sqlite3, node:fs, IPC handlers
│   ├── preload.cjs          # ✅ contextBridge, ALLOWED_CHANNELS
│   ├── database.cjs         # ✅ better-sqlite3 operations
│   ├── ipc/<domain>.cjs     # ✅ Handlers agrupados por dominio
│   └── window-manager.cjs   # ✅ Window management
│
└── app/                      # Renderer Process (Vite + React SPA)
    ├── main.tsx             # ✅ Vite entry
    ├── App.tsx              # ✅ React Router
    ├── components/          # ✅ React components
    ├── lib/
    │   ├── db/client.ts     # ✅ IPC wrapper (NO sqlite directo)
    │   └── utils/           # ✅ Utilidades puras
    └── types/               # ✅ TypeScript types
```

### 5. Checklist Pre-Commit

Antes de crear código, verificar:

- [ ] ¿Estoy en main process o renderer?
- [ ] ¿Necesito acceso a Node.js APIs?
  - **SÍ** → Crear IPC handler en `electron/main.cjs`
  - **NO** → Puedo usar código en `app/`
- [ ] ¿Necesito base de datos?
  - **SÍ** → Usar `window.electron.db` via IPC
  - **NO** → Usar estado local (Zustand, React State)
- [ ] ¿Necesito archivos?
  - **SÍ** → Crear IPC handler en main process
  - **NO** → Usar fetch/APIs web

### 6. Testing de Arquitectura

Para verificar que todo está correcto:

```bash
# Si esto está en el renderer, es un ERROR (debe devolver 0 líneas):
grep -rE "from ['\"]better-sqlite3['\"]" app/
grep -rE "from ['\"]fs['\"]|from ['\"]node:fs['\"]" app/
grep -rE "from ['\"]electron['\"]|from ['\"]child_process['\"]" app/

# Prefijos de módulos virtuales no estándar en el renderer (debe devolver 0 líneas en app/):
grep -rE "bun:" app/ --include="*.ts" --include="*.tsx"
```

### 7. Mensajes de Error Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `existsSync is not a function` | Usando `fs` en renderer | Mover a main process |
| `prepare is not a function` | Usando `better-sqlite3` en renderer | Mover a main process, llamar vía IPC |
| `require is not defined` | Usando `require()` en renderer | Usar `import` o IPC |
| `Database is not a constructor` | Importando `better-sqlite3` en renderer | Usar IPC client |
| `Cannot find module` (módulo virtual) | Import no soportado en Chromium | Usar solo APIs vía IPC / `better-sqlite3` en main |

## Flujo de Desarrollo

1. **Identificar proceso**:
   - ¿Dónde se ejecuta este código?
   - Main → `.cjs` en `electron/`
   - Renderer → `.ts/.tsx` en `app/`

2. **Operaciones de sistema**:
   - Crear handler IPC en `electron/main.cjs`
   - Exponer en `electron/preload.cjs`
   - Usar desde `app/` vía `window.electron`

3. **Validación**:
   - Main process valida TODOS los inputs
   - Nunca confiar en datos del renderer
   - Sanitizar paths y queries

4. **Testing**:
   - Probar en desarrollo con DevTools
   - Verificar que funciona sin Node.js en renderer
   - Probar build de producción

## Referencias

- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [IPC Communication](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)
