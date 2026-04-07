# Manual de Usuario — Dome

> Guía completa para usuarios finales de Dome Desktop (v2.1.4).
> Este manual no requiere conocimientos técnicos.

---

## Tabla de contenidos

1. [¿Qué es Dome?](#1-qué-es-dome)
2. [Instalación](#2-instalación)
3. [Primeros pasos (Onboarding)](#3-primeros-pasos-onboarding)
4. [Organizar tu conocimiento](#4-organizar-tu-conocimiento)
5. [El editor de notas](#5-el-editor-de-notas)
6. [Buscar con Cmd+K](#6-buscar-con-cmdk)
7. [Many — tu asistente de IA](#7-many--tu-asistente-de-ia)
8. [Agentes personalizados](#8-agentes-personalizados)
9. [Agent Teams — equipos multi-agente](#9-agent-teams--equipos-multi-agente)
10. [Agent Canvas — workflows visuales](#10-agent-canvas--workflows-visuales)
11. [Studio — generar contenido](#11-studio--generar-contenido)
12. [Flashcards — estudio inteligente](#12-flashcards--estudio-inteligente)
13. [Calendario](#13-calendario)
14. [Automatizaciones](#14-automatizaciones)
15. [Almacenamiento en la nube](#15-almacenamiento-en-la-nube)
16. [WhatsApp](#16-whatsapp)
17. [Marketplace](#17-marketplace)
18. [Configuración y ajustes](#18-configuración-y-ajustes)

---

## 1. ¿Qué es Dome?

Dome es una aplicación de escritorio para **gestión del conocimiento e investigación académica**. Te permite:

- Guardar y organizar todo tipo de recursos: notas, PDFs, vídeos, audios, imágenes, URLs, presentaciones
- Chatear con IA sobre tu contenido personal
- Generar automáticamente resúmenes, quizzes, flashcards y más
- Crear workflows de IA complejos con una interfaz visual
- Sincronizar con Google Calendar, Google Drive y OneDrive
- Estudiar con repetición espaciada (SM-2)

Dome funciona **completamente offline** con proveedores IA locales (Ollama), o conectado a la nube con OpenAI, Anthropic, Google u otros proveedores.

---

## 2. Instalación

### Requisitos mínimos

- macOS 13+, Windows 10+ o Linux (Ubuntu 20.04+)
- 4 GB RAM (8 GB recomendado)
- 2 GB de espacio en disco

### Pasos

1. Descarga el instalador desde la página oficial de Dome
2. En macOS: arrastra `Dome.app` a la carpeta Aplicaciones
3. En Windows: ejecuta el instalador `.exe` y sigue los pasos
4. Abre Dome — se lanzará el flujo de onboarding

> **Nota**: En macOS puede aparecer un aviso de seguridad. Ve a Preferencias del Sistema → Privacidad y Seguridad → Abrir de todas formas.

---

## 3. Primeros pasos (Onboarding)

Al abrir Dome por primera vez, verás un flujo de 4 pasos:

### Paso 1 — Bienvenida
Presentación de Dome y sus capacidades principales.

### Paso 2 — Tu perfil
- Introduce tu nombre y foto de perfil (opcional)
- Define tu rol: estudiante, investigador, profesional, etc.

### Paso 3 — Configurar IA
Elige cómo quieres usar la inteligencia artificial:

| Proveedor | Descripción | Coste |
|-----------|-------------|-------|
| **Ollama** | Modelos locales en tu máquina. Sin internet, sin coste | Gratis (requiere instalar Ollama) |
| **OpenAI** | GPT-4o, GPT-4 Turbo. Alta calidad | De pago (API Key) |
| **Anthropic** | Claude Sonnet, Claude Opus | De pago (API Key) |
| **Google** | Gemini Pro, Gemini Flash | De pago (API Key) |
| **Dome** | Proxy con suscripción incluida | Suscripción mensual |

Para Ollama, sigue la [guía de instalación](./guia-instalacion-ollama.md).

### Paso 4 — ¡Listo!
Dome ya está configurado. Puedes empezar a añadir recursos.

---

## 4. Organizar tu conocimiento

### Proyectos y recursos

**Proyectos** son carpetas de alto nivel (ej: "Tesis doctoral", "Trabajo Q1", "Lecturas 2025").

**Recursos** son los contenidos dentro de cada proyecto:

| Tipo | Descripción |
|------|-------------|
| 📝 Nota | Documento de texto enriquecido con el editor Dome |
| 📄 PDF | Archivo PDF con visor integrado y anotaciones |
| 🎥 Video | Archivos de vídeo locales o URLs de YouTube |
| 🎵 Audio | Archivos de audio, transcripción automática |
| 🖼️ Imagen | Imágenes locales |
| 🔗 URL | Páginas web guardadas para lectura offline |
| 📊 Presentación | Archivos PowerPoint (.pptx) |
| 📓 Notebook | Documentos con celdas de código y texto |

### Crear un proyecto

1. En la barra lateral izquierda, haz clic en el botón **+** junto a "Proyectos"
2. Escribe el nombre del proyecto
3. Pulsa Enter

### Añadir recursos

**Método 1 — Arrastrar y soltar**: Arrastra archivos desde el Finder/Explorador directamente a Dome.

**Método 2 — Command Center** (Cmd+K):
- Pulsa `Cmd+K`
- Escribe una URL o arrastra un archivo en el campo de búsqueda
- Dome importará y procesará automáticamente el contenido

**Método 3 — Botón +**: Dentro de un proyecto, haz clic en el botón **+** para añadir recursos manualmente.

### PageIndex — "Listo para IA"

Cuando añades un recurso, Dome lo indexa automáticamente en segundo plano. Cuando aparece el badge **"Listo para IA"** en la cabecera del workspace, el recurso ya puede ser consultado por el asistente Many con comprensión semántica.

Dome indexa automáticamente:
- Al arrancar la aplicación (tras 15 segundos de warm-up)
- Cada hora en segundo plano
- Cada vez que editas o añades un recurso

---

## 5. El editor de notas

El editor de Dome es similar a Notion: basado en bloques, rico en formato.

### Tipos de bloques

Escribe `/` para ver todos los bloques disponibles:

| Bloque | Descripción |
|--------|-------------|
| Texto | Párrafo normal |
| Encabezado 1/2/3 | Títulos jerárquicos |
| Lista de viñetas | Bullet list |
| Lista numerada | Ordered list |
| Lista de tareas | Checkboxes interactivos |
| Cita | Blockquote |
| Código | Bloque de código con syntax highlighting |
| Callout | Bloque destacado con icono y color |
| Toggle | Sección desplegable |
| Tabla | Tabla editable |
| Divisor | Línea separadora |
| PDF embebido | Embebe un PDF de tu biblioteca |
| Mención de recurso | Enlaza a otro recurso de Dome |
| Bloque de archivo | Adjunta un archivo |
| Columnas | Divide el contenido en columnas |

### Atajos de teclado

| Atajo | Acción |
|-------|--------|
| `Cmd+B` | Negrita |
| `Cmd+I` | Cursiva |
| `Cmd+U` | Subrayado |
| `Cmd+Shift+S` | Tachado |
| `Cmd+Z` | Deshacer |
| `Cmd+Shift+Z` | Rehacer |
| `/` | Abrir menú de bloques |
| `@` | Mencionar un recurso |

### Guardar

Las notas se guardan automáticamente en tiempo real. No hay botón de guardar.

---

## 6. Buscar con Cmd+K

El **Command Center** es el buscador universal de Dome. Accede con `Cmd+K` (o `Ctrl+K` en Windows).

### Buscar recursos

Escribe cualquier término para buscar en:
- Títulos y metadatos de todos tus recursos
- Contenido completo (texto completo con FTS)

### Modo URL

Si pegas una URL en el Command Center:
- Dome descarga y guarda el artículo
- Para YouTube: extrae transcripción automáticamente
- El recurso queda disponible para consulta offline

### Drop de archivos

Arrastra un archivo directamente sobre el Command Center para importarlo.

---

## 7. Many — tu asistente de IA

**Many** es el asistente de IA integrado en Dome. Accede al panel flotante con el botón de chat en la esquina inferior derecha (o `Cmd+Shift+M`).

### Capacidades de Many

Many puede:
- Responder preguntas sobre tu biblioteca personal de recursos
- Buscar en la web en tiempo real
- Crear y editar notas directamente
- Agendar eventos en tu calendario
- Buscar semánticamente en tus documentos
- Ejecutar herramientas MCP (si tienes servidores MCP configurados)

### Herramientas disponibles

| Herramienta | Descripción |
|-------------|-------------|
| `resource_search` | Busca en tu biblioteca por texto |
| `resource_semantic_search` | Búsqueda semántica (requiere PageIndex) |
| `resource_get` | Lee el contenido de un recurso específico |
| `resource_create` | Crea una nueva nota |
| `resource_update` | Edita una nota existente |
| `web_search` | Búsqueda en internet |
| `web_fetch` | Descarga el contenido de una URL |
| `create_event` | Crea un evento en el calendario |
| `import_file_to_dome` | Importa archivos desde MCP a tu biblioteca |

### Subir imágenes

Puedes arrastrar imágenes al chat de Many para incluirlas en tu mensaje (con proveedores que soportan visión, como GPT-4o o Claude).

### Seleccionar modelo

En la barra inferior del chat de Many, usa el selector de modelo para cambiar entre:
- Los modelos disponibles de tu proveedor configurado
- Diferentes balances calidad/velocidad/coste

---

## 8. Agentes personalizados

Los **agentes** son versiones especializadas de Many con instrucciones, herramientas y personalidad propias.

### Crear un agente

1. Ve a **Settings → Agents** (o desde el icono de agentes en la barra lateral)
2. Haz clic en **Nuevo agente**
3. Configura:
   - **Nombre** e icono
   - **Instrucciones del sistema** (qué hace el agente, su tono, especialidad)
   - **Herramientas**: qué herramientas puede usar
   - **Servidores MCP**: herramientas externas via MCP
   - **Modelo**: qué modelo de IA usará

### Usar un agente

En el panel de Many, haz clic en el selector de agente (arriba) y elige el agente que quieres usar. La conversación comenzará con las instrucciones personalizadas de ese agente.

### Agentes del Marketplace

Instala agentes preconfigurados desde el Marketplace (ver [sección 17](#17-marketplace)).

---

## 9. Agent Teams — equipos multi-agente

Los **Agent Teams** permiten crear equipos de agentes especializados que colaboran en tareas complejas.

### Cómo funciona

Un **supervisor** recibe tu pregunta o tarea y la delega automáticamente a los agentes del equipo más adecuados. Cada agente trabaja en su subtarea y el supervisor sintetiza los resultados.

### Agentes del sistema

Dome incluye agentes de sistema preconfigurados:

| Agente | Especialidad |
|--------|-------------|
| Research Agent | Búsqueda web, fuentes, síntesis de información |
| Library Agent | Búsqueda en tu biblioteca personal |
| Writer Agent | Redacción y creación de contenido |
| Data Agent | Análisis de datos y tablas |
| Presenter Agent | Creación de presentaciones |
| Curator Agent | Organización del conocimiento, flashcards |

### Crear un equipo

1. Ve a la sección **Agent Teams** en la barra lateral
2. Crea un nuevo equipo y añade los agentes que quieres
3. Escribe tu tarea en el chat — el supervisor coordinará automáticamente

---

## 10. Agent Canvas — workflows visuales

El **Agent Canvas** es un constructor visual de workflows de IA, usando una interfaz de nodos y conexiones.

### Tipos de nodos

| Nodo | Función |
|------|---------|
| **Text Input** | Punto de entrada con texto fijo o dinámico |
| **Agent** | Ejecuta un agente de IA con instrucciones |
| **Document** | Lee o escribe un recurso de tu biblioteca |
| **Output** | Muestra el resultado final |
| **Image** | Procesa imágenes |

### Crear un workflow

1. Accede a **Agent Canvas** desde la barra lateral o el Marketplace
2. Arrastra nodos desde la barra lateral del canvas
3. Conecta los nodos arrastrando entre los puntos de conexión
4. Configura cada nodo (instrucciones, modelo, etc.)
5. Haz clic en **Ejecutar** para ver el workflow en acción

### Logs en tiempo real

Durante la ejecución, puedes ver los logs de cada nodo en tiempo real en el panel inferior del Canvas.

### Guardar y compartir

Los workflows se guardan como JSON. Puedes publicarlos en el Marketplace para que otros los usen.

---

## 11. Studio — generar contenido

El **Studio** genera automáticamente materiales de estudio y contenido estructurado desde tus recursos.

### Tipos de generación

| Tipo | Descripción |
|------|-------------|
| **Mindmap** | Mapa mental visual del contenido |
| **Quiz** | Preguntas de opción múltiple |
| **Flashcards** | Tarjetas de memoria automáticas |
| **Guide** | Guía estructurada con pasos |
| **FAQ** | Preguntas frecuentes y respuestas |
| **Timeline** | Línea temporal de eventos |
| **Resumen** | Síntesis concisa del contenido |

### Usar el Studio

1. Abre un recurso (PDF, nota, etc.)
2. Haz clic en el botón **Studio** (varita mágica) en la barra de herramientas
3. Selecciona el tipo de contenido a generar
4. El resultado se guarda automáticamente como una nueva nota en tu proyecto

---

## 12. Flashcards — estudio inteligente

Las **Flashcards** de Dome usan el algoritmo **SM-2** (Spaced Repetition) para optimizar cuándo repasar cada tarjeta según tu rendimiento.

### Crear un deck

**Manualmente**:
1. Ve a la sección Flashcards en la barra lateral
2. Crea un nuevo deck y añade tarjetas (frente / reverso)

**Desde Studio**:
1. Abre un recurso y usa Studio → Flashcards
2. Dome genera las tarjetas automáticamente del contenido

### Sesión de estudio

1. Abre el deck y haz clic en **Estudiar**
2. Para cada tarjeta: intenta recordar la respuesta, luego voltea la tarjeta
3. Evalúa tu respuesta: 😕 Difícil / 😐 Regular / 😊 Fácil
4. Dome programa automáticamente cuándo volver a mostrarte cada tarjeta

### Progreso

En el panel de cada deck puedes ver:
- Tarjetas pendientes hoy
- Tarjetas dominadas
- Racha de días de estudio

---

## 13. Calendario

El **Calendario** de Dome integra tu gestión de eventos con la IA.

### Vista

- **Vista día**: eventos del día con horario
- **Vista semana**: semana completa con todos los eventos

### Crear eventos

1. Haz clic en cualquier slot del calendario
2. Rellena: título, fecha/hora, descripción
3. Marca "Todo el día" si aplica

### Google Calendar Sync

1. Ve a **Settings → Calendar**
2. Haz clic en **Conectar Google Calendar**
3. Autoriza el acceso (solo lectura/escritura de eventos — Dome no accede a tu email ni contactos)
4. Tus eventos de Google Calendar aparecerán en Dome

### IA en el calendario

Many puede gestionar tu calendario directamente desde el chat:
- "Crea una reunión mañana a las 10am sobre el proyecto X"
- "¿Qué tengo esta semana?"
- "Cancela la reunión del jueves"

---

## 14. Automatizaciones

Las **Automatizaciones** ejecutan workflows de IA de forma programada, sin que tengas que hacerlo manualmente.

### Crear una automatización

1. Ve a **Automatizaciones** en la barra lateral
2. Haz clic en **Nueva automatización**
3. Configura:
   - **Nombre**: nombre descriptivo
   - **Trigger**: cuándo se ejecuta (diariamente, semanalmente, cada N minutos)
   - **Hora**: a qué hora del día
   - **Agente y tarea**: qué agente ejecutar y con qué prompt
   - **Destino**: dónde guardar el resultado (nota, carpeta, etc.)

### Tipos de schedule

| Tipo | Descripción |
|------|-------------|
| Diario | Se ejecuta una vez al día a la hora indicada |
| Semanal | Un día de la semana a la hora indicada |
| Intervalo | Cada N minutos (ej: cada 30 minutos) |

### Ver resultados

En la sección **Runs** (dentro de Automatizaciones) puedes ver:
- Historial de todas las ejecuciones
- Estado: completado, fallido, en curso
- Logs detallados de cada run

### Activar/desactivar

Cada automatización tiene un toggle para activarla o desactivarla sin borrarla.

---

## 15. Almacenamiento en la nube

Dome se conecta con **Google Drive** y **Microsoft OneDrive** para importar archivos directamente.

### Conectar Google Drive

1. Ve a **Settings → Cloud Storage**
2. Haz clic en **Conectar Google Drive**
3. Autoriza en el navegador (OAuth PKCE — Dome no almacena tus credenciales)
4. Volverás a Dome con la cuenta conectada

### Conectar OneDrive

El proceso es idéntico: Settings → Cloud Storage → Conectar OneDrive.

> **Privacidad**: Dome solo tiene permisos de lectura (`Files.Read`). Nunca escribe ni modifica tus archivos en la nube.

### Importar archivos

1. Una vez conectada la cuenta, haz clic en el icono de nube en la barra de herramientas
2. Navega por tus carpetas o busca por nombre
3. Selecciona uno o varios archivos
4. Haz clic en **Importar** — los archivos se descargan y añaden a tu proyecto actual
5. Se inicia automáticamente la indexación PageIndex

---

## 16. WhatsApp

Dome puede conectarse con WhatsApp para recibir y enviar mensajes desde la aplicación.

### Conectar

1. Ve a **Settings → WhatsApp**
2. Haz clic en **Conectar**
3. Escanea el código QR con tu móvil (igual que WhatsApp Web)
4. La conexión se mantiene activa mientras Dome esté abierto

### Allowlist

Por seguridad, solo los contactos en tu **allowlist** pueden interactuar con Dome vía WhatsApp. Gestiona la lista en Settings → WhatsApp → Allowlist.

### Uso desde el chat

Una vez conectado, Many puede:
- Leer mensajes recientes
- Enviar mensajes a contactos de tu allowlist

---

## 17. Marketplace

El **Marketplace** centraliza la instalación de extensiones para Dome.

### Tipos de extensiones

| Tipo | Descripción |
|------|-------------|
| **Agentes** | Agentes IA especializados preconfigurados |
| **Plugins** | Extensiones visuales: Pets (mascotas) y Views (vistas custom) |
| **Skills** | Capacidades adicionales del ecosistema skills.sh |
| **Workflows** | Workflows preconstruidos para el Agent Canvas |
| **MCP Servers** | Integraciones con herramientas externas via Model Context Protocol |

### Instalar una extensión

1. Ve a **Marketplace** en la barra lateral
2. Navega o busca la extensión
3. Haz clic en **Instalar**
4. La extensión estará disponible inmediatamente

### Plugins especiales

- **Pets**: mascotas virtuales que viven en tu Home y pueden interactuar contigo
- **Views**: añaden nuevas secciones a la navegación lateral de Dome

---

## 18. Configuración y ajustes

Accede a Settings con `Cmd+,` o desde el icono de engranaje en la barra lateral.

### Paneles de configuración

| Panel | Descripción |
|-------|-------------|
| **General** | Idioma, tema (claro/oscuro), comportamiento de inicio |
| **Appearance** | Tema visual, tipografía, densidad |
| **AI Configuration** | Proveedor IA, API key, modelo por defecto |
| **Agents** | Gestionar agentes personalizados |
| **Calendar** | Conectar Google Calendar |
| **Cloud Storage** | Conectar Google Drive y OneDrive |
| **Indexing** | Configurar PageIndex: modelo, proveedor, triggers |
| **WhatsApp** | Conectar y gestionar allowlist |
| **MCP Servers** | Configurar servidores MCP |
| **Privacy** | Analytics (PostHog), datos de uso |
| **Advanced** | Limpiar caché, datos experimentales |
| **Marketplace** | Gestionar extensiones instaladas |
| **Dome Provider** | Conectar cuenta Dome (suscripción) |

### Cambiar proveedor de IA en cualquier momento

Settings → AI Configuration → selecciona el nuevo proveedor e introduce tu API key. El cambio aplica inmediatamente en nuevas conversaciones.

### Tema claro/oscuro

Settings → Appearance → Tema, o usa el atajo rápido en la barra inferior de la aplicación.

---

## Preguntas frecuentes

**¿Mis datos son privados?**
Sí. Todos tus recursos y notas se almacenan localmente en tu ordenador (`~/Library/Application Support/dome/` en macOS). Si usas proveedores de IA en la nube (OpenAI, Anthropic, etc.), el contenido de tus preguntas se envía a sus servidores según sus políticas de privacidad.

**¿Puedo usar Dome sin internet?**
Sí, con Ollama como proveedor. La búsqueda y organización de recursos siempre funciona offline. Solo las funciones que necesitan internet (web search, cloud storage, Google Calendar) requieren conexión.

**¿Cómo migro mis datos si cambio de ordenador?**
Copia la carpeta `dome-files` de tu directorio de datos de usuario a la nueva máquina. También puedes hacer exportaciones de notas individuales desde el editor.

**Many no encuentra información de mis PDFs**
Comprueba que el badge "Listo para IA" aparece en el workspace. Si no, espera a que PageIndex termine de indexar (puede tardar unos minutos para PDFs grandes). También puedes forzar re-indexación desde Settings → Indexing.

**¿Puedo usar varios proyectos a la vez?**
Sí. Dome soporta múltiples pestañas (tabs) dentro del workspace, una por recurso abierto.

---

*Manual de Usuario — Dome v2.1.4*
