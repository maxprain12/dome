# Brief de landing — Dome

Estado: propuesta de conversión. Fecha: 2026-09-05.

Estrategia: [analisis-mercado.md](./analisis-mercado.md).
Canon de producto: [positioning.md](../product/positioning.md), [editions.md](../product/editions.md).
Marca: [brand/README.md](../brand/README.md), [tokens.md](../brand/tokens.md).

Esta página vende primero Dome Pro al segmento de operadores independientes. Study y Dev se presentan como ediciones de la misma aplicación, no como tres productos equivalentes que compiten por el hero.

## 1. Objetivo de la página

### Conversión primaria

Descargar Dome y completar el primer workflow:

```text
importar recurso → abrir persona → pedir borrador a Many → aprobar acción
```

### Conversión secundaria

- visitar GitHub;
- leer el manual;
- ver una demo;
- registrarse en Provider cuando los planes estén listos.

Mientras no exista una demo web real, no usar “Probarlo ahora” como CTA principal. Usar “Descargar Dome”.

## 2. Principio de comunicación

La landing debe responder en este orden:

1. ¿Qué puedo hacer con Dome?
2. ¿Para quién es?
3. ¿Qué lo hace diferente?
4. ¿Puedo confiar en lo que ocurre con mis datos?
5. ¿Cómo lo pruebo?
6. ¿Qué pago, si pago algo?

No empezar por una lista de capacidades ni por las tres ediciones.

## 3. Arquitectura

1. Nav mínima
2. Hero con el workflow central
3. Demo o screenshot verificable
4. Cómo funciona: recurso → persona → acción
5. Edición Pro
6. Study y Dev como rutas secundarias
7. Local-first y aprobación
8. Planes, solo si están listos
9. GitHub / prueba social verificable
10. FAQ
11. CTA final
12. Footer

Anclas: `#como-funciona`, `#ediciones`, `#confianza`, `#precios`, `#faq`.

## 4. Dirección visual

### Sí

- Dark hero con el shell real de Dome.
- Inter para display y UI; JetBrains Mono solo para código.
- Fondo `#18181B`, superficie `#27272A`, texto `#FAFAFA`.
- Zinc claro en secciones de explicación y precios.
- Many como símbolo reconocible, no como mascota decorativa repetida.
- Capturas reales con IDs y datos personales ocultos.
- Bordes y escalones de superficie; sin sombras pesadas.
- Una animación corta que muestre el paso documento → persona → acción.

### No

- No clonar literalmente la web de ChatGPT.
- No usar un H1 abstracto de tres verbos como mensaje principal.
- No llenar el hero con Study, Dev, Social, GitHub y automatizaciones.
- No usar fotos stock de equipos.
- No inventar métricas ni testimonios.
- No afirmar “local-only” si se usa un proveedor cloud.
- No llamar “open source” al producto hasta resolver la licencia y validar la terminología.
- No usar lima en botones o fondos completos; reservarla para Many y acentos puntuales.

## 5. Nav

| Etiqueta | Destino | Regla |
| --- | --- | --- |
| Cómo funciona | `#como-funciona` | Entra al flujo principal |
| Ediciones | `#ediciones` | Pro primero; Study y Dev después |
| Confianza | `#confianza` | Explica local-first con precisión |
| Precios | `#precios` | Ocultar si Provider o licencia no están listos |
| Descargar | GitHub Releases | CTA principal |
| GitHub | Repositorio | Prueba técnica |
| Iniciar sesión | Provider | Secundario, nunca barrera inicial |

## 6. Copy en español

### Hero

**Eyebrow:** Documentos · Personas · Many

**H1:** Convierte tus documentos en acciones con contexto.

**Subhead:** Dome reúne tu biblioteca y tus relaciones en un workspace local-first. Many encuentra el material relevante, entiende a quién tienes delante y prepara el siguiente paso. Tú revisas y apruebas.

**CTA primario:** Descargar Dome

**CTA secundario:** Ver cómo funciona

**Proof line:** Escritorio para macOS, Windows y Linux · Elige tu proveedor de IA

**Visual:** recurso abierto a la izquierda, ficha de persona relacionada y borrador de seguimiento de Many. El botón de envío debe aparecer en estado “requiere aprobación”.

### Cómo funciona

**H2:** Del material que ya tienes al siguiente paso.

**Lead:** Dome no separa la biblioteca de las relaciones que nacen de ella.

**Paso 1 — Reúne tu material.** Importa notas, PDFs, vídeos, audio, páginas y URLs en una biblioteca que vive en tu ordenador.

**Paso 2 — Abre el contexto.** Many puede trabajar con el recurso abierto y la ficha de la persona relacionada.

**Paso 3 — Prepara la acción.** Crea un brief, un correo, un post o una nota para continuar el trabajo.

**Paso 4 — Decide tú.** Las acciones sensibles esperan tu aprobación antes de enviar o publicar.

**CTA:** Ver una demo del flujo

### Pro

**Eyebrow:** Edición principal

**H2:** Tu biblioteca y tus relaciones, en el mismo contexto.

**Body:** Pro está pensado para consultores, freelancers, pequeños estudios y creadores de servicios. Conserva el historial de cada persona junto al material que da sentido a la conversación.

**Ejemplos:**

- De una propuesta de cliente a un correo de seguimiento.
- De un artículo guardado a un post adaptado para una relación concreta.
- De una nota de reunión a un siguiente paso que queda registrado.

**CTA:** Explorar Pro

### Ediciones secundarias

**H2:** Una aplicación. Tres formas de trabajar.

**Intro:** Elige un foco al abrir Dome y cámbialo después sin borrar tu biblioteca.

**Study — Aprende desde tu biblioteca.** Convierte tus fuentes en flashcards, quizzes y guías con repetición espaciada.

**Dev — Construye con tus documentos y tu repo.** Conecta GitHub, agentes y automatizaciones cuando necesites pasar del issue al cambio.

**Nota:** Pro es la edición que lidera la página. Study y Dev son rutas de entrada para otros trabajos, no planes de pago separados.

### Capacidades

**H2:** El contexto permanece contigo.

Usar cuatro bloques, no siete cards:

1. **Biblioteca:** notas, PDFs, vídeo, audio y URLs listos para búsqueda y Many.
2. **Personas:** contactos y leads con historial y siguiente paso.
3. **Canales:** email y social conectados a las personas, con borradores y aprobación.
4. **Modelos:** Ollama local o las claves del proveedor que elijas.

No mostrar una lista de “123 herramientas”.

### Confianza

**H2:** Diseñado para que sepas dónde está tu contexto.

**Lead:** Local-first significa que la biblioteca y las personas viven en tu ordenador por defecto. También significa explicarte cuándo un proveedor cloud recibe contenido.

**Tus datos, tu disco.** Los datos locales se guardan en el almacenamiento de Dome. La nube de Dome es opcional cuando esa función esté disponible según el plan.

**Tú eliges el modelo.** Puedes usar Ollama local o conectar tus propias claves. Si eliges un proveedor cloud, el contenido de esa conversación queda sujeto a su política.

**Tú apruebas las acciones.** Enviar un correo o publicar en redes no ocurre sin tu visto bueno.

**Prueba visible:** enlace a documentación de almacenamiento, proveedores, permisos y telemetría.

### Planes

Esta sección solo se publica cuando los planes, el Provider, la licencia y las capacidades anunciadas estén alineados.

**H2:** Empieza en local. Añade servicios cuando los necesites.

**Lead:** Puedes usar la aplicación de escritorio con Ollama o tus propias API keys. Los planes de Dome añaden créditos, sincronización y servicios cloud cuando están disponibles.

No usar “Pro” para el plan y la edición sin cambiar uno de los nombres. Si se mantienen ambos, el selector debe decir claramente “Plan cloud” y “Edición de la aplicación”.

**Copy provisional, no publicar sin verificación:**

| Plan | Mensaje | Estado |
| --- | --- | --- |
| Free | Aplicación local y proveedor propio | Verificar licencia y límites |
| Starter | Créditos Dome y sync básico | Verificar Provider |
| Pro | Más créditos y servicios cloud | Evitar colisión con edición Pro |
| Max | Límites altos y modelos disponibles | Verificar coste y soporte |

El coste de la API de un proveedor externo no debe describirse como gratuito.

### Prueba y comunidad

**H2:** Mira el flujo completo.

Hasta tener clientes citables, sustituir testimonios por:

- vídeo de una tarea completa;
- enlace a GitHub y releases;
- changelog público;
- captura de la aprobación humana;
- caso propio claramente etiquetado como demostración.

No presentar historias ficticias como “inspiración” si ocupan el lugar de una prueba real.

### FAQ

**¿Dome es una aplicación web?** No. El producto principal es una aplicación de escritorio para macOS, Windows y Linux.

**¿Dome es local?** Es local-first. La biblioteca y las personas se guardan localmente por defecto, pero si conectas un proveedor cloud, el contenido enviado a ese proveedor sigue su política.

**¿Necesito una cuenta?** La prueba local no debería depender de una cuenta cloud. La cuenta de Dome se usa para funciones del Provider cuando estén disponibles.

**¿Puedo usar ChatGPT, Claude u Ollama?** Puedes configurar los proveedores compatibles que exponga la versión publicada de Dome.

**¿Qué diferencia hay entre Pro, Study y Dev?** Son ediciones de la misma aplicación: Pro conecta documentos y personas; Study prioriza el aprendizaje; Dev prioriza GitHub y agentes.

**¿Qué diferencia hay entre la edición Pro y el plan Pro?** No mantener esta colisión en la versión final. Renombrar uno de los dos o presentar el plan como “servicios cloud”.

**¿Dome es open source?** Publicar la respuesta solo después de resolver la licencia. Si se mantiene la restricción comercial actual, usar la terminología legal aprobada, no una promesa genérica.

**¿Qué puedo importar?** Mostrar únicamente los formatos e integraciones que la versión publicada soporte de forma estable.

### CTA final

**H2:** Convierte el próximo documento en un siguiente paso.

**Lead:** Descarga Dome, importa un recurso y comprueba si Many entiende el contexto.

**CTA primario:** Descargar Dome

**CTA secundario:** Ver el código en GitHub

## 7. English copy

### Hero

**Eyebrow:** Documents · People · Many

**H1:** Turn your documents into actions with context.

**Subhead:** Dome brings your library and your relationships into a local-first workspace. Many finds the relevant material, understands who you are working with, and prepares the next step. You review and approve.

**Primary:** Download Dome

**Secondary:** See how it works

**Proof line:** Desktop for macOS, Windows, and Linux · Choose your AI provider

### Core flow

**H2:** From the material you already have to the next step.

**Library.** Import notes, PDFs, video, audio, pages, and URLs into a library that lives on your computer.

**Context.** Many can work with the open resource and the related person record.

**Action.** Create a brief, email, post, or note to keep the work moving.

**Approval.** Sensitive actions wait for your approval before sending or publishing.

### Pro

**H2:** Your library and your relationships, in the same context.

**Body:** Pro is for consultants, freelancers, small studios, and service creators. Keep each person’s history next to the material that gives the conversation meaning.

### Secondary editions

**H2:** One app. Three ways to work.

**Study:** Learn from the library you already have.

**Dev:** Build with your documents, GitHub, and agents.

### Trust

**H2:** Know where your context lives.

**Body:** Dome is local-first: your library and people stay on your computer by default. Choose Ollama or your own provider keys, and approve sensitive actions before they happen.

### Final CTA

**H2:** Turn the next document into a next step.

**Primary:** Download Dome

**Secondary:** View on GitHub

## 8. SEO y distribución

### Title provisional

`Dome — Local-first workspace for documents, people, and AI actions`

### Description provisional

`Connect your local library and relationships in one desktop workspace. Let Many prepare contextual briefs, emails, and follow-ups with the AI provider you choose.`

### Páginas posteriores

- `/pro` — documento → persona → acción;
- `/study` — aprendizaje desde biblioteca;
- `/dev` — GitHub y agentes;
- `/local-first` — almacenamiento, modelos y permisos;
- `/manual` — instalación y primer workflow;
- `/pricing` — solo cuando planes y licencia estén listos.

## 9. Assets necesarios

P0:

1. Captura real del flujo Pro con datos ficticios.
2. Vídeo de 30–60 segundos del flujo completo.
3. Many en dark con contraste AA.
4. Enlaces definitivos a Releases, GitHub, Provider y documentación legal.
5. Página de privacidad y modelo de datos.

P1:

1. Captura Study.
2. Captura Dev.
3. Captura del estado de aprobación.
4. OG image coherente con Many y wordmark.
5. Caso de uso propio o primer caso autorizado.

## 10. Criterio de aceptación

La página está lista cuando una persona del segmento prioritario puede responder, sin ayuda:

1. “Dome conecta mis documentos con mis relaciones.”
2. “Many puede preparar un siguiente paso contextualizado.”
3. “Mis datos locales no dependen de una cuenta cloud para empezar.”
4. “Yo apruebo antes de enviar o publicar.”
5. “Sé exactamente qué tengo que descargar para probarlo.”

Si el visitante recuerda las tres ediciones pero no el workflow central, hay que simplificar de nuevo.
