# Plan 017: Many — panel width animation + UICursorOverlay perf

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/many/ManyPanel.tsx app/components/many/UICursorOverlay.tsx app/globals.css`

## Status

- **Priority**: P2 | **Effort**: M | **Depends on**: 001 | **Planned at**: `b500063c`

## Why this matters

ManyPanel anima `width` (layout thrash). UICursorOverlay usa rAF infinito y globals.css anima `left`/`top` con transition-all.

## Steps

1. **ManyPanel.tsx:476-484** — cambiar width transition a `transform: translateX` off-screen o toggle sin animating width; usar `transition-[transform,opacity] duration-200 var(--ease-out)`
2. **UICursorOverlay.tsx:37-58** — rAF solo cuando posición cambia >0.5px; cancel on unmount
3. **globals.css:1088-1114** — `.dome-ui-cursor-*` usar `transform: translate()` not left/top; no transition-all
4. **ManyFloatingTrigger.tsx:44-49** — quitar `animate-pulse` en thinking; usar dot estático o opacity toggle
5. **ManyComposerRichInput.tsx** — considerar Tooltip shadcn vs portal (opcional si tiempo)

**Verify**: toggle Many panel sin jank en DevTools Performance

## Done criteria

- [ ] ManyPanel no anima width
- [ ] UICursorOverlay rAF idle cuando cursor quieto
- [ ] globals cursor CSS sin left/top transitions
