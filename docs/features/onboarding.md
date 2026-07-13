# Onboarding Feature

Documentation for Dome's first-run onboarding: account gate (when `VITE_ENABLE_DOME_PROVIDER=true`), profile, role, AI setup, completion flag, and init check. Lives in `app/components/onboarding/`, `app/lib/settings/index.ts`, and `electron/core/init.cjs`.

---

## Interfaces

### MartinOnboarding (`app/components/onboarding/MartinOnboarding.tsx`)

```ts
interface MartinOnboardingProps {
  initialName?: string;
  initialEmail?: string;
  onComplete: (data: { name: string; email: string; roleId: RoleId; freeText: string }) => void;
  onSkip: () => void;
}

type Step = 'account' | 'welcome' | 'profile' | 'role' | 'ai';
```

### OnboardingStep

- Full-screen two-column layout: brand panel (Many + message + progress dots) on the left; form content + footer on the right.
- On narrow viewports the brand panel collapses; message appears in a mobile header.
- Reusable step wrapper with `DomeButton` footer (back / continue).
- Props: `stepIndex`, `totalSteps` for progress indicators.

### Completion

- **Flag**: settings key `onboarding_completed` = 'true' | 'false'. Persisted via `db.setSetting` (`app/lib/settings`: `setOnboardingCompleted(true)`).
- **Check**: `init:check-onboarding` (IPC) returns whether onboarding is completed; app shows onboarding fullscreen overlay on Home when not completed.
- **Skip path**: when a returning Dome user logs in and remote `onboarding_completed` was synced (`alreadyOnboarded` from `domeauth:nativeLogin`), the wizard ends immediately via `onSkip()` without re-running profile/role/AI steps.

---

## Design patterns

- **Linear flow** (with Dome provider enabled): account → welcome → profile → role → ai. Without `VITE_ENABLE_DOME_PROVIDER`, account step is omitted.
- **Account gate** (only when `DOME_PROVIDER_ENABLED`): three explicit choices — log in, create account, or continue locally. Login and register are separate screens (`steps/account/`).
- **Profile data**: Collected in profile step; passed to `onComplete` after AI step saves.
- **AI step**: Optional skip; Dome provider saved without OAuth (connect later in Settings → AI).
- **Shared AI UI**: Provider picker and config blocks live in `app/components/settings/ai/` and match `AISettingsPanel`.

---

## Data flow

1. App start → `init:initialize` → if `needsOnboarding` → show fullscreen `Onboarding` on Home.
2. With Dome provider: account (login/register/local) → welcome → profile → role → AI (configure or skip) → `onComplete` → `applyOnboardingConfig`, close overlay.
3. Returning user login with synced `onboarding_completed=true` → `onSkip` → `completeOnboarding` only, close overlay.

---

## Environment gating

All Dome account / native login UI is shown only when `VITE_ENABLE_DOME_PROVIDER=true` (`DOME_PROVIDER_ENABLED` in `app/lib/ai/provider-options.ts`). When disabled, the wizard starts at welcome and never offers Dome account options (consistent with AI provider selection).

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
| `app/components/onboarding/Onboarding.tsx` | Fullscreen portal host, `onComplete` / `onSkip` |
| `app/components/onboarding/MartinOnboarding.tsx` | Step state machine, Dome gating |
| `app/components/onboarding/OnboardingStep.tsx` | Full-screen step layout |
| `app/components/onboarding/steps/AccountStep.tsx` | Account gate orchestrator |
| `app/components/onboarding/steps/account/AccountChoiceView.tsx` | Login / register / local choice |
| `app/components/onboarding/steps/account/DomeLoginView.tsx` | Dome login form |
| `app/components/onboarding/steps/account/DomeRegisterView.tsx` | Dome registration form |
| `app/components/onboarding/steps/ProfileStep.tsx` | Profile form |
| `app/components/onboarding/steps/RoleStep.tsx` | Role preset picker |
| `app/components/onboarding/steps/AISetupStep.tsx` | AI config (shared components) |
| `app/lib/onboarding/applyOnboardingConfig.ts` | Post-wizard orchestrator |
| `electron/auth/dome-native-login.cjs` | Native login + `alreadyOnboarded` |
| `app/lib/settings/index.ts` | `isOnboardingCompleted()`, `setOnboardingCompleted()` |
| `electron/core/init.cjs` | `init:check-onboarding` |
