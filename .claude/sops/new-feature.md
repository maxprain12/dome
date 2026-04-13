# SOP: New Feature Workflow

## 1. Define

- Write a 2-3 sentence description: what the feature does, which user need it solves
- Identify which process(es) are affected: renderer only, main only, or both
- Identify which IPC domains need changes (if any)
- List the files to create/modify

## 2. Gate behind feature flag (for anything experimental)

```typescript
// PostHog feature flag — see sops/feature-flags.md
<FeatureFlagGate flag="dome-my-feature">
  <MyNewFeature />
</FeatureFlagGate>
```

## 3. Implement

- **Renderer-only** (UI state, display logic): code goes in `app/`
- **Needs Node.js/file system/DB**: create IPC handler first (see `new-ipc-channel.md`), then call from renderer
- Follow `pr-checklist.md` throughout

## 4. i18n

Add translation keys to all 4 language objects in `app/lib/i18n.ts`:

```typescript
// en
'my_feature.title': 'My Feature',
// es
'my_feature.title': 'Mi Función',
// fr
'my_feature.title': 'Ma Fonctionnalité',
// pt
'my_feature.title': 'Minha Funcionalidade',
```

## 5. Test locally

```bash
bun run dev           # Renderer only
bun run electron:dev  # Full app (main + renderer)
```

- Test the golden path
- Test error states (what happens if the IPC call fails?)
- Test both light and dark theme
- Test with analytics disabled (PostHog not initialized)

## 6. PR

- Run `pr-checklist.md` before opening the PR
- Feature flag can be enabled for the team first, then gradual rollout via PostHog dashboard
