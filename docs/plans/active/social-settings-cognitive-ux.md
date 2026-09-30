---
status: active
created: 2026-09-28
---
# Social y Ajustes: reducir esfuerzo antes de añadir funciones

## Alcance y criterio
Esta iteración revisa la navegación y los flujos principales de Social y Ajustes, no certifica todo Dome. Objetivos: localizar una sección, retomar trabajo pendiente y guardar cambios con un resultado claro. Las siete heurísticas orientan hipótesis; no sustituyen pruebas con usuarios ni justifican cambiar interfaces que ya funcionan.

## Evidencia y decisiones
- Conservar los grupos estables, descripciones, enlaces directos y navegación de Ajustes. Su reorganización reciente ya reduce memoria y decisiones (Jakob, Hick, Miller).
- La búsqueda depende de una subcadena literal: tolerar acentos y palabras en distinto orden evita exigir recordar el título exacto (Miller).
- El perfil permite guardar sin cambios y no anuncia cambios pendientes: usar un formulario con Enter, estado pendiente y confirmación solo tras persistencia (Jakob, Zeigarnik).
- Social muestra diez pestañas en una fila que compite con cuenta/sincronización/crear. Mantener cinco destinos de trabajo y reunir herramientas especializadas en un menú con el destino activo visible. Por debajo de 560 px de panel, usar un selector agrupado con los diez destinos. Esta agrupación se basa en tareas, no en métricas de frecuencia inexistentes (Hick, Miller).
- Usar objetivos de al menos 36 px en la navegación y separar filas al faltar espacio (Fitts).
- Eliminar la tarjeta Studio: repite el contador de borradores de la cola y las acciones ya presentes (Von Restorff).
- La cola muestra cuatro elementos sin acceso contextual al resto: añadir acceso al listado con el mismo estado y sin búsquedas anteriores (Zeigarnik).
- Conservar la protección de cambios del compositor, la confirmación de desconexión y los progresos reales del actualizador. No inventar pasos, porcentajes, rachas ni configuración obligatoria (Goal Gradient).

## Entregables
Cambios acotados, pruebas de navegación/cola/búsqueda/guardado y dos skills complementarias: revisión cognitiva y simplificación por primeros principios. Las skills deben aceptar explícitamente «sin cambios» como resultado y evitar aplicar las siete leyes por obligación.

## Validación
Ejecutar los controles del protocolo, pruebas focalizadas y revisión visual en perfil aislado. Registrar resultados y límites antes de cerrar.

Referencia conceptual: [Laws of UX](https://lawsofux.com/). Agrupar información no implica imponer siete elementos por pantalla; ni la memoria de tareas incompletas ni la proximidad a una meta justifican presión artificial.

## Resultado y revisión crítica
- Eliminada la tarjeta Studio duplicada. No se retiraron funciones, datos, canales IPC ni destinos.
- La primera adaptación a ancho estrecho dejó demasiadas filas y una altura fija provocó solapamiento. La revisión visual descartó esa solución: ahora el panel compacto usa un único selector de sección, siguiendo el patrón de Ajustes.
- La cola mantiene su estado al abrir el listado completo; el acceso general restablece el filtro. Ambos limpian búsquedas anteriores.
- Skills `dome-cognitive-ux` y `dome-simplify` versionadas en `.agents/skills/`, validadas con `quick_validate.py` e instaladas localmente mediante enlaces desde `~/.codex/skills/`.

## Evidencia de validación
- Suite completa: 129 archivos, 538 pruebas; tras los últimos ajustes, suite focalizada de 4 archivos y 21 pruebas correcta.
- Electron aislado (`cognitive-ux-review`): 1280×900 y 1024×720, menú con Enter/Escape, ubicación activa en Insights, diez destinos en el selector compacto, cambios de tema, perfil persistido con Enter y búsqueda «extension navegador». Sin excepciones del renderer; panel Social de 418 px sin overflow horizontal.
- La revisión visual utilizó un perfil vacío; los casos con publicaciones y fallos de persistencia se cubrieron con pruebas de comportamiento. No se conectaron cuentas ni se publicó contenido real. No se midieron tiempos de tarea con usuarios.
- Se conservan los alias/enlaces de Ajustes, la protección del compositor y los progresos reales existentes. No se añadieron porcentajes, onboarding, automatizaciones ni dependencias de producto.
- Controles locales finales correctos: typecheck, lint (0 errores; 118 avisos preexistentes), guardrails, Sonar diff, inventario IPC, protocolo remoto, build y dependency-cruiser. Las advertencias de tamaño de chunks y externalización de Pyodide siguen presentes.

## Ampliación: Tendencias y Referencias (2026-09-29)
- Tendencias: mostrar muestra, autores, periodo, métricas disponibles, comparación temporal y fuentes accesibles. No llamar «emergente» a una etiqueta sin evolución medida. No mezclar series de publicaciones diferentes para calcular velocidad. Conservar el contenido y las métricas de las evidencias cloud.
- Referencias: consultar evidencia por creador antes de paginar; evitar cruces por handles de redes distintas y URLs por prefijo. Mostrar biografía y contadores completos, distinguir captura parcial/error de perfil vacío, ofrecer actualización explícita sin exigir un análisis con IA y evitar respuestas tardías de otro perfil.
- Regresiones: un perfil antiguo con más de 120 referencias ajenas recientes, mismo handle en dos redes, captura parcial sobre datos completos, cambio rápido de selección, publicaciones sin mediciones temporales y fuentes cloud con métricas.

### Resultado de la ampliación

- Eliminados los recortes a 8 publicaciones al guardar y analizar. La extracción de JSON público admite hasta 400 publicaciones por página; no aplica un límite semanal ni promete paginar contenido que la red no expone. La ficha pagina todo el archivo guardado por creador. El análisis declara su cobertura y, si hay más de 120 publicaciones, distribuye la muestra por todo el periodo en lugar de usar solo las últimas.
- Consulta por proyecto, creador y red antes del límite, con coincidencia exacta de perfil; se conservan biografía, avatar y contadores cuando una recaptura llega incompleta. Se muestran las fechas conocidas, total del perfil, archivo guardado, limitaciones públicas, actualización explícita y errores de carga. Respuestas tardías no sustituyen otro creador.
- Radar: métricas repetidas por publicación, hashtags normalizados sin duplicar la muestra, autores separados por red y fecha de publicación antes que captura. Sin crecimiento demostrado se usa «Tema observado». Se muestran publicaciones, autores, periodo, publicaciones medidas/seguidas, Me gusta de ejemplos y fuentes con texto/fecha/métricas. El contrato cloud conserva esas evidencias. Se eliminan portadas vacías y el botón de descartar que solo registraba un evento sin retirar la tarjeta.
- En espacios estrechos la ficha ocupa el ancho disponible con vuelta a creadores; captura de URL y tarjetas se adaptan al panel, no al ancho de la ventana. Se elimina el contador de la lista basado en un recorte del proyecto.
- Regresiones verificadas: 145 publicaciones del creador con 130 referencias ajenas, mismo handle en dos redes, aislamiento de proyecto, recaptura parcial, más de 400 registros paginados, selección rápida, extracción de 60 posts públicos, muestra distribuida de 500, ausencia de evolución inventada, contenido cloud y publicación antigua importada hoy.
- Recorrido real con Electron aislado: 1600×1000 y 1024×720; archivo de 145 publicaciones, panel de 418 px sin desbordamiento, abrir datos/fuentes del radar, cero excepciones del renderer. Capturas locales `/tmp/dome-followup-*.png`.

### Cierre sobre main (2026-09-30)

Tras la integración de la revisión inicial (#1720), esta ampliación se entrega por separado sobre `origin/main`. Validación de la base actual: 131 archivos / 543 pruebas de interfaz y 47 regresiones de backend; tipos, lint (0 errores, 118 avisos existentes), guardrails, Sonar diff, inventario IPC, protocolo remoto y dependencias correctos. La compilación de producción pasa. La explicación usada por Many también distingue temas observados de evolución de interacciones en una muestra.
