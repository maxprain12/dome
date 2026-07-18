# Settings Feature

Documentation for Dome's settings: Codex-style shell, typed registry (7 groups), lazy sections, persistence via SQLite, and renderer API. Lives in `app/pages/SettingsPage.tsx`, `app/components/settings/`, `app/lib/settings/`, and the SQLite `settings` table.

---

## Architecture

### Shell + registry

Settings is a **shell mode**, not a nested rail inside the workspace:

- While the `settings` tab is active, [`AppShell`](../../app/components/shell/AppShell.tsx) swaps [`UnifiedSidebar`](../../app/components/workspace/UnifiedSidebar.tsx) for [`SettingsNav`](../../app/components/settings/SettingsNav.tsx) (back to app + search + section groups). Many is unavailable (panel collapsed, TitleBar toggle hidden); the user’s Many-open preference is left untouched.
- **`SettingsPage`** (`app/pages/SettingsPage.tsx`): resolves `?section=`, listens to IPC `settings:navigate-to-section` and `dome:goto-settings-section`, syncs `hiddenSections` / `activeSection` into [`useSettingsUiStore`](../../app/lib/store/useSettingsUiStore.ts), hides `dome_sync` without cloud entitlements, lazy-loads the active section inside `SettingsShell`.
- **`SettingsNav`**: left-shell navigation (`w-62`, same slot as UnifiedSidebar). «Back to application» closes the settings tab.
- **`SettingsShell`** (`app/components/settings/SettingsShell.tsx`): content-only frame (`max-w-2xl`); Select fallback when the left sidebar is collapsed.
- **`registry.tsx`**: single source of truth for section ids, groups, icons (Hugeicons), keywords, legacy aliases, and lazy components under `sections/`.
- **Blocks**: `SettingsSurface` / `SettingsGroup` / `SettingsRow` are aliases of `HubSurface` / `HubGroup` / `HubRow` from `@/components/hub` (see plan 001).

### Section ids (public contract)

Deep links and events address these ids (legacy alias `transcription` → `ai`):

`general` · `appearance` · `language` · `ai` · `cloud` · `dome_sync` · `calendar` · `email` · `social` · `mcp` · `dome_mcp` · `skills` · `plugins` · `features` · `indexing` · `kb_llm` · `advanced`

### Nav groups (7)

1. Account — general  
2. Appearance & language — appearance, language  
3. AI — ai (includes transcription UI inside AI section)  
4. Integrations — cloud, dome_sync, calendar, email, social  
5. Automation & extensions — mcp, dome_mcp, skills, plugins  
6. Data & privacy — features, indexing, kb_llm  
7. System — advanced  

### User profile (`app/types/index.ts`, `app/lib/settings/index.ts`)

```ts
interface UserProfile {
  name: string;
  email: string;
  avatarData?: string;   // Base64 data URL (legacy)
  avatarPath?: string;   // Relative path (e.g. avatars/user-avatar-123.jpg)
}

// get/save via db.getSetting/setSetting: user_name, user_email, user_avatar_data, user_avatar_path
```

### App preferences

```ts
interface AppPreferences {
  theme: 'light' | 'dark' | 'auto';
  autoSave: boolean;
  autoBackup: boolean;
  citationStyle: CitationStyle;
  shortcuts?: Record<string, string>;
}

// Keys: app_theme, app_auto_save, app_auto_backup, app_citation_style, app_shortcuts (JSON)
```

### AI config

Stored in settings table: `ai_provider`, `ai_api_key`, `ai_model`, `ai_embedding_model`, `ai_base_url`, `ollama_*`, `venice_privacy_mode`. See ai-chat.md and getAIConfig/saveAIConfig in `app/lib/settings`.

---

## Design patterns

### Layout

- Shell composition in settings mode: `TitleBar` + `SettingsNav` + settings content (no Many column).
- Sections live in `app/components/settings/sections/*Section.tsx` and compose hub blocks + shadcn Field/Switch/Select.
- AI sub-areas (providers, embeddings, web search, agent context, transcription) stay under the `ai` section — not separate nav ids (except legacy alias `transcription`).

### Persistence

- **Storage**: SQLite `settings` table (key, value, updated_at). Renderer uses `db.getSetting` / `db.setSetting` (IPC).
- **Profile / preferences / AI**: via `app/lib/settings` and Zustand (`useUserStore`, `useAppStore`).
- **Theme**: `window.electron.getTheme` / `setTheme`; Appearance section calls `updateTheme`.

---

## Data flow

- **Open settings**: tab/route → Settings page → loadUserProfile + loadPreferences → registry lazy section.
- **Change section**: shell rail / mobile Select / URL / IPC / CustomEvent → `resolveSettingsSection` → setState.
- **Save**: panels write through stores or `db.setSetting` / domain IPC (email, social, MCP, …).

---

## Functionality (by group)

- **General**: name, email, avatar, privacy toggles.
- **Appearance / Language**: theme; locale.
- **AI**: providers, models, embeddings, web search, agent context (SOUL/USER/MEMORY), transcription.
- **Integrations**: cloud storage, Dome Sync, calendar, email accounts, social accounts.
- **Automation & extensions**: MCP servers, Dome MCP, skills, plugins.
- **Data & privacy**: feature flags, indexing, KB LLM.
- **Advanced**: updates, citation style, data/migration tools.

---

## Settings keys reference (sample)

| Key | Type | Description |
|-----|------|-------------|
| `user_name` | string | User display name |
| `user_email` | string | User email |
| `user_avatar_path` | string | Relative path to avatar in dome-files |
| `app_theme` | `light\|dark\|auto` | Application theme |
| `app_auto_save` | bool | Auto-save toggle |
| `app_citation_style` | string | APA, MLA, Chicago, etc. |
| `ai_provider` | string | openai, anthropic, google, ollama, dome, openrouter |
| `ai_api_key` | string | API key for current provider |
| `ai_model` | string | Model ID |
| `ollama_base_url` | string | Ollama server URL |
| `onboarding_completed` | bool | Onboarding flag |
| `analytics_opted_in` | bool | PostHog consent |

---

## Key files

| Path | Role |
|------|------|
| `app/pages/SettingsPage.tsx` | Page; deep links; entitlements; Suspense section |
| `app/components/settings/SettingsShell.tsx` | Codex rail + search + content column |
| `app/components/settings/registry.tsx` | Groups, ids, aliases, lazy components |
| `app/components/settings/blocks.tsx` | Re-exports Hub* as Settings* |
| `app/components/settings/sections/*.tsx` | One section per nav id |
| `app/components/hub/` | Shared Codex surfaces (plan 001) |
| `app/lib/settings/index.ts` | Profile, preferences, AI helpers |
| `app/lib/store/useAppStore.ts` / `useUserStore.ts` | Client state |
| `electron/preload.cjs` | Theme + settings IPC whitelist |
