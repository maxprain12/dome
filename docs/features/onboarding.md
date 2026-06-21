# Onboarding Feature

Documentation for Dome's first-run onboarding: steps (Welcome, Profile, AI), completion flag, and init check. Lives in `app/components/onboarding/`, `app/lib/settings/index.ts`, and `electron/core/init.cjs`.

---

## Interfaces

### ManyOnboarding (`app/components/onboarding/ManyOnboarding.tsx`)

```ts
interface ManyOnboardingProps {
  initialName?: string;
  initialEmail?: string;
  onComplete: (data: { name: string; email: string }) => void;
}

type Step = 'welcome' | 'profile' | 'ai';
```

### OnboardingStep

- Reusable step wrapper: Many avatar + message bubble, `DomeButton` footer (back / continue).
- **Welcome**: `ManyAvatar` + intro message; Next → profile.
- **ProfileStep**: Name + email via `DomeInput`; `onboarding:validate` event; `canProceedProfile`.
- **AISetupStep**: Shared `AIProviderSelection`, `AICloudProviderConfig`, `AIOllamaProviderConfig`; skip allowed; Dome saves without OAuth; `onValidationChange` drives Finalizar button.

### Completion

- **Flag**: settings key `onboarding_completed` = 'true' | 'false'. Persisted via `db.setSetting` (`app/lib/settings`: `setOnboardingCompleted(true)`).
- **Check**: `init:check-onboarding` (IPC) returns whether onboarding is completed; app shows onboarding modal on Home or main app accordingly.

---

## Design patterns

- **Linear flow**: welcome → profile → ai. Back: profile←welcome, ai←profile.
- **Profile data**: Collected in profile step; passed to `onComplete` after AI step saves.
- **AI step**: Optional skip; Dome provider saved without OAuth (connect later in Settings → AI).
- **Shared AI UI**: Provider picker and config blocks live in `app/components/settings/ai/` and match `AISettingsPanel`.

---

## Data flow

1. App start → `init:check-onboarding` → if not completed → show `Onboarding` modal on Home.
2. Welcome → profile → AI (configure or skip) → `onComplete(profileData)` → `updateUserProfile`, `completeOnboarding`, close modal.

---

## Related onboarding wizards

| Wizard | Path | Notes |
|--------|------|-------|
| Agent create/edit | `app/components/agents/AgentOnboarding.tsx` | Dome* shell, step progress circles |
| Agent team create | `app/components/agent-team/AgentTeamOnboarding.tsx` | i18n step labels, `--dome-*` tokens |

---

## Key files

| Path | Role |
|------|------|
| `app/components/onboarding/ManyOnboarding.tsx` | Step state machine |
| `app/components/onboarding/OnboardingStep.tsx` | Step wrapper |
| `app/components/onboarding/steps/ProfileStep.tsx` | Profile form |
| `app/components/onboarding/steps/AISetupStep.tsx` | AI config (shared components) |
| `app/components/settings/ai/AIProviderSelection.tsx` | Provider grid (Settings + onboarding) |
| `app/lib/settings/index.ts` | `isOnboardingCompleted()`, `setOnboardingCompleted()` |
| `electron/core/init.cjs` | `init:check-onboarding` |
