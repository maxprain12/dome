# Plan 012: Settings — bugs críticos + ModelSelector + confirms nativos

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/settings/`

## Status

- **Priority**: P1 | **Effort**: M | **Planned at**: `b500063c`

## Why this matters

Bugs de correctitud y desviaciones shadcn en la superficie settings (38 archivos, alto tráfico).

## Steps

1. **PluginRuntimeModal.tsx:62-66** — mover setState a useEffect([pluginLoadKey])
2. **MCPSettingsPanel.tsx** — rekey envDrafts/headersDrafts/serverTestStatus por `listRowId`; fix duplicate title/subtitle keys
3. **SettingsPanel.tsx:12** — quitar `animate-in fade-in duration-500` o reducir a ≤200ms
4. **ModelSelector.tsx** — reimplementar con Popover + Command; eliminar z-[600] y document click listener
5. **AIEmbeddingsTab, AIWebSearchTab, AISettingsPanel** — catch → showToast error
6. **window.confirm/alert** en AIEmbeddingsTab, AgentContextSettingsTab, AdvancedSettings → AlertDialog + sonner toast
7. **SelectItem** sin SelectGroup — batch en TranscriptionSettingsSections, KbLlmSettingsPanel, MCPSettingsPanel
8. **AISettingsPanel.tsx:467-484** — DropdownMenuGroup wrapper

**Verify**: `pnpm run typecheck` exit 0

## Done criteria

- [ ] MCP test status correcto tras delete server
- [ ] Settings navigation sin fade 500ms
- [ ] 0 window.confirm en settings/
