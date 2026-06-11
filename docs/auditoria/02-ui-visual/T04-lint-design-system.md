# T04 — Regla de lint que proteja el design system

**Prioridad**: P2 · **Severidad**: Media · **Esfuerzo**: S · **Área**: UI Visual
**Estado**: ✅ Implementada (verificada 2026-06-10) — `scripts/check-hardcoded-colors.mjs` con baseline ratchet en `scripts/baselines/` (279 hex actuales), registrado como `check:design-system` en `package.json` y ejecutándose en CI. Pasa en local: `OK (279/279)`. El ratchet pasará a cero-tolerancia al completar [T01](T01-colores-hardcodeados.md).

## Problema

Nada impide reintroducir colores hardcodeados: los 385 hex actuales (ver [T01](T01-colores-hardcodeados.md)) crecieron porque no hay guardarraíl. El CI ya tiene jobs de lint y checks custom (`.github/workflows/ci.yml`: `pnpm run lint`, `check:ipc-inventory`, etc.), así que el mecanismo para añadir uno más es conocido.

## Qué hay que hacer

1. **ESLint** (para `.tsx`/`.ts`): añadir una regla que detecte hex colors en strings de JSX/objetos de estilo. Opciones:
   - `no-restricted-syntax` con selector sobre literales que matcheen `/#[0-9a-fA-F]{3,8}\b/` en `JSXAttribute` y `Property[key.name=/color|background|border/i]`.
   - O un check script estilo los existentes: `scripts/check-hardcoded-colors.mjs` con grep + lista de archivos permitidos (`app/lib/ui/palettes.ts`, `app/globals.css`).
   La opción script es más simple y encaja con los `check:*` ya presentes — recomendada.
2. **CSS**: el mismo script cubre `app/styles/*.css` excluyendo definiciones de variables (`--foo: #…` en `globals.css`).
3. Lista de excepciones explícita en el script (paletas de contenido). Cada excepción nueva requiere tocar el script → revisión consciente.
4. Mientras dura la migración de T01: ejecutar el check en modo "ratchet" — falla solo si el conteo **sube** respecto a un baseline guardado (`scripts/baselines/hardcoded-colors.txt`). Al terminar T01, pasar a cero-tolerancia.
5. Registrar como `check:design-system` en `package.json` y añadirlo al job de CI.

## Criterios de aceptación

- [ ] `pnpm run check:design-system` existe y corre en CI.
- [ ] Añadir `style={{ color: '#ff0000' }}` en un componente hace fallar el check.
- [ ] Los archivos de paleta permitidos no disparan falsos positivos.

## Riesgos / notas

- El modo ratchet es clave: si el check llega antes de terminar T01 con cero-tolerancia, bloqueará PRs no relacionados.
