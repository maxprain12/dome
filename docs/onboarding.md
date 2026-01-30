# Onboarding Feature

Documentation for Dome's first-run onboarding: steps (Welcome, Profile, AI), completion flag, and init check. Lives in `app/components/onboarding/`, `app/lib/settings/index.ts`, and `electron/init.cjs`.

---

## Interfaces

### MartinOnboarding (`app/components/onboarding/MartinOnboarding.tsx`)

```ts
interface MartinOnboardingProps {
  initialName?: string;
  initialEmail?: string;
  initialAvatarPath?: string;
  onComplete: (data: { name: string; email: string; avatarPath?: string }) => void;
}

type Step = 'welcome' | 'profile' | 'ai' | 'complete';
// State: currentStep, profileData, canProceedProfile
// Steps: welcome → profile → ai → complete (onComplete(profileData) after AI step)
```

### OnboardingStep

- Reusable step wrapper: message (Many text), optional back, children (form or actions).
- WelcomeStep: Welcome message + "Next" → profile.
- ProfileStep: Name, email, avatar (select file); onComplete(profileData); canProceedProfile for validation.
- AISetupStep: AI provider/config (can skip); onComplete() → parent calls onComplete(profileData).

### Completion

- **Flag**: settings key `onboarding_completed` = 'true' | 'false'. Persisted via db.setSetting (app/lib/settings: setOnboardingCompleted(true)).
- **Check**: init:check-onboarding (IPC) returns whether onboarding is completed; app shows onboarding UI or home accordingly.

---

## Design patterns

- **Linear flow**: welcome → profile → ai → complete. Back goes profile←welcome, ai←profile.
- **Profile data**: Collected in profile step; passed to onComplete only after AI step (so final save includes name, email, avatarPath).
- **AI step**: Optional; user can skip and configure later in settings. onComplete still called so onboarding is marked done.
- **Init**: On app load, main or renderer calls init:check-onboarding; if not completed, render onboarding (MartinOnboarding); onComplete → saveUserProfile, setOnboardingCompleted(true), then switch to main app (e.g. home).

---

## Data flow

- **App start**: init:initialize or init:check-onboarding → if !onboarding_completed → show MartinOnboarding.
- **Welcome**: User clicks Next → setCurrentStep('profile').
- **Profile**: User fills name, email, optional avatar; Next → handleProfileComplete(data) → setProfileData(data), setCurrentStep('ai').
- **AI**: User configures or skips; Complete → handleAIComplete() → onComplete(profileData) → parent saves profile (saveUserProfile), setOnboardingCompleted(true), navigate to home.
- **Back**: From profile → welcome; from ai → profile.

---

## Functionality

- **Welcome**: Intro from Many; single Next.
- **Profile**: Name, email (required for canProceedProfile), avatar (select file → avatar:copy or select-avatar IPC → avatarPath).
- **AI**: AISetupStep (same as settings AI panel or simplified); skip allowed.
- **Completion**: Set onboarding_completed = true; save profile; transition to main app.

---

## Key files

| Path | Role |
|------|------|
| `app/components/onboarding/MartinOnboarding.tsx` | Step state; welcome → profile → ai → complete; onComplete(profileData) |
| `app/components/onboarding/OnboardingStep.tsx` | Step wrapper (message, back, children) |
| `app/components/onboarding/WelcomeStep.tsx` | Welcome message + Next |
| `app/components/onboarding/steps/ProfileStep.tsx` | Name, email, avatar form; onComplete |
| `app/components/onboarding/steps/AISetupStep.tsx` | AI config; onComplete (optional skip) |
| `app/lib/settings/index.ts` | isOnboardingCompleted(), setOnboardingCompleted(bool) |
| `electron/init.cjs` | init:initialize, init:check-onboarding; may set default settings |
| `electron/preload.cjs` | init.initialize, init.checkOnboarding, init.getStatus |
