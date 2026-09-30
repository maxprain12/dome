---
name: dome-cognitive-ux
description: Revisar y mejorar flujos de Dome con Fitts, Hick, Zeigarnik, Jakob, Goal Gradient, Von Restorff y Miller. Usar para reestructuras UX, navegación, formularios y recuperación de trabajo; no para cambios puramente visuales o auditorías de seguridad.
---

# UX cognitiva en Dome

Partir de la tarea que la persona quiere completar, no de una ley que haya que demostrar. Delimitar las superficies solicitadas; revisar Social y Ajustes no equivale a certificar todo Dome.

## Evidencia antes de cambios

Leer el AGENTS.md y los principios actuales del repositorio. Seguir el recorrido desde la entrada hasta el resultado, incluyendo teclado, ventana estrecha, estado vacío, error y vuelta a trabajo pendiente. Leer componentes, estados y pruebas; cuando sea posible, observar la interfaz con un perfil aislado (`DOME_PROFILE`, ver `docs/architecture/worktree-isolation.md`). No publicar, conectar cuentas reales ni modificar datos personales para validar una revisión.

Para cada hallazgo indicar tarea, evidencia concreta (ruta/estado observado), coste para el usuario y cambio mínimo. Separar observaciones de hipótesis: sin telemetría o investigación no afirmar qué funciones son las más usadas. Si una reorganización oculta destinos, demostrar cómo siguen siendo encontrables y cómo se muestra la ubicación actual.

## Siete criterios, no siete funciones nuevas

| Principio | Pregunta útil | Aplicación y límite |
| --- | --- | --- |
| Fitts | ¿El objetivo es fácil de alcanzar y distinguir de sus vecinos? | Revisar el área clicable real, cercanía y foco. En controles frecuentes de escritorio, 36 px puede ser una referencia de diseño; no es un umbral universal ni una certificación de accesibilidad. |
| Hick | ¿Cuántas decisiones irrelevantes exige esta tarea? | Quitar duplicados y agrupar por tarea; revelar opciones especializadas cuando hacen falta. No ocultar acciones esenciales detrás de menús solo para reducir un contador. |
| Zeigarnik | ¿Se puede reconocer y retomar trabajo pendiente? | Distinguir sin guardar, guardando, guardado y error. Conservar borradores y contexto donde el flujo lo requiera. No afirmar autosave si solo hay estado en memoria ni introducir presión artificial. |
| Jakob | ¿Los controles cumplen las expectativas del producto? | Reutilizar shadcn/Base UI, formularios, Enter, Escape, foco y navegación existentes. Mantener IDs públicos y enlaces directos. No cambiar convenciones solo para parecer original. |
| Goal Gradient | ¿La persona conoce el siguiente paso real y el final? | Usar pasos o progreso solo si corresponden a trabajo medible. Confirmar éxito tras persistencia. Sin porcentajes inventados, onboarding obligatorio ni gamificación añadida por defecto. |
| Von Restorff | ¿Destaca lo que necesita una decisión ahora? | Reservar énfasis para la acción principal y errores relevantes. Eliminar tarjetas/contadores repetidos antes de añadir colores. No usar solo color para transmitir estado. |
| Miller | ¿La interfaz evita recordar información entre pasos? | Grupos semánticos, etiquetas reconocibles, contexto visible y búsqueda tolerante. «7 ± 2» no es un límite universal de pestañas, menús o campos. |

Estas heurísticas generan hipótesis de diseño, no garantizan resultados. Referencia: [Laws of UX](https://lawsofux.com/); consultar cada ley si una decisión depende de sus detalles.

## Entrega y comprobación

Preferir eliminar → simplificar → optimizar → automatizar. Conservar lo que ya funciona, incluso si ninguna modificación queda justificada. No añadir dependencias, checklists permanentes, estilos nuevos ni una abstracción general para una corrección local.

En Dome: renderer sin Node; textos en en/es/fr/pt; tokens de color existentes; contratos IPC, IDs de sección, alias y filtros conservados. Leer las implementaciones locales de los componentes antes de componerlos.

Probar comportamientos alterados: teclado y foco, rutas existentes, selección activa, filtros al abrir pendientes, éxito/error al guardar y tamaños reales en ventana estrecha. Ejecutar los controles exigidos por el AGENTS.md. Distinguir pruebas automatizadas, inspección visual e hipótesis no probadas con usuarios.

Entregar cambios, eliminaciones, elementos conservados, evidencia de validación y límites de alcance. «Sin cambios: el flujo ya resuelve la tarea» es un resultado válido.
