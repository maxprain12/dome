# Plan 018: Agent-canvas — PropertiesPanel FieldGroup + Empty state

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/agent-canvas/`

## Status

- **Priority**: P2 | **Effort**: M | **Planned at**: `b500063c`

## Why this matters

agent-canvas/ casi sin shadcn (solo Button, Select en 2/18 archivos). PropertiesPanel y empty state hand-rolled.

## Steps

1. **PropertiesPanel.tsx** — FieldGroup + Field + FieldLabel + Input/Textarea/Select; delete button → Button variant="destructive"
2. Reemplazar `space-y-*` por `gap-*` en PropertiesPanel, palettes, ExecutionLog, AgentNode
3. **AgentCanvasEmptyState.tsx** → Empty + EmptyHeader + Button CTA
4. **AddMenu.tsx:56** — hex shadow → token shadow class

**Verify**: editar propiedades nodo agente; focus visible en inputs

## Done criteria

- [ ] PropertiesPanel usa FieldGroup
- [ ] AgentCanvasEmptyState usa Empty
- [ ] 0 space-y en PropertiesPanel
