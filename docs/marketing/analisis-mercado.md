# Estrategia de marketing — Dome

Estado: propuesta estratégica. Fecha: 2026-09-05.

Fuentes internas: [positioning.md](../product/positioning.md), [editions.md](../product/editions.md), [README.md](../../README.md), [LICENSE](../../LICENSE) y [draft-web.md](./draft-web.md).

Fuentes externas de referencia:

- [ChatGPT Work y Codex](https://help.openai.com/en/articles/20001275/)
- [AnythingLLM](https://anythingllm.com/)
- [Obsidian — plugins](https://obsidian.md/help/plugins)
- [Open Source Definition](https://opensource.org/osd)

Este documento define la estrategia comercial y de comunicación de Dome. No sustituye al canon de producto ni es un plan de ingeniería.

## Decisión estratégica

Dome no debe venderse como una suite de productividad, un “segundo cerebro” o un chat local con documentos.

Debe venderse como:

> Un espacio de trabajo local-first que conecta los documentos de un profesional con las personas a las que tiene que dar seguimiento.

La demostración central es siempre la misma:

```text
documento o recurso → persona con contexto → borrador de acción → aprobación humana
```

Ese flujo es más defendible y más fácil de entender que una lista de módulos. Study y Dev amplían la plataforma, pero no deben competir con Pro por el primer mensaje.

## 1. Cliente inicial

### Segmento prioritario: operadores independientes

El primer público no es “todo founder-creador”. Es:

> Consultores, freelancers, pequeños estudios y creadores de servicios que trabajan con documentación de clientes y necesitan convertirla en seguimientos personalizados.

Características:

- trabajan solos o con un equipo muy pequeño;
- acumulan PDFs, notas, enlaces, propuestas y materiales de clientes;
- mantienen relaciones activas por email y redes;
- necesitan recordar contexto antes de escribir o publicar;
- valoran el control local y aceptan configurar su propio proveedor de IA;
- pueden pagar por ahorro de tiempo, privacidad y continuidad contextual.

### Segmentos secundarios

| Segmento | Encaje | Papel en marketing |
| --- | --- | --- |
| Estudiantes y autodidactas | Biblioteca, flashcards, quizzes | Contenido y edición Study; no hero comercial |
| Builders e indie hackers | GitHub, agentes, automatizaciones | Contenido técnico y edición Dev |
| Equipos comerciales enterprise | Personas y email | No objetivo inicial: requiere colaboración, permisos, soporte y compliance |
| Investigadores académicos | PDFs, citas, aprendizaje | No usar como posicionamiento principal; es un caso secundario |

La regla es simple: la landing vende al segmento prioritario; la documentación y el producto permiten los segmentos secundarios.

## 2. Problema y trabajo que se contrata

### Job-to-be-done

> Cuando tengo que preparar un seguimiento, quiero recuperar rápidamente el documento relevante y el historial de la persona para producir una acción útil, sin entregar toda mi biblioteca a otra plataforma.

### Dolor actual

El usuario combina varias herramientas:

- una carpeta, Notion u Obsidian para documentos;
- ChatGPT, Claude u otro modelo para redactar;
- Gmail, LinkedIn o una herramienta social para enviar;
- memoria, hojas de cálculo o un CRM para recordar a quién contactar.

El problema no es la ausencia de otra herramienta. Es que el contexto se rompe entre cada una.

### Resultado prometido

Dome ayuda a pasar de material disperso a una acción contextualizada:

1. encontrar el recurso correcto;
2. abrir la ficha de la persona;
3. recuperar historial y siguiente paso;
4. preparar un brief, correo o post;
5. pedir aprobación antes de enviar o publicar;
6. conservar el resultado en la biblioteca local.

## 3. Posicionamiento

### Frase de posicionamiento

Para profesionales independientes que trabajan con documentos y relaciones, Dome es un workspace de escritorio local-first que deja a Many usar ambos contextos para preparar acciones relevantes. A diferencia de un chat con archivos, una app de notas o un CRM, Dome conserva la biblioteca y las personas juntas y mantiene al usuario en control de sus datos, modelos y acciones.

### Categoría que conviene usar

En comunicación externa:

> Workspace local-first para documentos, personas y acciones con IA.

En conversación interna:

> Documentos + personas + Many, en tu máquina.

No intentar crear una categoría completamente nueva en el primer contacto. La categoría nueva puede construirse después de que el usuario entienda el caso de uso.

### Diferenciación real

La ventaja no es ninguna capacidad aislada:

| Capacidad | No es suficiente porque… |
| --- | --- |
| Archivos locales | Obsidian y otras herramientas ya ofrecen ownership |
| Chat con documentos | AnythingLLM y productos similares ya cubren ese job |
| Agentes | ChatGPT Work y Codex también producen entregables |
| Personas | Un CRM lo hace mejor en colaboración y pipeline |
| Privacidad | Es una promesa difícil si se usan modelos cloud |

La diferencia defendible es la combinación del contexto y el flujo:

> Many entiende el recurso abierto y la persona relacionada, prepara una acción y espera aprobación.

## 4. Competencia y alternativas

El competidor principal no es una marca concreta: es el stack que el usuario ya tiene y tolera.

| Alternativa | Qué resuelve | Por qué puede ganar | Respuesta de Dome |
| --- | --- | --- | --- |
| ChatGPT Work / Claude / Gemini | Asistencia general y entregables | Cero configuración, marca y modelos fuertes | Contexto persistente de biblioteca + personas, local-first y multi-proveedor |
| Obsidian + plugin de IA | Ownership, notas y grafo | Comunidad, madurez y flexibilidad | Acción contextual sobre personas y canales sin montar el sistema a mano |
| AnythingLLM / Open WebUI | Chat local con documentos | Simplicidad, privacidad y coste | Dome no compite por “preguntar a un PDF”; compite por cerrar el seguimiento |
| Notion AI | Wiki y colaboración | Equipo, bases y trabajo compartido | Dome prioriza material local y relaciones de un operador independiente |
| NotebookLM | Q&A anclado a fuentes | Experiencia simple y síntesis de fuentes | Dome conecta la fuente con una persona y una acción |
| Stack manual | Cualquier combinación de apps | Ya está aprendido y no exige migración | Mostrar cuánto contexto se pierde entre herramientas |

ChatGPT ya puede trabajar con archivos locales en escritorio, por lo que la diferencia no debe formularse como “ellos no tocan tu disco”. La diferencia debe ser persistencia, ownership, relaciones y control del flujo. Los mensajes y el contexto de una tarea pueden seguir almacenándose en la nube según la configuración del servicio.

AnythingLLM también comunica con fuerza su propuesta local, open source y multiplataforma. Obsidian posee un ecosistema amplio de funciones y plugins. No conviene minimizar estas alternativas; conviene escoger un job que no resuelven con la misma continuidad.

## 5. Mensajes por prioridad

### Mensaje principal

> De tus documentos a la acción correcta, con el contexto de la persona delante.

### Tres razones para creerlo

1. **Contexto unido.** Many puede trabajar con un recurso y una persona en el mismo espacio.
2. **Control.** Los datos viven localmente por defecto; el usuario elige proveedor, modelo y conexiones.
3. **Acciones revisables.** Enviar un correo o publicar requiere aprobación.

### Mensajes secundarios

- Study: aprende desde la biblioteca que ya tienes.
- Dev: construye con GitHub y agentes sobre tus documentos.
- Open code: usar una descripción de licencia precisa, una vez resuelto el modelo legal.

### Mensajes que no deben liderar

- “Tu segundo cerebro”.
- “123 herramientas”.
- “Reemplaza todas tus apps”.
- “CRM para equipos”.
- “La IA no sale nunca de tu ordenador”.
- “Más privado que todos los demás”.
- métricas, clientes o testimonios no verificables.

## 6. Prueba y claims

### Claims que pueden publicarse si la implementación sigue siendo la actual

| Claim | Evidencia local | Cómo demostrarlo |
| --- | --- | --- |
| Biblioteca local-first | SQLite, LanceDB y archivos en disco | Vídeo de importación, ruta de datos y ajustes |
| Many usa contexto de recurso y persona | Runtime de agentes, panel Many y módulos People | Demo completa documento → persona → borrador |
| El usuario elige proveedor | OpenAI, Anthropic, Google, Ollama y otros adaptadores | Pantalla de configuración y prueba con Ollama |
| Acciones sensibles requieren aprobación | HITL en email y social | Mostrar la pausa antes del envío |
| Una aplicación, tres ediciones | Catálogo de ediciones y onboarding | Capturas de Pro, Study y Dev con el mismo shell |
| macOS, Windows y Linux | Releases del proyecto | Enlaces a releases actuales, no promesas futuras |

### Claims que necesitan verificación antes de publicar

- precios, créditos y límites;
- estado real de Companion iOS y sync;
- integraciones sociales y permisos de cada proveedor;
- almacenamiento de tokens OAuth;
- analytics opt-in y política de retención;
- disponibilidad de cada modelo y proveedor;
- rendimiento de indexación en bibliotecas grandes.

“Local-first” no equivale a “local-only”. Embeddings, OCR, visión y conversaciones pueden usar un proveedor cloud si el usuario lo configura. La copy debe explicarlo sin letra pequeña engañosa.

## 7. Decisiones de negocio pendientes

### Licencia y uso comercial: bloqueo P0

La licencia actual define el uso comercial de forma amplia y exige permiso previo. Eso entra en tensión directa con vender Dome Pro a profesionales que generan ingresos con él. También hace delicado el claim “open source”: la Open Source Definition exige no restringir el uso por campo de actividad, incluido el comercial.

Antes de publicar la landing hay que elegir una política clara:

1. permitir el uso comercial del cliente y monetizar nube, créditos, soporte o servicios;
2. mantener la restricción y presentar el proyecto como source-available/código público;
3. separar una licencia comunitaria de una licencia comercial explícita.

La landing no debe prometer “gratis para profesionales” mientras la licencia diga lo contrario.

### Producto y planes

Las ediciones (`Pro`, `Study`, `Dev`) son modos de uso de la aplicación. Los planes (`Free`, `Starter`, `Pro`, `Max`) son capas de servicio. El nombre “Pro” en ambos lugares es una fuente evitable de confusión. Renombrar el plan o la edición sería preferible a resolverlo con una nota al pie.

La primera versión comercial debe explicar:

- qué funciona sin cuenta;
- qué funciona con Ollama;
- qué depende de API keys propias;
- qué añade Dome Cloud;
- qué coste tiene cada capa;
- qué está cubierto por la licencia.

## 8. Embudo de marketing

### Conversión principal

```text
contenido o recomendación → landing → descarga → primer recurso importado → primera respuesta de Many → primer borrador aprobado → retorno semanal
```

La descarga es el CTA principal mientras no exista una demo web real. El registro cloud no debe ser una barrera para probar el valor local.

### Momento de activación

El usuario está activado cuando completa:

> Importa un recurso, abre o crea una persona y obtiene de Many un borrador contextualizado que puede aprobar.

No medir el éxito solo por descargas o registros.

### Canales prioritarios

1. **GitHub y comunidad técnica:** releases, changelogs, issues, decisiones de arquitectura y documentación reproducible.
2. **Contenido de workflow:** vídeos cortos de PDF → persona → email/post, sin claims abstractos.
3. **Comunidades de creadores y consultores:** casos de seguimiento, privacidad y biblioteca de trabajo.
4. **Local AI / self-hosting:** Ollama, control de datos y comparación honesta con RAG local.
5. **Contenido de producto:** Study y Dev como vías de entrada secundarias.

No invertir primero en anuncios amplios. La categoría todavía necesita educación y prueba de producto; el aprendizaje cualitativo vale más que el volumen inicial.

## 9. Plan de validación de 90 días

### Días 0–30: mensaje y verdad del producto

- Resolver licencia, “open source” y uso comercial.
- Elegir el segmento inicial y entrevistar a 8–12 personas.
- Grabar tres demos del flujo central.
- Verificar cada claim contra una superficie real del producto.
- Publicar una landing mínima con un único CTA.

### Días 31–60: activación

- Medir importación, indexación, primera pregunta y primer borrador.
- Probar dos mensajes: “documentos + personas” frente a “contexto local para acciones”.
- Publicar semanalmente un workflow real.
- Recoger objeciones de instalación, configuración de modelos y privacidad.
- Sustituir historias ilustrativas por primeros casos autorizados.

### Días 61–90: conversión

- Activar precios solo con Provider, límites y soporte listos.
- Probar Free frente a una propuesta de pago sencilla.
- Crear una página específica para Study y otra para Dev.
- Construir una biblioteca pública de workflows y plantillas.
- Decidir si la expansión debe ir hacia más canales, colaboración o profundidad del loop Pro.

## 10. Métricas

| Etapa | Métrica principal | Señal saludable |
| --- | --- | --- |
| Descubrimiento | Visitas cualificadas / fuente | El usuario llega por un workflow concreto |
| Instalación | Descarga → primer arranque | La instalación no bloquea |
| Activación | Primer recurso indexado | Entiende cómo alimentar la biblioteca |
| Valor | Primer borrador contextualizado | Ve diferencia frente a un chat genérico |
| Confianza | Acción aprobada / borrador | Many produce algo que el usuario sí usaría |
| Retención | Semanas con al menos un workflow | Dome entra en el trabajo habitual |
| Monetización | Activados que pagan | Pagan por créditos, sync o servicios, no por una promesa abstracta |

## 11. Riesgos y respuestas

| Riesgo | Respuesta |
| --- | --- |
| ChatGPT añade más acceso local | Defender biblioteca persistente, relaciones y control; no negar sus capacidades |
| Obsidian tiene más ecosistema | Vender workflow operativo, no notas |
| AnythingLLM es más simple | No competir por Q&A de PDF |
| Tres ediciones confunden | Una landing Pro; Study y Dev como rutas secundarias |
| Social/API cambia | Mostrar aprobación, borradores y canales opcionales; no prometer automatización universal |
| Privacidad no es absoluta | Explicar local-first, proveedor elegido y qué datos salen |
| Falta prueba social | Usar demos reproducibles y casos propios hasta tener clientes |
| Licencia confusa | Resolver legalmente antes de campaña o pricing |

## Criterio de éxito

La estrategia funciona si una persona del segmento inicial puede repetir, sin explicación del fundador, este recorrido:

> “Importé un documento, abrí una persona, Many entendió el contexto y me preparó un seguimiento que yo aprobé.”

Si la landing comunica Study, Dev, Social, GitHub, precios y privacidad pero no hace evidente ese recorrido, la estrategia está fallando aunque el diseño sea atractivo.
