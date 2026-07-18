# Markdown surfaces — render descriptions well

SOP for any **description / release notes / issue body** that is markdown (or may contain GFM). Do not dump raw strings with `whitespace-pre-wrap`.

## Rule

**Use `MarkdownBody`** (`app/components/shared/MarkdownBody.tsx`) for read-only markdown outside chat. Chat messages keep using `MarkdownRenderer` directly (citations, dome links, etc.).

## Checklist

1. **Never plain `<p>{description}</p>`** for content that may include markdown, lists, or code fences.
2. **`MarkdownBody`** with `surface` (default) so the block is separated from chrome/badges.
3. **`compact`** (default) applies `.typeset-compact` — smaller type for modals and panels.
4. **GitHub-hosted images** → `githubImageProxy` (or keep using `GithubMarkdownBody`).
5. **Scroll** → put `max-h-* overflow-y-auto` on the `MarkdownBody` `className` (wrapper), not inside chat bubbles.
6. **Width** → body uses `max-w-none` so typeset’s `max-w-[42em]` does not leave an empty strip in wide modals.
7. **Containment** → still follow [text-containment.md](./text-containment.md) for titles/meta beside the body.

## Preferred usage

```tsx
import { MarkdownBody } from '@/components/shared/MarkdownBody';
// or: import GithubMarkdownBody from '@/components/github/GithubMarkdownBody';

<MarkdownBody
  content={event.description ?? ''}
  className="max-h-[min(40vh,360px)] overflow-y-auto"
/>

{/* GitHub release / issue bodies */}
<GithubMarkdownBody
  content={markdownBody}
  className="max-h-[min(40vh,360px)] overflow-y-auto"
/>
```

## Building blocks

| Piece | Role |
|-------|------|
| `MarkdownBody` | Surface + compact typeset + MarkdownRenderer |
| `GithubMarkdownBody` | Same + GitHub image URL normalization / proxy |
| `MarkdownRenderer` | Low-level renderer (chat, citations, dome://) |
| `.typeset` / `.typeset-docs` / `.typeset-compact` | Typography tokens in `app/typeset.css` + `app/globals.css` |

## Anti-patterns

| Don't | Do |
|-------|-----|
| `whitespace-pre-wrap` on release notes | `MarkdownBody` |
| Nested `prose prose-sm` + hand-rolled styles | `typeset` via MarkdownBody |
| Putting `max-w-[42em]` constraints on modal bodies | `max-w-none` (built into MarkdownBody) |
| Raw `<img src="https://github…">` in sync’d bodies | `githubImageProxy` |
