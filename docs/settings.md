# Settings Feature

Documentation for Dome's settings: layout, panels (General, Appearance, AI, WhatsApp, Advanced), persistence via SQLite, and renderer API. Lives in `app/settings/`, `app/components/settings/`, `app/lib/settings/`, and `electron/database.cjs` (settings table).

---

## Interfaces

### Settings section (`app/components/settings/SettingsLayout.tsx`)

```ts
type SettingsSection = 'general' | 'appearance' | 'ai' | 'whatsapp' | 'advanced';

interface SettingsLayoutProps {
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  children: React.ReactNode;
}
```

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

### App preferences (`app/types/index.ts`, `app/lib/settings/index.ts`)

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

### AI config (`app/lib/settings/index.ts`, `app/lib/ai/client.ts`)

- Stored in settings table: ai_provider, ai_api_key, ai_model, ai_embedding_model, ai_base_url, ollama_*, ai_auth_mode, ai_oauth_token, venice_privacy_mode. See docs/ai-chat.md and getAIConfig/saveAIConfig in lib/settings.

---

## Design patterns

### Layout

- **Settings page** (`app/settings/page.tsx`): useState(activeSection); loadUserProfile + loadPreferences on mount; SettingsLayout sidebar + renderSection (GeneralSettings | AppearanceSettings | AISettingsPanel | WhatsAppSettingsPanel | AdvancedSettings).
- **SettingsLayout**: Sidebar with section buttons (general, appearance, ai, whatsapp, advanced); children = current panel content.
- **Panels**: Each panel reads/writes via useUserStore, useAppStore, or direct get/save from app/lib/settings and db; theme also via window.electron.getTheme/setTheme and IPC theme-changed.

### Persistence

- **Storage**: All in SQLite `settings` table (key, value, updated_at). Renderer uses db.getSetting(key) and db.setSetting(key, value) (IPC).
- **Profile**: getUserProfile / saveUserProfile (user_name, user_email, user_avatar_data, user_avatar_path). Avatar file copy via window.electron.avatar.copyFile (main process).
- **Preferences**: getAppPreferences / saveAppPreferences (app_theme, app_auto_save, app_auto_backup, app_citation_style, app_shortcuts). Theme applied via setTheme and IPC; useAppStore holds theme, citationStyle, autoSave, autoBackup, loadPreferences, updateTheme, updateCitationStyle, updatePreferences.
- **AI**: getAIConfig / saveAIConfig (all ai_* and ollama_* keys); used by AI client and AISettingsPanel.
- **Onboarding**: onboarding_completed (true/false); see docs/onboarding.md.

### Theme

- **Get/set**: window.electron.getTheme(), window.electron.setTheme(theme). Main process reads/writes app_theme and applies to all windows; emits theme-changed.
- **AppearanceSettings**: Theme selector (light/dark/auto); calls updateTheme from useAppStore (which calls setTheme and saveAppPreferences).

---

## Data flow

- **Open settings**: Navigate to /settings or window:open-settings → Settings page mounts → loadUserProfile, loadPreferences → panels read from stores/settings.
- **Change section**: onSectionChange(activeSection) → setState → renderSection() switches panel.
- **Save (e.g. General)**: User edits name/email/avatar → saveUserProfile or setUserAvatarPath → db.setSetting(...) via IPC.
- **Save (Appearance)**: updateTheme(theme) → setTheme(theme) IPC + saveAppPreferences({ theme }).
- **Save (AI)**: saveAIConfig(config) → db.setSetting for each key; AISettingsPanel may also call getAIConfig on load.
- **Save (WhatsApp/Advanced)**: Panel-specific; may use db.settings or other IPC.

---

## Functionality

- **General**: User name, email, avatar (select file → copy to dome-files/avatars via IPC, set user_avatar_path).
- **Appearance**: Theme (light/dark/auto); applied app-wide via IPC theme.
- **AI**: Provider, API key, model, embedding model, base URL, Ollama options, Anthropic auth mode, Venice privacy; see docs/ai-chat.md.
- **WhatsApp**: Status, start/stop, allowlist; see docs/whatsapp.md.
- **Advanced**: Storage usage, cleanup, migration, citation style, shortcuts, etc.

---

## Key files

| Path | Role |
|------|------|
| `app/settings/page.tsx` | Settings page; activeSection; loadUserProfile, loadPreferences; SettingsLayout + renderSection |
| `app/settings/layout.tsx` | Layout wrapper for /settings |
| `app/components/settings/SettingsLayout.tsx` | Sidebar (sections) + children |
| `app/components/settings/GeneralSettings.tsx` | Name, email, avatar |
| `app/components/settings/AppearanceSettings.tsx` | Theme |
| `app/components/settings/AISettingsPanel.tsx` | AI provider and options |
| `app/components/settings/WhatsAppSettingsPanel.tsx` | WhatsApp status and config |
| `app/components/settings/AdvancedSettings.tsx` | Storage, migration, citation, shortcuts |
| `app/lib/settings/index.ts` | getUserProfile, saveUserProfile, getAppPreferences, saveAppPreferences, getAIConfig, saveAIConfig, isOnboardingCompleted, setOnboardingCompleted, setTheme, setCitationStyle |
| `app/lib/store/useAppStore.ts` | theme, citationStyle, autoSave, autoBackup, loadPreferences, updateTheme, updateCitationStyle, updatePreferences |
| `app/lib/store/useUserStore.ts` | User profile state, loadUserProfile, saveUserProfile |
| `electron/main.cjs` | get-theme, set-theme, theme-changed; db:settings:get/set |
| `electron/preload.cjs` | getTheme, setTheme, onThemeChanged |
