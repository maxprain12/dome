# Investigación de Many

Many dispone de `research_capabilities`, `research_search`, `research_read`, `research_profile` y `research_collect`. Consulte capacidades antes de recopilar: el catálogo contiene 16 fuentes y separa habilitación de acceso, configuración técnica y verificación. Ningún conector se anuncia como verificado por estar instalado.

## Uso

- Web: lectura pública con Readability o `source: browser` para una pestaña que el usuario haya habilitado explícitamente en la extensión emparejada. Abra Many en la extensión y active «Permitir investigación» en la pestaña elegida. Solo se admite lectura del URL exacto; no navegación, JavaScript arbitrario, cookies ni credenciales.
- RSS/Atom: `platform: rss` y URL del feed. Parser local, máximo 2 MB y 30 entradas. No se admiten DTD ni entidades externas.
- GitHub: búsqueda de repositorios y lectura de usuario/repositorio por API oficial. Reutiliza la autenticación existente cuando está configurada.
- Instagram/X: reutiliza las referencias públicas existentes, con cobertura parcial. No añade APIs privadas ni amplía los proveedores de publicación Social.
- Exa/Brave/Tavily: configure claves y habilite expresamente cada proveedor en Ajustes → IA → búsqueda web → investigación. Exa usa búsqueda Auto, hasta 10 resultados; no solicita Contents ni Deep.
- Las otras fuentes permanecen pendientes de habilitación. Utilice las importaciones existentes para analizar evidencia aportada; este catálogo no autoriza automatizar esas plataformas.

Ejemplo de llamada: `research_collect({platform: "web", urls: ["https://example.org/article"], project_id: "project-id", save: true})`. El resultado incluye identificador de trabajo, estado, evidencia, fallos por fuente y recurso guardado. `research:status` proporciona progreso y `research:cancel` acepta el UUID del trabajo. Las llamadas de Many en main propagan además su señal de cancelación. Sin conexión al navegador, el estado es `requires_connection`; no se abren pestañas automáticamente. Cancelar conserva los resultados ya recogidos en la respuesta. Los resultados sin `save: true` no se guardan como recurso.

Cada evidencia conserva URL, fecha de captura, fecha de publicación cuando exista, texto, procedencia, métricas opcionales y cobertura. Las métricas desconocidas son `null`; toda captura sigue siendo parcial. Las notas guardadas incluyen fuentes recuperables y metadatos de evidencia. El modelo debe citar observaciones y distinguirlas de hipótesis; no existe certificación automática de cada conclusión de la síntesis.

## Costes y límites

Los proveedores nuevos están desactivados por defecto. La política inicial limita adquisición a USD 0,25 por investigación y USD 10 por mes UTC. Se reserva el coste antes de la solicitud en main y se persiste la estimación. Los errores y cancelaciones posteriores al envío conservan la reserva porque el proveedor puede facturarlos. No se reintentan automáticamente las llamadas pagadas. Las claves no se devuelven en diagnóstico; se almacenan mediante el gestor de secretos existente.

Estimaciones al 1 de octubre de 2026: Brave USD 0,005/búsqueda, Tavily básico USD 0,008/búsqueda, Exa Auto USD 0,007/búsqueda. Estos límites cubren `research_*` y el dispatcher Exa; las herramientas anteriores de búsqueda Brave/Tavily conservan su propia configuración. No son un límite de facturación del proveedor y excluyen modelos, embeddings y transcripción. Use también las cuotas del proveedor. La captura local no cobra por solicitud. Sin proveedor habilitado, búsqueda web usa el fallback SearXNG/DDG existente, sujeto a disponibilidad.

Cada colección realiza como máximo una búsqueda de hasta 10 resultados y lee hasta 30 URLs, secuencialmente. Los perfiles públicos incluyen como máximo 50 publicaciones disponibles. Una pestaña admite una lectura a la vez. Hay hasta 10 trabajos simultáneos y se conservan hasta 100 resúmenes locales en memoria; tras reiniciar solo permanece el resumen del último trabajo y los recursos guardados. El límite mensual persiste tras reinicio. Una colección tiene un máximo de dos minutos; cada lectura, 30 segundos.

## Licencias y distribución

Implementación original; no se ha copiado código de Agent-Reach, OpenCLI ni sus adaptadores, ni se han incorporado instaladores, runtimes Python, modelos Jina o ejecutables yt-dlp. Agent-Reach y los proyectos auditados fueron referencias de diseño, sin actualización ni descarga de adaptadores durante la investigación.

La única dependencia directa nueva es `fast-xml-parser@5.11.2`, fijada exactamente; sus ocho paquetes de ejecución revisados son MIT. El árbol concreto está en [el inventario](../legal/research/dependencies.json). Los textos de licencia se distribuyen dentro de `electron/research/THIRD-PARTY-NOTICES.txt`, incluido por `electron/**/*`. El paquete `@nodable/entities` omite LICENSE en npm; se conserva la licencia de su repositorio oficial, identificada en el inventario.

La licencia de Dome sigue siendo la de `LICENSE`, con sus restricciones comerciales. Esta entrega no relicencia el proyecto ni acredita titularidad para distribución comercial. Esa autorización sigue siendo una condición administrativa de distribución. Licencia del código, precio y permiso de acceso a los datos son controles distintos.

## Validación y alcance

Pruebas automatizadas cubren presupuestos, cancelación, fallos parciales, persistencia, RSS/Atom, métricas ausentes y puente de pestañas (propietario, URL, revocación, concurrencia y esquemas sin cookies). Se han compilado las variantes Chrome/Edge/Firefox/Safari. Las sesiones reales de las plataformas y las llamadas pagadas no se han certificado; `verifiedAt` permanece vacío. Vídeo/podcast y conectores pendientes requieren una entrega posterior con acceso autorizado y comprobaciones reales antes de habilitarse.
