import { create } from 'zustand';
import type { UserProfile } from '@/types';
import {
  getUserProfile,
  saveUserProfile,
  setUserAvatar,
  setUserAvatarPath,
  isOnboardingCompleted,
  setOnboardingCompleted,
} from '../settings';

interface UserState {
  // User profile data
  name: string;
  email: string;
  /** Base64 data URL for avatar (data:image/...) - Legacy */
  avatarData?: string;
  /** Relative path to avatar file (e.g., "avatars/user-avatar-123.jpg") - New */
  avatarPath?: string;
  isOnboardingCompleted: boolean;

  // Actions
  loadUserProfile: () => Promise<void>;
  updateUserProfile: (data: Partial<UserProfile>) => Promise<void>;
  /** Set avatar as base64 data URL - Legacy method */
  setAvatar: (dataUrl: string | null) => Promise<void>;
  /** Set avatar as relative path - New method */
  setAvatarPath: (avatarPath: string | null) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
}

export const useUserStore = create<UserState>((set) => ({
  // Initial state
  name: '',
  email: '',
  avatarData: undefined,
  avatarPath: undefined,
  isOnboardingCompleted: false,

  // Load user profile from database
  loadUserProfile: async () => {
    const profile = await getUserProfile();
    const onboardingComplete = await isOnboardingCompleted();

    set({
      name: profile.name,
      email: profile.email,
      avatarData: profile.avatarData,
      avatarPath: profile.avatarPath,
      isOnboardingCompleted: onboardingComplete,
    });
  },

  // Update user profile (partial update)
  updateUserProfile: async (data) => {
    await saveUserProfile(data);

    set((state) => ({
      ...state,
      ...data,
    }));
  },

  // Set user avatar (base64 data URL) - Legacy method
  setAvatar: async (dataUrl) => {
    await setUserAvatar(dataUrl);

    set({
      avatarData: dataUrl || undefined,
    });
  },

  // Set user avatar (relative path) - New method
  setAvatarPath: async (avatarPath) => {
    await setUserAvatarPath(avatarPath);

    set({
      avatarPath: avatarPath || undefined,
    });
  },

  // Complete onboarding
  completeOnboarding: async () => {
    await setOnboardingCompleted(true);

    set({
      isOnboardingCompleted: true,
    });
  },

  // Reset onboarding (for re-running the wizard)
  resetOnboarding: async () => {
    await setOnboardingCompleted(false);

    set({
      isOnboardingCompleted: false,
    });
  },
}));

