# T03 — Eliminar paleta deprecada y alinear la documentación

**Prioridad**: P2 · **Severidad**: Baja · **Esfuerzo**: S · **Área**: UI Visual
**Estado**: ✅ Implementada (2026-06-10) — mapeos `--brand-*` eliminados de `globals.css`, consumidores migrados a `var(--accent)`/`var(--secondary)`, y `.claude/rules/ui-style-guidelines.md` actualizado: la sección de colores ahora remite a `new-color-palette.md`/`globals.css` como fuente de verdad, con la tabla de uso y los ejemplos de componentes migrados a las variables vigentes. Nota: el alias `--tertiary: var(--tertiary-text)` se mantiene deliberadamente (compatibilidad con CSS legacy que lo referencia); eliminarlo requiere un grep+migración aparte de bajo valor.

## Problema

Conviven dos convenciones de paleta:

- **Nueva** (`.claude/rules/new-color-palette.md`): `--primary-text`, `--secondary-text`, `--tertiary-text`, `--accent`, `--bg*`.
- **Vieja** (`.claude/rules/ui-style-guidelines.md`): `--brand-primary` (#0ea5e9 sky blue), `--brand-secondary`, `--primary` como texto — valores que ya no coinciden con la app real.

En `app/globals.css:262-263` quedan mapeos puente:

```css
--tertiary: var(--tertiary-text);
--brand-accent: var(--accent);
--brand-secondary: var(--secondary);
```

Nadie usa `--brand-*` directamente (0 usos en componentes), pero la duplicación confunde a desarrolladores y a agentes de IA que leen ambas guías.

## Qué hay que hacer

1. Confirmar 0 usos: `grep -rn "brand-primary\|brand-secondary\|brand-accent" app/ --include='*.tsx' --include='*.ts' --include='*.css'` (excluir globals.css).
2. Eliminar los mapeos `--brand-*` y `--tertiary` legacy de `globals.css` (dejar solo la paleta nueva). Si algo se rompe, el grep del paso 1 estaba incompleto — arreglar el consumidor, no restaurar el alias.
3. Actualizar `.claude/rules/ui-style-guidelines.md`: reemplazar la sección "Color System" por una referencia a `new-color-palette.md` y a los valores reales de `globals.css` (los hex de ese doc — #0ea5e9 etc. — ya no existen en la app). Mantener lo que sigue vigente (spacing, tipografía, z-index, transiciones) verificándolo contra `globals.css`.
4. Documentar en `new-color-palette.md` las variables semánticas añadidas en [T02](T02-dark-mode-roto.md) (`--success/--error/--warning/--info`) y las de overlay de [T01](T01-colores-hardcodeados.md).

## Criterios de aceptación

- [ ] `globals.css` no define `--brand-*`.
- [ ] `ui-style-guidelines.md` no contradice a `new-color-palette.md` (una sola fuente de verdad para colores).
- [ ] La app se ve igual antes y después (cambio sin efecto visual).

## Riesgos / notas

- Hacerla después de T01/T02 para no documentar dos veces.
