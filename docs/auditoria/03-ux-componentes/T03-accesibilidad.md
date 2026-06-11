# T03 — Accesibilidad: aria-labels, roles y focus

**Prioridad**: P2 · **Severidad**: Media · **Esfuerzo**: M · **Área**: UX Componentes

## Problema

Cobertura a11y estimada 60-70% (886 usos de `aria-*` en 238 archivos, 71 con keyboard nav), con huecos concretos:

1. **Icon-only buttons sin `aria-label`**: muchos botones de `tiptap-ui/` y usos de `DomeButton` con `iconOnly` no llevan label — fallo WCAG A.
2. **Divs clicables sin semántica**: `<div onClick…>` sin `role="button"`, `tabIndex={0}` ni manejo de Enter/Espacio (ej.: `MarkdownRenderer.tsx` con `onClickCapture`).
3. **Modales desiguales**: `Modal.tsx` y `DomeModal.tsx` tienen aria básico, pero los 10 modales ad-hoc no garantizan focus trap ni `aria-modal` (se resuelve con [T01](T01-consolidar-modales.md)).
4. **Focus visible**: hay 162 reglas `focus-visible` ✓, pero componentes antiguos carecen de ring.

## Qué hay que hacer

1. **DomeButton**: hacer el `aria-label` obligatorio cuando `iconOnly` — a nivel de tipos (union: si `iconOnly: true` entonces `'aria-label': string` requerido) y con warning en dev si falta.
2. **Barrido de icon-buttons**: `grep -rn "iconOnly" app/` + muestreo de `tiptap-ui/` y añadir labels traducidos (`t()`).
3. **Divs clicables**: regla ESLint `jsx-a11y/click-events-have-key-events` + `jsx-a11y/no-static-element-interactions` (añadir `eslint-plugin-jsx-a11y` si no está). Arreglar los hallazgos: o convertir a `<button>` o añadir role/tabIndex/onKeyDown.
4. **Activar el resto de `eslint-plugin-jsx-a11y` recomendado** en modo warning primero, triagear, y promover a error las reglas con 0 hallazgos restantes.
5. **Auditoría con axe**: pasar axe DevTools sobre las vistas principales (home, chat, settings, learn, viewers) en ambos temas y registrar/arreglar los hallazgos serios (contraste, labels de inputs).

## Criterios de aceptación

- [ ] `eslint-plugin-jsx-a11y` activo en CI sin errores.
- [ ] Ningún botón icon-only sin nombre accesible (verificable con axe).
- [ ] Divs interactivos navegables por teclado (Tab + Enter/Espacio).
- [ ] Informe axe de las 5 vistas principales sin violaciones críticas.

## Riesgos / notas

- El plugin a11y va a reportar mucho al activarse: usar modo warning + ratchet, igual que el check de colores ([02/T04](../02-ui-visual/T04-lint-design-system.md)).
- Los labels nuevos deben ir por i18n (4 idiomas).
