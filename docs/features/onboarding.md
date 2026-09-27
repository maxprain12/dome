# Welcome and section onboarding

First run opens a standalone welcome screen with account creation, sign-in, language selection and a local entry option. It does not require AI credentials, an edition choice, OS permissions, personality files or bundled skills. Those are configured where they are used.

## Account and completion

`AccountForm` is shared by first run and Settings → General → Account and access. It submits through the existing native authentication IPC. Registration validates name, email and an eight-character password; login accepts an existing nonempty password. Pending email confirmation stays on screen with a route back to sign-in. Passwords stay in component memory and are cleared after authentication or changing form mode.

`completeWelcome` saves explicit account identity, then marks onboarding complete. Failed persistence leaves the screen open and offers a retry without repeating authentication. Local entry saves only the completion flag. Restored editions, AI settings, skills, memory and personality files are untouched. Existing completed profiles do not repeat onboarding.

`Onboarding` hosts the screen outside the app root and makes the underlying shell inert while it is visible. `HomePage` does not mount its dashboard until completion.

## Section introductions

`sectionGuides.ts` maps the main tab destinations to 21 short guides. Related reader tabs share the library guide; learning tabs share the learning guide. Plugin content supplies its own onboarding.

`ContentRouter` provides a getting-started screen inside each section, following the supplied visual reference: one illustrated primary card with a three-step checklist, two secondary explanation cards and a cloud-access card. Each step explains a concrete action and links to an existing section or settings destination. The account card reflects verified server permissions; local explanations are never artificially locked.

Users can mark explanations as read, act on a step, or immediately explore the section. Read progress and dismissal persist in `section_tours_dismissed`; a compact “Getting started” button reopens the screen. Read progress never claims that a real task was completed. The underlying section remains mounted and hidden while the guide is open, preserving unsaved work. Failed persistence keeps the guide visible with an error. There are no timed popups. Settings keeps the guide available on demand so deep links to account, AI and integrations open directly.

## Access model

See [account-access.md](../product/account-access.md). Workspace editions organize tools; account tiers control cloud access. The account screen is independent of the optional Dome AI provider flag.

## Verification

Renderer tests cover registration, email confirmation, local entry, save retry, legacy login passwords, guide dismissal/reopen and all sidebar destinations in en/es/fr/pt. Main-process tests cover capability decisions, explicit feature denials, account cache isolation, logout during fetch, and network recovery.
