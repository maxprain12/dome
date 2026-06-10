# T05 — Unificar botones: Mantine Button → DomeButton

**Prioridad**: P2 · **Severidad**: Baja · **Esfuerzo**: M · **Área**: UX Componentes

## Problema

Conviven tres formas de hacer un botón:

1. `app/components/ui/DomeButton.tsx` (107 líneas) — el componente unificado del design system, con variantes y loading state.
2. `Button` de `@mantine/core` importado directamente en varios componentes.
3. `<button>` crudo con clases `.btn .btn-primary` o estilos inline.

Resultado: alturas, paddings, focos y estados hover distintos entre vistas; cambiar el estilo de botón no tiene un único punto.

## Qué hay que hacer

1. Inventario: `grep -rn "from '@mantine/core'" app/ | grep -i button` y `grep -rn "className=\"btn" app/` — listar los archivos y agrupar por feature.
2. Verificar que `DomeButton` cubre los casos usados de Mantine (size, variant, leftSection/icon, loading, disabled, fullWidth). Añadir las props que falten antes de migrar.
3. Migrar por feature (un PR por área: settings, marketplace, agents, learn…): sustituir `Button` de Mantine y `<button class="btn …">` por `DomeButton` con la variante equivalente.
4. Mantener `<button>` crudo solo para casos no-botón-de-acción (resets de listas, wrappers), siempre con clase del design system.
5. Añadir al check de design system ([02/T04](../02-ui-visual/T04-lint-design-system.md)) o a ESLint `no-restricted-imports` la prohibición de `Button` desde `@mantine/core` (con excepciones listadas si algún caso Mantine-interno lo exige, p. ej. dentro de `Modal` de Mantine).

## Criterios de aceptación

- [ ] `grep` de imports de Mantine Button devuelve 0 (o solo excepciones documentadas).
- [ ] Revisión visual: botones consistentes en settings, marketplace, agents y learn en ambos temas.
- [ ] Regla de lint que evita reintroducirlo.

## Riesgos / notas

- Mecánica pero extensa; ideal para hacerla al hilo de los refactors de [T02](T02-refactor-componentes-gigantes.md) cuando se toque cada archivo.
