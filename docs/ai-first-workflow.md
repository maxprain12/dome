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
     ├─ 2. Crea flag: dome-export-pdf
     ├─ 3. Implementa (respetando arch rules, i18n, CSS vars)
     ├─ 4. npm run typecheck && lint && build   (si falla → arregla)
     ├─ 5. gh pr create --body "Flag: dome-export-pdf ..."
     └─ 6. gh pr merge --auto --squash
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
               │
               ▼
 [POST-MERGE AUTOMÁTICO]
     └─ Lee "Flag: dome-export-pdf" del PR
     └─ PostHog API: activa flag para usuarios donde dome_team=true
               │
               ▼
 [ROLLOUT — manual en PostHog dashboard]
     ├─ Día 1:  Solo el equipo interno ve la feature
     ├─ Día 2:  10% de usuarios
     ├─ Día 3:  25%
     ├─ Día 5:  50% → 100%
     └─ Kill switch: toggle flag OFF (instantáneo, sin deploy)
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
POSTHOG_PROJECT_API_KEY → Settings → Personal API keys en PostHog
POSTHOG_PROJECT_ID      → Settings → Project en PostHog
```

### 3. Variables en GitHub (Settings → Variables)

```
AI_REVIEW_ENABLED = true
```

### 4. Propiedad `dome_team` en PostHog

Para que el post-merge active el flag solo para el equipo interno, identifica a los usuarios internos en PostHog:

```typescript
// En el app (cuando el usuario inicia sesión)
import { identifyPostHog } from '@/lib/analytics';

identifyPostHog(userId, {
  dome_team: true,  // ← solo para cuentas internas
  email: userEmail,
});
```

---

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
2. Crear `dome-export-pdf` flag en código
3. Implementar el IPC handler + UI + i18n en los 4 idiomas
4. `npm run typecheck && npm run lint && npm run build`
5. `gh pr create --title "feat: export resources as PDF" --body "Flag: dome-export-pdf ..."`
6. `gh pr merge --auto --squash`

Tú recibes la notificación de GitHub cuando el PR se abre y otra cuando se mergea.

---

## Monitoreo

### Durante rollout


| Qué ver                         | Dónde                                       |
| ------------------------------- | ------------------------------------------- |
| Cuántos usuarios ven la feature | PostHog → Feature Flags → `dome-export-pdf` |
| Eventos de uso                  | PostHog → Events                            |
| Errores en producción           | PostHog → `$exception` events               |
| Revenue / quota                 | dome-provider `/admin`                      |


### Si algo falla

1. **PostHog dashboard → Feature Flag → Toggle OFF** — la feature desaparece para todos en segundos, sin deploy
2. Abre un issue con los logs
3. El agente recibe el issue como nuevo prompt → fix → nuevo PR → pipeline automático

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
│   ├── feature-flags.md
│   └── release.md
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md           ← Template con campo Flag:
│   └── workflows/
│       ├── ci.yml                         ← TypeScript + ESLint + Build + Arch guard
│       ├── ai-review.yml                  ← 3-pass AI review en cada PR
│       └── post-merge.yml                 ← Activa flag en PostHog al mergear
└── scripts/
    ├── ai-review.mjs                      ← Script de review (multi-provider)
    └── posthog-flag.mjs                   ← Script de PostHog API
```

---

## Preguntas frecuentes

**¿Qué pasa si el AI review encuentra un problema grave?**
El review es informativo (no bloquea el merge). Si el agente lo lee antes del auto-merge, puede arreglarlo. Si ya se mergeó, abre un issue y el pipeline lo trata como un bug fix normal.

**¿Puedo hacer que el AI review bloquee el merge?**
Sí: cambia el `event: 'COMMENT'` a `event: 'REQUEST_CHANGES'` en `scripts/ai-review.mjs`, y añade el check `AI Code Review` a los status checks requeridos en branch protection.

**¿Qué pasa si una feature no necesita flag?**
Escribe `Flag: none` en el PR. El post-merge workflow lo detecta y no llama a PostHog.

**¿Cómo hago rollout gradual después del merge?**
PostHog Dashboard → Feature Flags → `dome-xxx` → Edit → añade grupos de porcentaje. El post-merge solo activa para `dome_team=true`. El resto del rollout es manual en PostHog (2 clics).

**¿Cómo pruebo el script de PostHog localmente?**

```bash
POSTHOG_PROJECT_API_KEY=phx_xxx \
POSTHOG_PROJECT_ID=12345 \
FLAG_NAME=dome-test-flag \
node scripts/posthog-flag.mjs
```

