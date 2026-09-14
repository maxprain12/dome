# Miniapps personales

Los artefactos son pequeñas aplicaciones guardadas en la biblioteca: trackers, calculadoras, infografías interactivas, dashboards, sinópticos con KPIs u otras experiencias creadas para una tarea. Las ideas iniciales son editables y no limitan el tipo de aplicación.

En el menú de creación, **Nueva miniapp** abre un espacio para describir la idea. **Continuar con Many** la lleva al chat como borrador; permite adjuntar datos y ajustar la petición antes de enviarla. Many crea la aplicación con `artifact_create` y entrega su enlace de recurso. No se crea un artefacto vacío al abrir el selector.

Desde una aplicación guardada, **Personalizar con Many** añade el artefacto al contexto del chat y abre un borrador. Many debe leerlo y modificarlo con `artifact_update_state`, conservando el identificador y los datos que no se hayan solicitado cambiar. La vista **Aplicación** contiene la experiencia interactiva; siguen disponibles el código, los datos y la exportación. Las modificaciones pendientes del editor deben guardarse o descartarse antes de personalizar con Many.

El contrato admite HTML funcional, CSS separado y datos JSON. Las miniapps leen `window.DOME_DATA`, guardan cambios con `window.__dome_updateState(nextData)` y actualizan la vista mediante `window.dome_onDataRefresh(next)`. Se ejecutan dentro del iframe aislado existente. Many debe crear controles operativos, formularios etiquetados, navegación por teclado, estados vacíos y diseños adaptables. Los indicadores deben derivarse de datos identificables; una representación de un proceso no implica acceso a equipos reales.

Markdown queda disponible para documentos estáticos solicitados explícitamente. Un documento existente puede convertirse en miniapp mediante `artifact_update_state` con `artifact_type: "custom"`, HTML completo y la versión esperada. Los datos omitidos se conservan; CSS puede modificarse o vaciarse de forma independiente. No hay feeders ni una herramienta intermedia `artifact_design`.
