# Flujo de Trabajo AI-First — Dome

## El principio central

**Solo hay un paso manual: escribir el prompt.**
El agente (Claude Code, Cursor, Windsurf, etc.) se encarga de todo lo demás.

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
     ├─ 2. Implementa (respetando arch rules, i18n, CSS vars)
     ├─ 3. npm run typecheck && lint && build   (si falla → arregla)
     ├─ 4. gh pr create
     └─ 5. gh pr merge --auto --squash
               │
               ▼
 [CI AUTOMÁTICO] — ~3 min, en paralelo
     ├─ TypeScript: tsc --noEmit
     ├─ ESLint: eslint app/
     ├─ Vite Build
     └─ Architecture Guard: busca imports prohibidos en app/
               │
               ▼ (simultáneo al CI)
 [AI REVIEW AUTOMÁTICO] — ~2 min
     ├─ Pass 1: Arquitectura (separación renderer/main, IPC whitelist)
     ├─ Pass 2: Lógica (bugs, race conditions, error handling)
     └─ Pass 3: Estilo (colores, i18n, convenciones)
         → Comentario en el PR con los hallazgos
               │
               ▼ (cuando CI pasa)
 [AUTO-MERGE] — GitHub squash merge automático
```

---

## Lo que necesitas configurar una sola vez

### 1. Branch protection en GitHub

`Settings → Branches → Add rule → Branch: main`

```
☑ Require status checks to pass:
    ✅ TypeScript
    ✅ Lint
    ✅ Vite Build
    ✅ Architecture Guard
☑ Require branches to be up to date
☑ Allow auto-merge (habilitar en Settings → General → Allow auto-merge)
```

Esto hace que `gh pr merge --auto --squash` funcione: el PR se mergeará solo cuando el CI pase.

### 2. Secrets en GitHub (Settings → Secrets)

```
AI_REVIEW_API_KEY      → tu key de MiniMax / DeepSeek / OpenAI
AI_REVIEW_BASE_URL     → https://api.deepseek.com/v1  (o el tuyo)
AI_REVIEW_MODEL        → deepseek-chat  (o el tuyo)
```

### 3. Variables en GitHub (Settings → Variables)

```
AI_REVIEW_ENABLED = true
```

## Cómo darle una tarea al agente

### En Claude Code

```
"Añade soporte para exportar recursos como PDF.
 Los recursos de tipo nota y PDF deben poder exportarse.
 El botón debe estar en la barra de herramientas del viewer."
```

### En Cursor / Windsurf

El agente lee `AGENTS.md` automáticamente (está en la raíz). El mismo prompt funciona.

### El agente hará exactamente:

1. `git checkout -b feat/export-pdf`
2. Implementar el IPC handler + UI + i18n en los 4 idiomas
3. `npm run typecheck && npm run lint && npm run build`
4. `gh pr create --title "feat: export resources as PDF"`
5. `gh pr merge --auto --squash`

Tú recibes la notificación de GitHub cuando el PR se abre y otra cuando se mergea.

---

## Archivos del sistema

```
dome/
├── AGENTS.md                              ← Harness principal (agentes leen esto)
├── CLAUDE.md                              ← Contexto del proyecto (Claude Code)
├── .claude/sops/                          ← Guías paso a paso
│   ├── pr-checklist.md
│   ├── new-ipc-channel.md
│   ├── new-feature.md
│   └── release.md
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md           ← Template estándar de PR
│   └── workflows/
│       ├── ci.yml                         ← TypeScript + ESLint + Build + Arch guard
│       └── ai-review.yml                  ← 3-pass AI review en cada PR
└── scripts/
    └── ai-review.mjs                      ← Script de review (multi-provider)
```

---

## Preguntas frecuentes

**¿Qué pasa si el AI review encuentra un problema grave?**
El review es informativo (no bloquea el merge). Si el agente lo lee antes del auto-merge, puede arreglarlo. Si ya se mergeó, abre un issue y el pipeline lo trata como un bug fix normal.

**¿Puedo hacer que el AI review bloquee el merge?**
Sí: cambia el `event: 'COMMENT'` a `event: 'REQUEST_CHANGES'` en `scripts/ai-review.mjs`, y añade el check `AI Code Review` a los status checks requeridos en branch protection.
