# SOP: Feature Flags

Dome uses PostHog feature flags for controlled rollouts and A/B testing.

## Naming Convention

All flags must be prefixed with `dome-`:

- `dome-cloud-ai` — cloud AI proxy via dome-provider
- `dome-new-onboarding` — new onboarding flow
- `dome-experimental-editor` — experimental editor features

## Using a Feature Flag in Code

### Hook (for conditional logic)

```typescript
import { useFeatureFlag } from '@/lib/analytics';

function MyComponent() {
  const isEnabled = useFeatureFlag('dome-my-feature');

  if (!isEnabled) return null; // or render the old version
  return <NewFeature />;
}
```

### Gate component (for replacing a whole section)

```typescript
import { FeatureFlagGate } from '@/components/analytics/FeatureFlagGate';

function MyPage() {
  return (
    <FeatureFlagGate flag="dome-my-feature" fallback={<OldVersion />}>
      <NewVersion />
    </FeatureFlagGate>
  );
}
```

### Without the hook (imperative)

```typescript
import { posthog } from '@/lib/analytics/posthog';

const isEnabled = posthog.isFeatureEnabled('dome-my-feature');
```

## Rollout Process

1. **Create flag** in PostHog dashboard → Feature Flags → New Flag
2. **Enable for team** (100% of internal users/test devices)
3. **Verify** everything works with flag on
4. **Gradual rollout**: 10% → 25% → 50% → 100%
5. **Kill switch**: Toggle flag off instantly if issues arise (no deploy needed)
6. **Full release**: Once stable, remove flag gate from code and delete flag from PostHog

## When a flag catches a bug

If an error in Sentry/PostHog is correlated with a feature flag:
1. Disable the flag immediately in PostHog dashboard (instant kill, no deploy)
2. Open a bug report with the Sentry error link
3. Fix the underlying issue before re-enabling
