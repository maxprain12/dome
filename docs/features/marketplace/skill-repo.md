# Crear un Repositorio de Skill para Dome

Los skills son extensiones que dotan a los agentes de capacidades especializadas. Se basan en el formato skills.sh y se publican en el marketplace leyendo desde un archivo JSON público.

## Estructura del Repositorio

```
mi-skill-dome/
├── SKILL.md           # Obligatorio - Definición del skill
├── skill.json        # Opcional - Metadatos adicionales
├── README.md         # Opcional - Documentación extra
└── examples/         # Opcional - Ejemplos de uso
```

## SKILL.md (Obligatorio)

El archivo `SKILL.md` es el archivo principal que define tu skill. Usa el formato de Markdown con una estructura específica:

```markdown
---
name: Nombre del Skill
description: Descripción breve de lo que hace el skill
---

# Nombre del Skill

Descripción detallada de las capacidades del skill, casos de uso y cómo funciona.

## Cuando Usar

Explica cuándo y cómo usar este skill.

## Uso

```bash
# Ejemplo de comando o uso
```

## Configuración

Opciones de configuración si las hay.
```

## skill.json (Opcional)

Metadatos adicionales para el marketplace:

```json
{
  "id": "mi-skill-nombre",
  "name": "Nombre del Skill",
  "description": "Descripción breve",
  "author": "Tu Nombre",
  "version": "1.0.0",
  "tags": ["development", "testing"],
  "category": "development",
  "installs": 0,
  "repo": "tu-usuario/mi-skill-dome"
}
```

## Ejemplo Completo: SKILL.md

```markdown
---
name: Code Review Expert
description: Realiza code reviews exhaustivos con análisis de seguridad y performance
---

# Code Review Expert

Este skill proporciona capacidades avanzadas de revisión de código para agentes de IA.

## Capacidades

- Análisis estático de código
- Detección de vulnerabilidades de seguridad
- Identificación de problemas de performance
- Sugerencias de refactoring
- Verificación de buenas prácticas

## Cuando Usar

Usa este skill cuando:
- Necesites revisar código de pull requests
- Quieras detectar bugs antes de producción
- Requieras análisis de seguridad
- Busques optimizaciones de performance

## Uso en Agentes

Añade `"code-review-expert"` a los `skillIds` del agente:

```json
{
  "skillIds": ["code-review-expert"],
  "systemInstructions": "Eres un experto en code review..."
}
```

## Reglas de Revisión

El skill aplica las siguientes reglas automáticamente:

1. **Seguridad**: Detecta inyecciones, credenciales hardcoded, vulnerabilidades OWASP
2. **Performance**: Identifica bucles anidados, consultas N+1, memoria excesiva
3. **Mantenibilidad**: Verifica naming, documentación, complejidad ciclomática
4. **Testing**: Sugiere casos de prueba faltantes

## Configuración

```json
{
  "severityThreshold": "high",
  "includePerformance": true,
  "includeSecurity": true,
  "maxComplexity": 10
}
```

## Ejemplos

### Revisión de Pull Request

```
Agent: Revisa este código para el PR #123

Skill: Analiza el diff, identifica 3 issues de seguridad,
sugiere 5 mejoras de performance y propone refactoring.
```

---

**Autor**: Tu Nombre  
**Versión**: 1.0.0  
**Etiquetas**: code-review, security, performance, development
```

## Formato skills.json (para marketplace)

```json
{
  "id": "code-review-expert",
  "name": "Code Review Expert",
  "author": "Tu Nombre",
  "description": "Realiza code reviews exhaustivos con análisis de seguridad y performance",
  "repo": "tu-usuario/dome-skill-code-review",
  "version": "1.0.0",
  "tags": ["code-review", "security", "performance", "development"],
  "category": "development",
  "installs": 0
}
```

## Añadir al Marketplace

Para que tu skill aparezca en el marketplace de Dome, añade la entrada al archivo `skills.json` público:

```json
[
  {
    "id": "mi-skill-id",
    "name": "Mi Skill",
    "author": "tu-usuario",
    "description": "Descripción del skill",
    "repo": "tu-usuario/mi-skill-dome"
  }
]
```

## Mejores Prácticas

1. **Nombre descriptivo**: Usa nombres que expliquen qué hace el skill
2. **Descripción clara**: Explica el valor que aporta en 1-2 oraciones
3. **Tags relevantes**: Añade tags que ayuden a encontrar el skill
4. **Ejemplos**: Include ejemplos concretos de uso
5. **Mantenlo focalizado**: Un skill debe hacer una cosa bien

## Repo de Ejemplo

Ver repositorio de ejemplo: [dome-skill-example](https://github.com/tu-usuario/dome-skill-example)

## Más Información

- **Skills CLI**: https://skills.sh/
- **Explorar skills**: https://skills.sh/explore
