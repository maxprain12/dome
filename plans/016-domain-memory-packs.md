# Plan 016 — Packs de memoria de dominio (social + email)

**Estado:** DONE · **Prioridad:** P0 · **Esfuerzo:** M  
**Depende de:** 015

## Objetivo

Crear ficheros de memoria especializada bajo `martin/domains/` para **social** (crecimiento, SEO, influencer) y **email** (recordatorios, VIP, hilos), con seeds, edición en Settings y inyección condicionada por superficie/tools.

## Drift check

- Hoy solo `SOUL.md`, `USER.md`, `MEMORY.md`, `memory/YYYY-MM-DD.md`
- Skills bundled: commit-helper, source-synthesizer, study-planner — sin growth/email
- Agent Context UI: [`AgentContextSettingsTab.tsx`](../app/components/settings/ai/AgentContextSettingsTab.tsx)
- Prompts tools: [`packages/tools/src/domains/social/prompt.txt`](../packages/tools/src/domains/social/prompt.txt), [`email/prompt.txt`](../packages/tools/src/domains/email/prompt.txt)

## Datos destino

```
{userData}/martin/
  SOUL.md
  USER.md
  MEMORY.md
  memory/YYYY-MM-DD.md
  domains/
    social.md    # nicho, pilares, SEO social, tono, métricas, hashtags, audiencias
    email.md     # VIP, recordatorios, cadencias, hilos follow-up, firma/tono
```

### Seed `domains/social.md` (estructura)

- Niche & positioning
- Content pillars
- SEO / discovery tactics (hashtags, hooks, CTAs)
- Influencer tone & do/don't
- Growth targets & KPIs
- Winning patterns (facts que rellenará 017)

### Seed `domains/email.md`

- VIP contacts (refs a people ids cuando existan)
- Reminder style & SLA
- Open loops / follow-ups
- Tone & signature prefs

## Decisiones cerradas

- Seeds en `ensureDefaultFiles`; editables desde Agent Context (tabs Domain: Social / Email).
- Inyección: sección bajo `user-memory` solo si el run tiene tools social/email activos **o** la superficie activa es tab Social/Email.
- Skills bundled `social-growth` y `email-triage` (SKILL.md procedural) **complementan** LTM; no lo sustituyen. Apuntan a leer/actualizar domains vía remember_fact (017).

## Implementación

1. Extender `personality-loader`: paths domains, read/write, ensure defaults.
2. IPC: list/read/write domain files (whitelist nombres).
3. `context-files` / helper 015: `includeDomains: ('social'|'email')[]`.
4. Many + run-engine: pasar domains según tools/surface.
5. UI Agent Context: editores markdown para domains.
6. Bootstrap skills en [`electron/skills/bundled/`](../electron/skills/bundled/) + skills-bootstrap seed flag si aplica.
7. i18n labels Settings.

## Validación

- ensureDefaultFiles crea domains si faltan.
- Test inyección: sin tools social → sin social.md en prompt.
- Typecheck, IPC inventory.

## Criterios de aceptación

- Usuario puede editar social.md / email.md en Settings.
- Many en tab Social ve bloque domain social.
- Skills aparecen en `skills:list` tras bootstrap.

## STOP conditions

No meter playbooks enormes (> budget trim). Seeds cortos; hechos viven en headings `### key` como MEMORY.md.

## Mantenimiento

Nuevo dominio (p.ej. github) = archivo `domains/github.md` + flag include + seed + opcional skill.
