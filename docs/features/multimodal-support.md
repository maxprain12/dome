# Multimodal support (vision + video)

Dome routes multimodal content through two paths:

| Path | Surfaces | Format |
|------|----------|--------|
| **Cloud LLM** | OCR, PDF transcription, `image_describe`, PDF region stream | Native content blocks via `electron/llm-service.cjs` |
| **Agent chat** | Many panel, Agent chat | Structured `attachments` on user messages → `electron/message-multimodal.cjs` |

## Provider matrix

| Provider | Cloud vision | Agent image | Agent video | Notes |
|----------|-------------|-------------|-------------|-------|
| OpenAI | Yes | Yes | No | `image_url` blocks |
| Anthropic | Yes | Yes | No | Anthropic image blocks |
| Google | Yes | Yes | No | Via LangChain |
| OpenRouter | Yes | Yes | No | Model-dependent |
| Ollama | Yes (VL models) | Yes | No | e.g. llava, minicpm-v |
| MiniMax M3 | Yes | Yes | Yes | Anthropic-compatible API |
| MiniMax M2.x | No | No (UI guard) | No | Text + tools only |
| Dome provider | Partial | No | No | Proxy accepts string content only |

## MiniMax M-series

- Runtime: `ChatAnthropic` → `https://api.minimax.io/anthropic`
- **MiniMax-M3**: text, image, video, tools, thinking (1M context)
- **M2.7 / M2.5 / highspeed**: text + tools only — no image/video input

Video limits (M3):

- Inline base64/URL: up to ~50 MB
- Larger files: upload via `minimax:files:upload` (`purpose=video_understanding`) → reference as `mm_file://{file_id}`

## Validation

```bash
# Smoke all configured providers (requires keys in .env)
node scripts/smoke/vision-providers.mjs

# Single provider
node scripts/smoke/vision-providers.mjs --provider minimax --model MiniMax-M3

# Unit tests
node scripts/test-message-multimodal.mjs
```

## Key modules

- `shared/message-visual/parse-markdown-images.cjs` — parse `![alt](url)` from composer markdown
- `electron/message-multimodal.cjs` — capability lookup, block building, validation
- `electron/ipc/minimax-files.cjs` — MiniMax Files API upload for large videos

## Known limitations

- **Dome provider proxy** (`dome-provider/lib/proxy.ts`) does not forward multimodal arrays; LangGraph with `dome` provider strips image blocks via `domeFetch`.
- Chat history stores markdown attachments for display; native blocks are built only at invoke time.
