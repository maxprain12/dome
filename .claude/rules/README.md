# Dome — Reglas de Claude Code

## Descripción

Este directorio contiene las reglas y mejores prácticas para el desarrollo de Dome.

## Stack real (lee primero)

> Si un archivo de este directorio dice lo contrario, **gana esto**. El código autoritativo está en `/CLAUDE.md` (raíz del repo).

- **Runtime**: Node.js + **npm** (CI: `npm ci`; lockfile `package-lock.json`).
- **Main process (Electron)**: SQLite vía **`better-sqlite3`**.
- **Renderer**: Vite 7 + React 18 + React Router 7 (SPA cliente, entrada `app/main.tsx`). NO Next.js.
- **TypeScript**: modo strict + `verbatimModuleSyntax: true` → imports de tipos SIEMPRE con `import type`.

## Archivos de Reglas

### 1. `architecture-rules.md` ⚠️ **CRÍTICO**
Reglas de arquitectura que **NUNCA** deben romperse.
- Separación de procesos Electron (main vs renderer)
- Base de datos SQLite (better-sqlite3 en main, IPC desde renderer)
- Operaciones de archivos (solo en main)
- Estructura de archivos
- Checklist pre-commit
- Mensajes de error comunes

### 2. `electron-best-practices.md`
Guía de desarrollo Electron (seguridad, ventanas, IPC, memoria, patrones comunes).

### 3. `dome-style-guide.md`
Guía de estilos específica del proyecto (TypeScript, React, CSS Variables, etc.).

### 4. `ui-style-guidelines.md`
Design system Dome (colores, tipografía, spacing, componentes base).

### 5. `new-color-palette.md`
Paleta de colores actual (los nombres de variable a usar en código nuevo).

## Prioridad de Lectura

Para **nuevos desarrolladores** o **Claude Code**:

1. **PRIMERO**: `/CLAUDE.md` (raíz del repo) — la autoridad.
2. **SEGUNDO**: `architecture-rules.md` 🚨 — separación main/renderer, IPC.
3. **TERCERO**: `dome-style-guide.md` — convenciones de código.
4. **CUARTO**: `electron-best-practices.md` — patrones avanzados.

## Para Claude Code

Cuando Claude Code trabaja en este proyecto, debe:

1. **Siempre** verificar en qué proceso está trabajando:
   - `electron/` → Main Process → Node.js completo, `better-sqlite3`, `fs`, etc.
   - `app/` → Renderer Process → solo `window.electron.*` vía IPC.

2. **Antes de usar base de datos**:
   - ✅ En `electron/`: `require('better-sqlite3')` directamente.
   - ✅ En `app/`: `window.electron.invoke('db:...')` vía IPC.

3. **Antes de operaciones de archivos**:
   - ✅ En `electron/`: `require('fs')` directamente.
   - ✅ En `app/`: crear handler IPC en `electron/ipc/<domain>.cjs`, whitelist en `preload.cjs`, llamar vía `window.electron.invoke`.

4. **Validación**:
   - Handlers IPC validan `event.sender` y sanitizan inputs.
   - Nunca confiar en datos del renderer.

## Errores Comunes a Evitar

| Error | Archivo | Solución |
|-------|---------|----------|
| `existsSync is not a function` en renderer | `app/**/*.ts[x]` | Mover a main + IPC |
| `prepare is not a function` en renderer | `app/**/*.ts[x]` | Usar `window.electron.invoke('db:...')` |
| Importing `better-sqlite3` en `app/` | `app/**/*.ts` | Mover a `electron/database.cjs` |
| Importing `node:fs`/`fs` en `app/` | `app/**/*.ts` | Crear handler IPC |
| Importar módulos virtuales no soportados en el renderer | `app/**` | Usar solo IPC; SQLite solo en `electron/` con `better-sqlite3` |

## Estructura Correcta

```
dome/
├── electron/                   # Main Process (Node.js)
│   ├── main.cjs                # Entry, window management
│   ├── preload.cjs             # contextBridge + ALLOWED_CHANNELS whitelist
│   ├── database.cjs            # better-sqlite3
│   ├── ipc/<domain>.cjs        # handlers por dominio
│   └── window-manager.cjs
│
└── app/                        # Renderer Process (Vite + React SPA)
    ├── main.tsx                # Vite entry
    ├── App.tsx                 # React Router
    ├── lib/
    │   ├── db/client.ts        # IPC wrapper (NO sqlite directo)
    │   └── utils/              # Pure utilities
    └── components/             # React components
```

## Referencias Rápidas

### ¿Dónde va mi código?

```
┌─────────────────────────────────────────────────────────┐
│ ¿Necesitas APIs de Node.js (fs, child_process, db…)?   │
│                                                         │
│ SÍ → electron/                                          │
│    ├─ Handler IPC en electron/ipc/<domain>.cjs         │
│    ├─ Whitelist el canal en preload.cjs                │
│    └─ Llamar desde app/ vía window.electron.invoke     │
│                                                         │
│ NO → app/                                               │
│    ├─ Componentes React                                │
│    ├─ Estado (Zustand / Jotai)                         │
│    ├─ Utilidades puras                                 │
│    └─ Lógica de UI                                     │
└─────────────────────────────────────────────────────────┘
```

### Comandos Útiles

```bash
# Verificar que NO hay imports de Node.js en app/ (debe devolver 0 líneas)
grep -rE "from ['\"]better-sqlite3['\"]|from ['\"]fs['\"]|from ['\"]electron['\"]" app/
grep -rE "bun:" app/ --include="*.ts" --include="*.tsx"   # debe devolver 0 líneas

# Desarrollo
npm run electron:dev     # Vite dev server + Electron con hot reload
npm run dev              # Solo Vite en http://localhost:5173

# Build
npm run build            # Vite build → dist/
npm run electron:build   # Empaquetar app para distribución

# Testing
npm run test:db          # Test database
```

## Actualizaciones

Este directorio debe actualizarse cuando:
- Cambie el stack o las convenciones de arquitectura.
- Se agreguen nuevas features al proyecto.
- Cambien las mejores prácticas de Electron/React.
- Se encuentren errores comunes recurrentes (añádelos a la tabla de arriba).
