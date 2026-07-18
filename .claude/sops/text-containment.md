# Text containment — no escaped / clipped copy

SOP for labels, titles, badges, and timestamps in dense UI (cards, rows, toolbars, chips). Follow this whenever text sits in a fixed-width or flex/grid child.

## Rule

**Visible text must stay inside its box.** If it cannot fit, clamp with ellipsis and expose the full value via `title` (or a Tooltip). Never let long relative times, filenames, or badges push siblings out of the layout or paint outside the card.

## Checklist

1. **Parent chain has `min-w-0`** — every flex/grid item from the column down to the text node. Without this, `truncate` / `line-clamp` do nothing (`min-width: auto`).
2. **Use `SafeText` / `MetaLine`** — `app/components/shared/SafeText.tsx` instead of ad-hoc `truncate` without a tooltip.
3. **Dense timestamps use the short form** — `formatShortDistance` / `formatRelativePair` from `app/lib/utils/formatting.ts`. Put the long phrase (`hace menos de un minuto`) only in `title`, never as the visible label in a card meta row.
4. **Previews clip their plane** — covers use `overflow: hidden` + fixed aspect ratio; markdown/snippet/table thumbs pad the bottom so caption/footer is not covered by unclipped glyphs.
5. **Badges shrink first** — `min-w-0 flex-1` on the badge side; time/count stays readable (`formatShortDistance`).

## Preferred building blocks

```tsx
import { SafeText, MetaLine } from '@/components/shared/SafeText';
import { formatRelativePair } from '@/lib/utils/formatting';

const { short, full } = formatRelativePair(resource.updated_at);

<SafeText as="h3" lines={2} title={resource.title}>
  {resource.title}
</SafeText>

<MetaLine
  leading={<Badge variant="secondary" className="max-w-full truncate">{typeLabel}</Badge>}
  trailing={short}
  trailingTitle={full}
/>
```

## Anti-patterns

| Don't | Do |
|-------|-----|
| `formatDistanceToNow(..., { addSuffix: true })` as visible meta in a narrow card | `formatShortDistance` visible + long form in `title` |
| `white-space: nowrap` on a flex child without `min-w-0` / truncate | `SafeText` or `truncate` + `min-w-0` |
| Fixed `width` text boxes that clip mid-word with no tooltip | Clamp + `title` / Tooltip |
| Letting preview text paint over the caption | `overflow: hidden` on cover + bottom padding / scrim |

## Where this already applies

- Folder explorer cards: `app/components/shell/folder-tab/FolderCard.tsx`
- Shared helpers: `SafeText`, `MetaLine`, `formatShortDistance`, `formatRelativePair`

Reuse the same helpers in list rows, hub cards, command palette rows, and studio queues so containment stays consistent.
