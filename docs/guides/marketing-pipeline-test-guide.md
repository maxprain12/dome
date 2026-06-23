# Guía de prueba del pipeline de Marketing

Esta guía te permite **simular y validar manualmente** el flujo completo de un pipeline de marketing dentro de Dome, extremo a extremo. Incluye un ejemplo detallado con datos concretos para cada tarjeta.

> **Idioma:** la app arranca por defecto en español (`es`). Si tu UI está en otro idioma, cambia a `es` en Ajustes antes de empezar.
>
> **Requisitos previos:**
> - Dome instalado y ejecutándose (`pnpm run electron:dev`).
> - Al menos **un agente** creado en *Agentes* y un proveedor/modelo configurado en *Ajustes → IA*.
> - Conexión a GitHub opcional (solo si quieres probar los filtros de ordenación en Seguimiento).

---

## 1. Crear el pipeline de marketing

Abre **Pipelines** desde la barra lateral y crea un pipeline con 5 fases representando el embudo comercial:

```
Nuevo Lead → Contactado → Propuesta → Negociación → Ganado/Perdido
```

### Pasos

1. Abre **Pipelines** desde la barra lateral.
2. Si no hay pipelines, verás el dashboard con KPIs y plantillas. Pulsa **Nuevo pipeline**.
3. Nómbralo **Pipeline de Marketing — QA**.
4. Crea las 6 fases (en orden). Para cada una pulsa **+ Fase** en el kanban:

   | # | Fase | Política de ejecución | Agente asignado |
   |---|------|----------------------|-----------------|
   | 1 | Nuevo Lead | Agente automático | `Ventas Bot` |
   | 2 | Contactado | Agente manual | `Ventas Bot` |
   | 3 | Propuesta | Agente automático | `Ventas Bot` |
   | 4 | Negociación | Agente manual | `Ventas Bot` |
   | 5 | Ganado | Manual (sin agente) | — |
   | 6 | Perdido | Manual (sin agente) | — |

   Para configurar cada fase: pulsa el icono de engranaje (⚙) en la cabecera de la columna → selecciona agente + política + plantilla de prompt → Guardar.

5. Marca **Ganado** y **Perdido** como *Fase final* (toggle en la configuración de la fase).

### Plantilla de prompt sugerida para todas las fases con agente

```
Eres un agente comercial experto. Procesa este lead del pipeline:

Título: {{title}}
Descripción: {{data.text}}
Tareas pendientes: {{data.todos}}

Analiza el estado del lead y redacta el siguiente paso recomendado.
```

### Validación

- [ ] Las 6 columnas aparecen de izquierda a derecha en el orden correcto.
- [ ] Ganado y Perdido muestran el indicador de fase final.
- [ ] Las fases 1-4 muestran el nombre del agente asignado en la cabecera.

---

## 2. El modal de tarjeta — Form builder con "+"

El modal de detalle de cada tarjeta funciona como un **formulario dinámico**. En vez de un selector fijo de tipo de contenido, tienes un **botón "+ Añadir campo"** que abre un menú con 3 tipos de campo:

| Tipo | Icono | Descripción |
|------|-------|-------------|
| **Descripción** | `FileText` | Texto en Markdown GFM con modo Ver/Editar |
| **Lista de tareas** | `CheckSquare` | Checklist con checkboxes editables |
| **Nota** | `StickyNote` | Texto plano simple |

Puedes añadir **tantos campos como quieras** de cualquier tipo. La tarjeta es una ficha que vas rellenando.

### Cómo añadir un campo

1. Abre una tarjeta (pulsa sobre ella en el kanban).
2. Pulsa el botón **"+ Añadir campo"** (outline, con icono `+`).
3. Se despliega un menú (`DomeContextMenu`) con las 3 opciones.
4.Selecciona una → el campo aparece inline con su editor.
5. Rellena el campo.
6. Repite para añadir más campos.
7. Pulsa **Guardar**.

### Cómo eliminar un campo

- Cada campo tiene un botón **✕** en su esquina superior derecha.
- Al pulsarlo, el campo se elimina del formulario.

### Modo Ver/Editar en descripciones

- Cada campo de tipo **Descripción** tiene un toggle **Editar/Ver** (iconos `Pencil`/`Eye`).
- En modo **Ver**, el Markdown se renderiza con formato (tablas, listas, código, negrita, enlaces).
- En modo **Editar**, ves el Markdown en bruto en un textarea.

### Validación

- [ ] El botón "+" abre el menú **por encima** del modal (no se ve cortado).
- [ ] Añadir 3 campos de tipos distintos y guardar → al reabrir, los 3 campos están ahí.
- [ ] Eliminar un campo y guardar → al reabrir, el campo ya no está.
- [ ] El modo Ver renderiza Markdown correctamente (tablas, listas, código).
- [ ] **Nunca** se muestra JSON crudo en el modal.

---

## 3. Tareas (checklist)

Los campos de tipo **Lista de tareas** tienen:

- **Checkbox** (izquierda): pulsa para marcar/desmarcar. Hecha = tachada + atenuada.
- **Input de texto**: el título de la tarea. Editable en todo momento.
- **Botón ✕**: elimina la tarea.
- **Botón "+ Añadir tarea"**: añade una nueva fila vacía al final.

### En el run input

El runner interpola `{{data.todos}}` como una checklist legible:

```
[x] Llamada de descubrimiento
[ ] Enviar propuesta
[ ] Agendar demo
```

El agente recibe esto como parte del prompt y puede razonar sobre qué falta por hacer.

### Validación

- [ ] Marcar 2 de 4 tareas y guardar → al reabrir, las 2 siguen marcadas.
- [ ] El snippet del kanban muestra "2/4" en el badge de tareas.
- [ ] Una plantilla con `{{data.todos}}` recibe las tareas formateadas (ver output del run).

---

## 4. Ejecutar tarjetas — manual vs automática

### Ejecución automática (fases 1, 3)

1. Arrastra una tarjeta a **Nuevo Lead** o **Propuesta**.
2. Al **soltar**, el run arranca solo.
3. La tarjeta cambia a estado *En ejecución* (spinner + badge).
4. Al terminar, pasa a *Lista* (verde) o *Error* (rojo).

### Ejecución manual (fases 2, 4)

1. Arrastra una tarjeta a **Contactado** o **Negociación**.
2. Abre la tarjeta → el botón **Ejecutar** aparece en el pie del modal.
3. Pulsa **Ejecutar** → el run arranca.

### Fases sin agente (5, 6)

- **Ganado** y **Perdido** no tienen agente → no hay botón *Ejecutar*.
- Son fases de cierre manual: el usuario decide cuándo mover ahí.

### Validación

- [ ] Arrastrar a *Nuevo Lead* dispara el run automáticamente.
- [ ] Arrastrar a *Contactado* **no** ejecuta hasta pulsar *Ejecutar*.
- [ ] El badge de la tarjeta cambia: Pendiente → En ejecución → Lista/Error.
- [ ] En *Ganado*/*Perdido* no aparece el botón *Ejecutar*.

---

## 5. Activity feed (pestaña Actividad)

El modal de la tarjeta tiene dos pestañas: **Detalles** y **Actividad** (via `DomeSegmentedControl`).

La pestaña **Actividad** muestra el historial de eventos de la tarjeta, cargados desde `pipeline_item_events`:

| Evento | Icono | Color | Disparador |
|--------|-------|-------|------------|
| `card_created` | `Plus` | Accent | Al crear la tarjeta |
| `card_moved` | `ArrowRightLeft` | Secondary | Al mover entre fases |
| `run_started` | `Play` | Accent | Al iniciar un run |
| `run_completed` | `CheckCircle2` | Success | Run terminado OK |
| `run_failed` | `XCircle` | Error | Run terminado con error |
| `auto_advanced` | `ChevronRight` | Secondary | Auto-avance de fase |
| `report_generated` | `FileText` | Accent | Al generar un informe |

Cada evento muestra: icono, summary, actor (si no es system/user) y timestamp.

### Validación

- [ ] Crear una tarjeta → aparece `card_created` en la pestaña Actividad.
- [ ] Mover la tarjeta → aparece `card_moved` con el nombre de la fase destino.
- [ ] Ejecutar un run → aparecen `run_started` y `run_completed` (o `run_failed`).
- [ ] Generar un informe → aparece `report_generated`.
- [ ] Los eventos están en orden cronológico.

---

## 6. Leer resultados — output en tarjeta y modal

### En el kanban (vista compacta)

Cada tarjeta muestra **datos enriquecidos** en el kanban:

- **Badge de tareas**: `CheckSquare 2/4` (si hay tareas).
- **Nombre del agente**: junto al icono de tipo de asignación.
- **Snippet del último output**: 1 línea truncada (~60 chars) cuando el estado es *Lista* o *Error*.
- **Preview de descripción**: primera línea de `data.text` en color muted.

### En el modal de detalle

- **Pestaña Detalles**: muestra el último output completo en una caja scrollable.
- **Pestaña Actividad**: history feed completo.

### Validación

- [ ] Tras un run, el snippet aparece en la tarjeta del kanban.
- [ ] El modal muestra el output completo en *Detalles*.
- [ ] Si el run falla, el output contiene el mensaje de error.

---

## 7. Generar informe (artefacto persistente)

El botón **Generar informe** (icono `FileText`) en el pie del modal hace lo siguiente:

1. Guarda los datos actuales de la tarjeta.
2. Construye un **HTML profesional** con todos los datos (título, fase, campos, tareas, output).
3. Crea un **artefacto persistente** vía `window.electron.artifacts.create()` → aparece en la barra lateral → Artefactos.
4. Loggea un evento `report_generated` en el activity feed.
5. Muestra un **progreso visual** (spinner + "Generando informe...") mientras se crea.
6. Toast de éxito al terminar.
7. Cierra el modal.

### Validación

- [ ] Al pulsar *Generar informe*, aparece el spinner de progreso.
- [ ] Al terminar, el toast dice "Informe generado y guardado como artefacto".
- [ ] El artefacto aparece en la **barra lateral → Artefactos**.
- [ ] El artefacto **persiste** tras cerrar y reabrir Dome.
- [ ] El contenido del artefacto refleja: título, fase, descripción, tareas, output.
- [ ] El activity feed muestra `report_generated`.

---

## 8. Exportar artefactos a HTML

Los artefactos (persistente y los del chat) se pueden exportar a archivo `.html` autocontenido:

### Artefactos persistentes (barra lateral)

1. Abre un artefacto desde la barra lateral.
2. En la toolbar del workspace, pulsa **Export HTML** (icono `FileDown`).
3. Dialogo de guardado del SO → elige destino → guarda.
4. El `.html` es autocontenido (estilos inline, sin dependencias externas).

### Artefactos del chat

1. En un artefacto del chat de tipo `html`, pulsa **Export HTML** en la cabecera.
2. Descarga client-side (Blob) → archivo `.html`.

### Validación

- [ ] El `.html` se abre en un navegador sin conexión.
- [ ] El contenido coincide con el artefacto visto en Dome.
- [ ] Los estilos (tema oscuro) se ven correctamente.

---

## 9. Filtros de ordenación

Las vistas **Kanban** y **Minimal** del Seguimiento GitHub tienen dos botones icon-only (`ArrowDownUp`) con menú desplegable:

### Ordenar columnas (milestones)

| Opción | Descripción |
|--------|-------------|
| Más reciente primero | Milestones con número más alto primero |
| Más antiguo primero | Milestones con número más bajo primero (orden GitHub por defecto) |
| Por fecha límite | Por `due_on` ascendente (sin fecha al final) |
| Por estado (abiertos primero) | Open antes que closed |

### Ordenar tarjetas (issues)

| Opción | Descripción |
|--------|-------------|
| Más reciente primero | Issues con número más alto primero |
| Más antiguo primero | Issues con número más bajo primero |
| Por estado (abiertos primero) | Open antes que closed |

### Persistencia

El estado de los filtros se guarda en `localStorage` (`dome:github:sort`). Sobrevive:
- Cambios de pestaña (Minimal ↔ Kanban).
- Cerrar y reabrir la app.
- Abrir/cerrar modales.

### Validación

- [ ] Cambiar el orden de columnas reordena el kanban inmediatamente.
- [ ] Cambiar el orden de tarjetas reordena dentro de cada columna.
- [ ] Cambiar de Minimal a Kanban conserva la selección.
- [ ] Cerrar y reabrir la app conserva la selección.

---

## 10. Scroll horizontal con rueda en kanbans

Los kanbans (Pipelines y Seguimiento GitHub) soportan **scroll horizontal con la rueda del ratón**:

- Gira la rueda vertical → las columnas se desplazan horizontalmente.
- Si el cursor está sobre una columna con scroll vertical propio (lista de tarjetas), la rueda vertical se respeta hasta llegar al borde.
- También funciona arrastrando (click + drag horizontal).

### Validación

- [ ] En el kanban de Pipelines, girar la rueda desplaza las columnas horizontalmente.
- [ ] Sobre una columna con muchas tarjetas, la rueda hace scroll vertical primero.
- [ ] Al llegar al borde vertical de la columna, la rueda pasa a desplazar horizontalmente.

---

## 11. Markdown en descripciones

Los campos de tipo **Descripción** admiten **GitHub Flavored Markdown (GFM)**:

| Sintaxis | Resultado |
|----------|-----------|
| `**negrita**` | **negrita** |
| `*cursiva*` | *cursiva* |
| `~~tachado~~` | ~~tachado~~ |
| `` `código` `` | `código` |
| `[enlace](https://...)` | enlace clickeable |
| `- item` / `1. item` | listas |
| `\| tabla \|` | tabla GFM |
| ` ```bash ... ``` ` | bloque de código |

En modo **Ver** (icono `Eye`), el Markdown se renderiza con formato. En modo **Editar** (icono `Pencil`), se ve el Markdown en bruto.

### Validación

- [ ] Crea una Descripción con tabla + lista + código + negrita + enlace.
- [ ] Cambia a modo Ver → se renderiza con formato.
- [ ] Vuelve a modo Editar → se ve el Markdown en bruto, editable.
- [ ] Tras guardar y reabrir, el Markdown se mantiene.

---

## 12. Ejemplo detallado — Lead "Acme Corp"

A continuación, un ejemplo completo de una tarjeta con todos los campos rellenos para simular un lead real de marketing.

### Fase 1: Nuevo Lead

Crea una tarjeta en **Nuevo Lead** con:

- **Título**: `Lead — Acme Corp`

Añade los siguientes campos con el botón "+":

#### Campo 1: Descripción

```markdown
# Acme Corp

**Empresa:** Acme Corporation
**Industria:** Logística y transporte
**Tamaño:** 200-500 empleados
**Ubicación:** Madrid, España
**Origen del lead:** Landing page (campaña Google Ads)

## Resumen

Acme Corp llegó vía la campaña de Google Ads "Gestión de flotas". El formulario
de la landing capturó su email corporativo. El lead es **hot**: visitó 3 páginas
de pricing y descargó el PDF de comparativa.

## Contacto

- **Nombre:** Laura García (Head of Operations)
- **Email:** laura.garcia@acme.com
- **Teléfono:** +34 600 123 456
- **LinkedIn:** [linkedin.com/in/lauragarcia](https://linkedin.com/in/lauragarcia)

## Pain points detectados

1. **Costes de combustible** sin visibilidad por vehículo
2. **Mantenimiento reactiva** en vez de preventivo
3. **Falta de reportes** en tiempo real para dirección
4. **Integración** con su ERP actual (SAP)

## Presupuesto estimado

| Concepto | Estimación |
|----------|------------|
| Licencias (25 vehículos) | 750 €/mes |
| Implementación | 3.000 € (one-time) |
| Formación | 500 € |
| **Total primer año** | **12.500 €** |
```

#### Campo 2: Lista de tareas

- [x] Llamada de descubrimiento (30 min) — 23 jun
- [x] Envío de dossier corporativo
- [ ] Agendar demo del producto (sugerido: 28 jun)
- [ ] Enviar caso de éxito de cliente similar (LogiTrans)
- [ ] Preparar propuesta personalizada
- [ ] Segundo follow-up si no responde en 5 días

#### Campo 3: Nota

```
Laura mencionó que su CFO es el decisor final. Presentar ROI
clara en la propuesta. También le interesa la integración con SAP
—destacar que tenemos conector nativo.
```

#### Fechas

- **Fecha inicio:** 2026-06-23
- **Fecha fin:** 2026-07-15 (deadline para propuesta)

### Ejecución

Arrastra la tarjeta a **Contactado** (manual) → abre el modal → pulsa **Ejecutar**.

El agente recibe el prompt con todo el contexto (descripción, tareas, notas) y devuelve un análisis del lead + siguiente paso recomendado.

### Fase 2: Contactado → Propuesta

Tras el run en *Contactado*, arrastra la tarjeta a **Propuesta** (automático). El agente recibe el output del run anterior + los campos actualizados.

Actualiza el campo de tareas:
- [x] Llamada de descubrimiento
- [x] Envío de dossier
- [x] Agendar demo
- [ ] Enviar caso de éxito
- [ ] Preparar propuesta personalizada
- [x] Segundo follow-up

Añade un nuevo campo de tipo **Descripción**:

```markdown
## Resultado de la demo (28 jun)

Laura quedó impresionada con:
- Dashboard de combustible en tiempo real
- Alertas de mantenimiento predictivo
- Conector SAP (demostrado en vivo)

**Preocupación:** precio. Pidió descuento por anualidad.
**Decisión:** la revisa con su CFO la semana del 1 jul.
```

### Fase 3: Negociación

Arrastra a **Negociación** (manual) → Ejecutar.

Añade una **Nota**:

```
CFO pidió rebajar el total a 10.000 €/año. Contraoferta:
11.000 € con formación incluida (en vez de 500 € aparte).
Esperan respuesta antes del 10 jul.
```

### Fase 4: Ganado

Arrastra a **Ganado** (sin agente — cierre manual).

### Generar informe

Abre la tarjeta desde **Ganado** → pulsa **Generar informe**.

Se crea un artefacto persistente con:
- Header: "Lead — Acme Corp · Ganado"
- Descripción completa (markdown renderizado)
- Checklist de tareas (con estado final)
- Notas
- Output del último run
- Fecha de generación

### Exportar a HTML

Abre el artefacto desde la barra lateral → **Export HTML** → guarda como `acme-corp-reporte.html`.

---

## 13. Checklist de validación final

Recorre esta checklist para certificar que todo el flujo funciona:

### Setup
- [ ] Pipeline creado con 6 fases en orden.
- [ ] Ganado/Perdido marcadas como fase final.
- [ ] Fases 1-4 con agente asignado y plantilla de prompt.

### Form builder
- [ ] El botón "+" abre el menú por encima del modal (z-index correcto).
- [ ] Añadir campo de tipo Descripción → modo Ver renderiza Markdown.
- [ ] Añadir campo de tipo Tareas → checkboxes funcionan.
- [ ] Añadir campo de tipo Nota → texto plano.
- [ ] Eliminar un campo con ✕ y guardar → desaparece.
- [ ] **Nunca** se ve JSON crudo.

### Ejecución
- [ ] Arrastrar a fase automática dispara run al soltar.
- [ ] Arrastrar a fase manual no ejecuta hasta pulsar *Ejecutar*.
- [ ] Badge cambia: Pendiente → En ejecución → Lista/Error.
- [ ] Snippet del output aparece en la tarjeta del kanban.

### Activity feed
- [ ] Eventos: `card_created`, `card_moved`, `run_started`, `run_completed`.
- [ ] Eventos en orden cronológico.
- [ ] `report_generated` aparece tras generar informe.

### Informe + export
- [ ] Botón *Generar informe* muestra progreso visual (spinner).
- [ ] Toast de éxito al terminar.
- [ ] Artefacto aparece en barra lateral → Artefactos.
- [ ] Artefacto persiste tras reiniciar la app.
- [ ] Export HTML genera `.html` autocontenido.

### Ordenación
- [ ] Botones icon-only de ordenación en Kanban y Minimal.
- [ ] Cambiar orden reordena inmediatamente.
- [ ] La selección persiste al cambiar de vista y reiniciar.

### Scroll
- [ ] Rueda del ratón desplaza el kanban horizontalmente.
- [ ] Respeta el scroll vertical de las columnas.

### Ejemplo Acme Corp
- [ ] Lead "Acme Corp" creado con Descripción + Tareas + Nota.
- [ ] Markdown con tabla, listas, código y enlaces renderizado correctamente.
- [ ] Tarjeta movida por todas las fases hasta Ganado.
- [ ] Informe generado con todos los datos del lead.
- [ ] Informe exportado a HTML y abierto en navegador.

---

> Si algo falla: abre un issue con el bloque de la checklist que no pasa, adjunta el log del run (pestaña Actividad → ver output) y screenshot del estado de la tarjeta.