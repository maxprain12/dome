# Dome - Reglas de Claude Code

## Descripción

Este directorio contiene las reglas y mejores prácticas para el desarrollo de Dome.

## Archivos de Reglas

### 1. `CLAUDE.md` (Raíz del proyecto)
Configuración específica de Bun para Claude Code.
- Usar Bun en lugar de Node.js
- Comandos de Bun
- APIs de Bun
- Testing con Bun
- Frontend con HTML imports

### 2. `electron-best-practices.md`
Guía completa de desarrollo Electron basada en las mejores prácticas de 2026.
- Arquitectura y procesos
- Seguridad
- Gestión de ventanas
- Comunicación IPC
- Gestión de memoria
- Patrones comunes

### 3. `dome-style-guide.md`
Guía de estilos específica del proyecto.
- Stack principal
- Reglas de código
- TypeScript best practices
- React components
- CSS Variables vs Tailwind
- Patrones específicos de Dome

### 4. `architecture-rules.md` ⚠️ **CRÍTICO**
Reglas de arquitectura que **NUNCA** deben romperse.
- Separación de procesos Electron
- Base de datos (SQLite)
- Operaciones de archivos
- Estructura de archivos
- Checklist pre-commit
- Testing de arquitectura
- Mensajes de error comunes

## Prioridad de Lectura

Para **nuevos desarrolladores** o **Claude Code**:

1. **PRIMERO**: `architecture-rules.md` 🚨
   - Crítico para entender la separación entre main/renderer
   - Evita errores comunes
   - Define qué código va dónde

2. **SEGUNDO**: `dome-style-guide.md`
   - Estilos de código
   - Convenciones del proyecto
   - Patrones específicos

3. **TERCERO**: `electron-best-practices.md`
   - Profundización en Electron
   - Patrones avanzados
   - Seguridad

4. **CUARTO**: `CLAUDE.md` (raíz)
   - Configuración de Bun
   - Comandos específicos

## Para Claude Code

Cuando Claude Code trabaja en este proyecto, debe:

1. **Siempre** verificar en qué proceso está trabajando:
   - `electron/` → Main Process → Puede usar Node.js/Bun APIs
   - `app/` → Renderer Process → Solo IPC, NO Node.js/Bun directo

2. **Antes de usar base de datos**:
   - ✅ En `electron/`: Usar `bun:sqlite` directamente
   - ✅ En `app/`: Usar `window.electron.db` vía IPC

3. **Antes de operaciones de archivos**:
   - ✅ En `electron/`: Usar `fs` directamente
   - ✅ En `app/`: Crear IPC handler en main process

4. **Validación**:
   - Siempre validar inputs en main process
   - Nunca confiar en datos del renderer

## Errores Comunes a Evitar

| Error | Archivo | Solución |
|-------|---------|----------|
| `existsSync is not a function` | `app/lib/db/sqlite.ts` | Eliminar archivo, usar IPC |
| `prepare is not a function` | `app/lib/db/sqlite.ts` | Usar `window.electron.db` |
| Importing `bun:sqlite` en renderer | `app/**/*.ts` | Mover a `electron/database.cjs` |
| Importing `node:fs` en renderer | `app/**/*.ts` | Crear IPC handler |

## Estructura Correcta

```
dome-local/
├── electron/                    # Main Process
│   ├── main.cjs                # ✅ IPC handlers, window management
│   ├── preload.cjs             # ✅ contextBridge, API exposure
│   ├── database.cjs            # ✅ SQLite operations
│   └── window-manager.cjs      # ✅ Window management
│
└── app/                         # Renderer Process
    ├── lib/
    │   ├── db/
    │   │   └── client.ts       # ✅ IPC client (NO sqlite directo)
    │   └── utils/              # ✅ Pure utilities
    └── components/             # ✅ React components
```

## Referencias Rápidas

### ¿Dónde va mi código?

```
┌─────────────────────────────────────────────────────────┐
│ ¿Necesitas acceso a Node.js/Bun APIs?                  │
│                                                         │
│ SÍ → electron/                                          │
│    ├─ Crear handler IPC en main.cjs                    │
│    ├─ Exponer en preload.cjs                           │
│    └─ Usar desde app/ vía window.electron              │
│                                                         │
│ NO → app/                                               │
│    ├─ Componentes React                                │
│    ├─ Estado (Zustand)                                 │
│    ├─ Utilidades puras                                 │
│    └─ Lógica de UI                                     │
└─────────────────────────────────────────────────────────┘
```

### Comandos Útiles

```bash
# Verificar que NO hay imports de Node.js en app/
grep -r "require('bun:sqlite')" app/
grep -r "require('node:fs')" app/
grep -r "from 'bun:sqlite'" app/

# Desarrollo
bun run dev              # Solo Next.js
bun run electron:dev     # App completa

# Testing
bun run test:db          # Test database
```

## Actualizaciones

Este directorio debe actualizarse cuando:
- Se descubra un nuevo patrón problemático
- Se agreguen nuevas features al proyecto
- Cambien las mejores prácticas de Electron/Next.js
- Se encuentren errores comunes recurrentes

---

**Última actualización:** 2026-01-17
