# T05 — Cobertura i18n al 100%

**Prioridad**: P3 · **Severidad**: Baja · **Esfuerzo**: S · **Área**: UI Visual
**Estado**: ✅ Implementada (2026-06-10) — badges de `ResourceCard` (`Pending/Processing/Failed`) ahora usan `t('home.status_*')` con claves añadidas en los 4 idiomas (`packages/i18n/locales/{en,es,fr,pt}/home.json`). `NoteEmptyState` verificado: ya estaba 100% traducido. El footer "Made with ❤️" del sidebar se mantiene como marca personal (excepción consciente). El check de claves (punto 5, opcional) no se implementó.

## Problema

La cobertura i18n es excelente (~4.428 usos de `t()` en `app/components`), pero quedan strings de UI fuera:

1. `app/components/home/ResourceCard.tsx` — badges de estado: `'Pending'`, `'Processing'`, `'Failed'`.
2. `app/components/notes/NoteEmptyState.tsx` — posible label en inglés (verificar).
3. `app/components/workspace/UnifiedSidebar.tsx` — "Made with ❤️ by Alder and Mery" (footer; probablemente intencional, decidir si se traduce).

## Qué hay que hacer

1. Envolver los badges de estado de `ResourceCard.tsx` en `t()` con claves nuevas (p. ej. `resource.status.pending|processing|failed`) y añadirlas **a los cuatro idiomas** en `app/lib/i18n.ts` (en/es/fr/pt) — regla del repo.
2. Verificar y corregir `NoteEmptyState.tsx`.
3. Decidir el footer del sidebar: si es marca personal, dejarlo y anotarlo como excepción consciente.
4. Barrido final para confirmar que no hay más: buscar texto literal en JSX con `grep -rn '>[A-Z][a-z].*<' app/components --include='*.tsx'` y muestrear resultados (habrá falsos positivos; es un barrido manual corto).
5. Opcional (si se quiere guardarraíl): script `check:i18n-keys` que verifique que toda clave usada en `t('…')` existe en los 4 idiomas — los typos de clave hoy fallan silenciosamente mostrando la clave cruda.

## Criterios de aceptación

- [ ] Los estados de recurso se muestran traducidos en es/fr/pt.
- [ ] Las claves nuevas existen en los 4 objetos de idioma de `app/lib/i18n.ts`.
- [ ] (Opcional) check de claves i18n en CI.

## Riesgos / notas

- Trivial. El valor real está en el punto 5 si se decide hacerlo.
