# Plan 029 — Settings: nueva arquitectura de información

**Estado:** DONE · **Prioridad:** P0 · **Esfuerzo:** XL  
**Commit auditado:** `b500063c` · **Depende de:** 024–027

## Objetivo

Reimplementar Settings de extremo a extremo, conservando claves, IPC y efectos existentes. Reducir 18 secciones y navegación anidada a siete grupos comprensibles, con formularios shadcn/Base UI consistentes.

## Drift check

Inventariar todos los archivos de `app/components/settings/**`, registros/rutas, eventos custom, claves i18n y accesos a settings. Comparar cada id/alias con el commit auditado antes de moverlo.

## IA destino

1. Cuenta
2. Apariencia e idioma
3. IA: modelos/proveedores, transcripción, embeddings, tools y contexto de agentes
4. Integraciones: Dome Sync, Cloud, Calendar, Email y Social
5. Automatización y extensiones: MCP, Dome MCP, Skills y Plugins
6. Datos y privacidad: indexación, knowledge model, analytics y experimental
7. Avanzado

Un registry tipado será la única fuente de verdad: `id`, `group`, `titleKey`, `descriptionKey`, `keywords`, `icon` Hugeicons, componente lazy y `legacyAliases`.

## Implementación

1. Añadir tests de caracterización de ids antiguos, aliases, búsqueda, deep links/eventos, lectura/escritura y estados de proveedores.
2. Crear layout con `Sidebar` local/`ScrollArea`, buscador `Command`, cabecera contextual y superficie de formulario; en estrecho usar `Sheet` para el índice.
3. Crear el registry y migrar el router actual sin romper URLs/eventos. Un alias antiguo debe resolver al nuevo id canónico.
4. Dividir god-components en controllers de datos y vistas por sección. Mantener side effects e IPC fuera de las composiciones de formulario.
5. Reimplementar formularios con `Field`, `FieldGroup`, `FieldSet`, `Label`, `Input`, `Textarea`, `Select`, `Combobox`, `Switch`, `RadioGroup`, `Slider`, `Alert` y `Button`.
6. Usar `CardHeader/CardContent/CardFooter` solo para agrupaciones semánticas; sustituir las 43 Cards sin header, 29 botones y 16 inputs crudos. Eliminar `space-x/y` e inline styles del área.
7. Aplicar la matriz de overlays: `Dialog` para editar credenciales/perfiles, `AlertDialog` para reset/desconectar, `Sheet` para detalle secundario y `Popover` para selectores pequeños.
8. Reagrupar las cinco tabs internas de AI bajo subsecciones del mismo grupo, con headings y anchors; evitar tabs dentro de tabs.
9. Completar traducciones en en/es/fr/pt y nombres accesibles. Nunca mostrar secretos completos ni incluirlos en logs/tests.

## Validación

- Tests parametrizados para cada entrada del registry y alias legacy.
- Tests de formularios: dirty state, submit, error, cancel, reset y foco.
- Playwright: buscar y abrir cada grupo; configurar un provider mock; navegación estrecha.
- Typecheck, lint, build, IPC inventory y depcruise.

## Criterios de aceptación

- Siete grupos visibles, registry único, cero switches de navegación duplicados.
- Cada setting actual sigue encontrable y conserva almacenamiento/efectos.
- Sin controles HTML crudos salvo necesidad semántica documentada; sin Lucide contracts.
- Responsive, teclado, lectores de pantalla y reduced motion cubiertos.

## STOP conditions

No renombrar claves persistidas, channels IPC ni eventos sin migración compatible. Detener si no puede mapearse una sección legacy de forma inequívoca.

## Mantenimiento

Añadir una comprobación de unicidad de ids/aliases y exigir registro + i18n + test para cualquier setting nuevo.
