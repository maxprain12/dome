import { create } from 'zustand';
import type { UserProfile } from '@/types';
import { getUserProfile, saveUserProfile } from '../settings';

interface UserState {
  // User profile data
  name: string;
  email: string;
  /** Base64 data URL for avatar (data:image/...) - Legacy, read-only for display */
  avatarData?: string;
  /** Relative path to avatar file (e.g., "avatars/user-avatar-123.jpg") - Read-only for display */
  avatarPath?: string;
  /** Account photo URL from Dome Provider. Synced across devices. */
  avatarUrl?: string;

  // Actions
  loadUserProfile: () => Promise<void>;
  updateUserProfile: (data: Partial<UserProfile>) => Promise<void>;
}

export const useUserStore = create<UserState>((set) => ({
  // Initial state
  name: '',
  email: '',
  avatarData: undefined,
  avatarPath: undefined,
  avatarUrl: undefined,

  // Load user profile from database
  loadUserProfile: async () => {
    const profile = await getUserProfile();

    set({
      name: profile.name,
      email: profile.email,
      avatarData: profile.avatarData,
      avatarPath: profile.avatarPath,
      avatarUrl: profile.avatarUrl,
    });

    const remote = await window.electron?.domeAuth?.getProfile?.();
    if (remote?.success && remote.imageUrl) {
      await saveUserProfile({ avatarUrl: remote.imageUrl });
      set({ avatarUrl: remote.imageUrl });
    }
  },

  // Update user profile (partial update)
  updateUserProfile: async (data) => {
    await saveUserProfile(data);

    set((state) => ({
      ...state,
      ...data,
    }));
  },
}));
