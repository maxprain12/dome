# Plan 015: Learn — migrar lr-modal y empty states a Dialog + Empty

> **Drift check**: `git diff --stat b500063c..HEAD -- app/components/learn/ app/styles/learn.css`

## Status

- **Priority**: P1 | **Effort**: L | **Depends on**: 004 | **Planned at**: `b500063c`

## Why this matters

Learn mantiene design system paralelo `lr-*`: modales `<dialog class="lr-modal">`, empty custom, Select sin SelectGroup.

## Steps

1. DeckEditor, GenerateWizard, DeckQuestionsTab — `<dialog lr-modal>` → `Dialog` + `DialogTitle` (sr-only si hace falta)
2. LearnEmptyState, LearnViewerEmpty, FlashPlayer empty → `Empty` components
3. DeckEditor SelectContent — wrap SelectItem in SelectGroup
4. Fix GenerateWizard useEffect sin deps (`:83-95`)
5. DeckOverview async — cancelled flag en effects
6. DeckQuestionsTab — catch con showToast

**Out of scope (plan 016):** learn.css transition-all masivo

**Verify**: abrir/cerrar GenerateWizard con Escape; focus trap OK

## Done criteria

- [ ] 0 `<dialog className="lr-modal"` en learn/
- [ ] Empty states usan ui/empty
- [ ] GenerateWizard listener deps correctas
