---
name: dome-simplify
description: Reestructurar Dome desde primeros principios, priorizando eliminar sobre simplificar, optimizar y automatizar. Usar cuando se solicite reducir complejidad o cuestionar una implementación existente; no convierte una revisión de solo lectura en autorización para editar.
---

# Simplificar Dome desde la tarea

Definir en una frase el resultado observable que necesita el usuario y los contratos que deben seguir funcionando. Leer el AGENTS.md, docs/principles.md y las instrucciones del área. Respetar el alcance autorizado: una petición sobre Social y Ajustes no justifica refactorizar todo el repositorio.

## Cuestionar antes de implementar

1. ¿Qué parte es innecesaria, demasiado compleja o depende de una suposición débil? Buscar evidencia en consumidores, rutas de entrada, pruebas, persistencia y estados de la UI.
2. ¿Qué se puede eliminar por completo? Candidatos: información repetida, acciones duplicadas dentro del mismo recorrido, estado derivable y pasos sin una decisión real. Que existan dos entradas no prueba duplicación: pueden servir contextos distintos.
3. Después de quitar lo innecesario, ¿qué se puede expresar de forma más directa? Preferir los componentes y utilidades existentes a nuevas capas.

Para eliminar una función o dato, rastrear referencias y contratos, incluidos IPC, herramientas de agentes, deep links, alias, preferencias guardadas y migraciones. No confundir «no visible» con «no usado». Eliminar UI redundante no autoriza borrar datos, romper compatibilidad o retirar capacidades.

Optimizar únicamente con un problema observable de rendimiento. Automatizar únicamente cuando el proceso restante esté justificado y dentro del encargo. No añadir infraestructura para demostrar que se hizo trabajo.

## Revisar el resultado, no defenderlo

Volver a recorrer la tarea: ¿menos pasos o decisiones sin mayor dificultad para encontrar opciones? ¿El usuario conserva su contexto? ¿Se añadió más estructura que la que se quitó? Revisar especialmente menús secundarios, controles deshabilitados y estados que dicen «guardado» antes de persistir.

Eliminar también las nuevas abstracciones o adornos que no pasen estas preguntas. Si la solución actual es clara y correcta, dejarla intacta y explicar por qué. No imponer una cuota de líneas borradas.

Para cambios no triviales, registrar en docs/plans/active/ evidencia → decisión → comportamiento esperado, incluyendo lo conservado y las hipótesis pendientes. Validar con pruebas de comportamiento pertinentes y los controles del AGENTS.md; no escribir pruebas que simplemente reflejen la estructura del código.

La entrega debe decir qué se eliminó o simplificó, por qué, qué se verificó y qué sigue sin verificar. No declarar completada una revisión integral cuando solo se inspeccionó un área.
