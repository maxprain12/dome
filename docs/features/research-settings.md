# Investigación en internet

Ajustes → Investigación en internet gestiona las 16 fuentes de Agent-Reach
desde herramientas nativas de Dome. IA → Búsqueda conserva sus ajustes
anteriores y enlaza este destino. `?section=research` y el alias
`?section=agent-reach` abren la misma sección.

Agent-Reach completo se descargó para esta adaptación en
`/Users/maxprain/.codex/worktrees/0345/agent-reach-reference`, commit
`a19a171fa980a0785849596492e0af4db800c82f`. La copia es una referencia local,
no una dependencia que se descarga o ejecuta durante una investigación.
La procedencia y MIT del inventario adaptado están en
`docs/legal/research/dependencies.json` y en los avisos distribuidos
`electron/research/THIRD-PARTY-NOTICES.txt`.

## Correspondencia funcional del repositorio

| Agent-Reach | Adaptación Dome |
| --- | --- |
| `setup`, `configure`, Config YAML | Formulario de claves cifradas, permiso de uso, presupuestos y preferencias de rutas en SQLite. Escritura atómica. No importar cookies ni copiar configuración externa automáticamente. |
| Registro de canales y `ordered_backends` | 16 fuentes agrupadas, capacidades operativas actuales, correspondencia de backends upstream, ruta web HTTP/extensión y buscador auto/gratuito/proveedor explícito. La preferencia se aplica a las herramientas de Many. |
| `doctor --json`, `probe` | Diagnóstico local sin efectos externos; prueba explícita de búsqueda/lectura/perfil de una fuente habilitada, con cancelación, presupuesto y última comprobación por operación. Copiar informe sin secretos, URLs de pestañas, consultas, evidencia ni IDs de investigaciones. |
| `install`, `--dry-run`, `--channels` | Dome distribuye adaptadores revisados. El catálogo y los enlaces a Extensión, Social e IA muestran qué configurar; sin instaladores globales, npm/pip automáticos o servidores descargados. |
| Lectura/búsqueda mediante CLIs | `research_capabilities`, `research_search`, `research_read`, `research_profile`, `research_collect` existentes; acceso desactivable por fuente desde Ajustes. |
| `format xhs` | Evidencia común con texto, URL, captura, procedencia, cobertura parcial y campos desconocidos nulos. Importación explícita como nota para cualquier fuente. No presupone compatibilidad de todos los JSON upstream. |
| `transcribe` y scripts de podcasts | Transcripción nativa existente de material autorizado, configurada en IA. No ejecutar el script upstream ni distribuir yt-dlp. |
| `skill --install` | Instrucciones nativas de Many y sus herramientas existentes, sin registrar una skill que obligue a ejecutar CLIs o evadir puertas de acceso. |
| `version`, `check-update` | Commit revisado visible, enlace a código fijado. Actualizaciones mediante releases de Dome; no actualizar adaptadores durante el trabajo. |
| `watch` | El diagnóstico está disponible en `research_capabilities`; automatizaciones existentes pueden consultarlo. No crear tareas recurrentes ni conexiones por instalar esta ampliación. |
| `uninstall --keep-config` | Desactivar fuentes/proveedores y eliminar expresamente claves individuales. No borrar credenciales compartidas, sesiones o recursos como parte de un «desinstalar» genérico. |
| MCP server wrapper | IPC validado y herramientas nativas. MCP sigue disponible en su sección existente; no empaquetar el servidor Python. |

## Fuentes y cobertura

| Fuente | Backend de referencia | Ruta Dome actual |
| --- | --- | --- |
| Web | Jina Reader | Readability y pestaña habilitada de la extensión; búsqueda pública/BYOK. Jina existente en IA permanece separado. |
| Exa | Exa MCP / mcporter | API BYOK con permiso y reserva de presupuesto. No depender del MCP público ilimitado ni habilitar Deep. |
| RSS/Atom | feedparser | Parser XML local Node. |
| GitHub | GitHub CLI | API y autenticación existente. Lectura y búsqueda de metadatos; esta ampliación no añade operaciones de escritura. |
| V2EX | API pública | Importación; revisión de reutilización pendiente. |
| YouTube | yt-dlp | Transcripciones/material autorizado aportado; revisión de acceso pendiente. |
| Xiaoyuzhou | Groq/OpenAI Whisper | Evidencia aportada y transcripción existente. |
| Instagram | OpenCLI | Captura pública parcial existente e importación. Publicación en Social independiente. |
| LinkedIn | LinkedIn MCP / Jina | Importación; captura automática pendiente. |
| X | twitter-cli / OpenCLI / bird | Captura pública parcial existente e importación. Sin cookies ni timelines privados nuevos. |
| Reddit | OpenCLI / rdt-cli | Importación; autorización comercial pendiente. |
| Facebook | OpenCLI | Importación; revisión de acceso pendiente. |
| Bilibili | bili-cli / OpenCLI | Importación; revisión de acceso pendiente. |
| Xiaohongshu | OpenCLI / MCP / xhs-cli | Importación; revisión de acceso pendiente. |
| Boss Zhipin | boss-agent-cli / Chrome dedicado | Descripciones de empleo aportadas; revisión pendiente. |
| Xueqiu | OpenCLI | Evidencia aportada; sin redistribución de cotizaciones. |

Las rutas del repositorio original son referencia, no un permiso de acceso ni
una promesa de disponibilidad. Se mantienen las decisiones de la auditoría
aceptada sobre Apache/BSD/ISC/MIT, ejecutables copyleft y procedencia no aclarada.
No se modifica la licencia de Dome.

## Comportamiento y límites

Desactivar una fuente impide sus operaciones de investigación, incluidas
colecciones y búsquedas de Many. Importar texto es una acción explícita de
biblioteca y sigue disponible. Una fuente pendiente no se habilita por el
interruptor, iniciar sesión, aportar una clave o seleccionar otra ruta.

Las claves vacías conservan la guardada; «Eliminar clave» requiere una acción
explícita y desactiva su proveedor. El formulario confirma éxito tras la
transacción. Las claves son compartidas con la búsqueda existente; el
permiso/presupuesto de investigación gobierna `research_*` y, tras guardar esta
configuración, también las llamadas de Many a `web_search`. Estas pasan por la
misma ruta antes de consultar la caché heredada. Las instalaciones sin una
configuración guardada y la prueba explícita de IA → Búsqueda conservan su
comportamiento anterior.

El diagnóstico no demuestra disponibilidad remota. Las comprobaciones reales
se hacen una a una con URL/consulta aportada, como máximo un resultado,
cancelación y límites de adquisición existentes. La última prueba permanece
en memoria hasta reiniciar; su éxito no certifica todas las operaciones ni
acceso completo. No se guarda una nota durante una prueba.

La importación guarda una nota con evidencia normalizada `user_import`,
fuente, fecha de captura y cobertura parcial. Un fallo conserva el borrador.
Los borradores de fuentes y proveedores permanecen al cambiar de fuente o
plegar formularios; salir de la sección no los persiste automáticamente.
