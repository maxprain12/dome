import { useUserStore } from '@/lib/store/useUserStore';

export interface AccountIdentity {
  name?: string | null;
  email?: string | null;
}

/** Persist only explicit identity. Never replace workspace modes or restored AI settings. */
export async function completeWelcome(identity?: AccountIdentity): Promise<void> {
  const user = useUserStore.getState();
  if (identity) {
    await user.updateUserProfile({
      ...(identity.name?.trim() ? { name: identity.name.trim() } : {}),
      ...(identity.email?.trim() ? { email: identity.email.trim() } : {}),
    });
  }
  await user.completeOnboarding();
}
