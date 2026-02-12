# Dome AI Prompts

Prompts externos organizados por caso de uso para facilitar la iteración y mejora.

## Estructura por caso de uso

| Carpeta | Uso | Consumidor |
|---------|-----|------------|
| **martin/** | Asistente Many (chat principal) | `app/lib/ai/client.ts`, AIChatTab |
| **martin/floating-base.txt** | Many en botón flotante global | MartinFloatingButton |
| **martin/capabilities.txt** | Capacidades (personality-loader) | `electron/personality-loader.cjs` |
| **editor/** | Asistente de edición inline en notas | `app/lib/ai/editor-ai.ts` |
| **studio/** | Generación de materiales de estudio | `app/lib/hooks/useStudioGenerate.ts` |
| **whatsapp/** | Many en contexto WhatsApp | `electron/whatsapp/message-handler.cjs` |

## Archivos y placeholders

### martin/base.txt
- `{{location}}` - Workspace, Home, WhatsApp
- `{{dateTimeSection}}` - Bloque fecha/hora (o vacío)
- `{{resourceTitleLine}}` - Línea "Active resource: X" (o vacío)

### martin/floating-base.txt
- `{{location}}`, `{{description}}`, `{{date}}`, `{{time}}`
- `{{resourceTitleLine}}`, `{{whatsappSuffix}}`

### martin/resource-context.txt
- `{{resourceTypeLine}}`, `{{resourceSummarySection}}`
- `{{resourceContentSection}}`, `{{resourceTranscriptionSection}}`

### editor/system.txt
- `{{contextSnippet}}` - Fragmento del documento para contexto

### whatsapp/base.txt
- `{{contextSection}}` - Contexto dinámico (proyecto, recursos, fecha/hora)

## Cómo editar

1. Modifica el archivo `.txt` correspondiente al caso de uso.
2. Los cambios se aplican en el próximo build (renderer) o al reiniciar (main process).
3. No hace falta tocar código para iterar en el contenido de los prompts.
