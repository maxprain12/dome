# Flujo de Trabajo AI-First — Dome

## El principio central

**Solo hay un paso manual: escribir el prompt.**
El agente (Claude Code, Cursor, Copilot, etc.) ejecuta el protocolo de [AGENTS.md](../../AGENTS.md).

---

## Flujo completo

```
 [HUMANO] Escribes el prompt
     │
     │  "añade exportación a PDF para recursos"
     ▼
 [AGENTE] Lee AGENTS.md y ejecuta el protocolo
     │
     ├─ 1. git checkout -b feat/export-pdf
     ├─ 2. Implementa (P-001…P-010, i18n, CSS vars, IPC whitelist)
     ├─ 3. pnpm run typecheck && lint && build && check:ipc-inventory
     ├─ 4. gh pr create
     └─ 5. gh pr merge --auto --squash
               │
               ▼
 [CI — GitHub Actions] — workflow ci.yml
     ├─ TypeScript (tsc --noEmit)
     ├─ ESLint
     ├─ Vite build
     ├─ Architecture guard (imports prohibidos en app/)
     ├─ IPC inventory
     └─ dependency-cruiser
               │
               ▼ (cuando CI pasa)
 [AUTO-MERGE] — squash merge automático (si branch protection lo permite)
```

**No hay workflow de AI review en GitHub** (`.github/workflows/` solo incluye `ci.yml`, `build.yml`, `project-sync.yml`). La calidad en PR se apoya en CI + revisión humana opcional.

---

## Configuración única (maintainer)

### Branch protection en GitHub

`Settings → Branches → Add rule → Branch: main`

```
☑ Require status checks to pass:
    ✅ TypeScript
    ✅ Lint
    ✅ Vite Build
    ✅ Architecture Guard
    (y el resto de jobs de ci.yml según aparezcan en la UI)
☑ Require branches to be up to date
☑ Allow auto-merge (Settings → General → Allow auto-merge)
```

---

## Cómo darle una tarea al agente

### En Claude Code / Cursor / Windsurf

El agente lee `AGENTS.md` y `CLAUDE.md` en la raíz. Ejemplo de prompt:

```
"Añade soporte para exportar recursos como PDF.
 Los recursos de tipo nota y PDF deben poder exportarse.
 El botón debe estar en la barra de herramientas del viewer."
```

### El agente hará exactamente:

1. `git checkout -b feat/export-pdf`
2. Implementar IPC handler + UI + i18n (en, es, fr, pt)
3. `pnpm run typecheck && pnpm run lint && pnpm run build`
4. `gh pr create --title "feat: export resources as PDF"`
5. `gh pr merge --auto --squash`

---

## Archivos del sistema

```
dome/
├── AGENTS.md                    ← Protocolo para agentes
├── CLAUDE.md                    ← Contexto del proyecto
├── .claude/sops/                ← Checklists (IPC, PR, release, Drizzle…)
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/
│       ├── ci.yml               ← Checks en cada PR
│       ├── build.yml            ← Build empaquetado (releases)
│       └── project-sync.yml
└── docs/
    ├── principles.md            ← P-001…P-010
    └── architecture/            ← ADRs, IPC, agent runtime
```

---

## Preguntas frecuentes

**¿Qué pasa si el CI falla?**
El auto-merge no ocurre hasta que pasen los checks. El agente (o tú) corrige y empuja de nuevo.

**¿Dónde está la documentación de DB / Drizzle / workers?**
[features/database.md](database.md) y [ADR-0002](../architecture/decisions/0002-drizzle-incremental-migration.md).
