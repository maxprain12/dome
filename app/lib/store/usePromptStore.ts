import { create } from 'zustand';

interface PromptState {
  isOpen: boolean;
  title: string;
  message: string;
  defaultValue: string;
  resolve: ((value: string | null) => void) | null;
}

interface PromptStore extends PromptState {
  showPrompt: (message: string, defaultValue?: string) => Promise<string | null>;
  handleSubmit: (value: string) => void;
  handleCancel: () => void;
  reset: () => void;
}

const initialState: PromptState = {
  isOpen: false,
  title: 'Entrada',
  message: '',
  defaultValue: '',
  resolve: null,
};

export const usePromptStore = create<PromptStore>((set, get) => ({
  ...initialState,

  showPrompt: (message: string, defaultValue = '') => {
    return new Promise<string | null>((resolve) => {
      set({
        isOpen: true,
        message,
        defaultValue,
        resolve,
      });
    });
  },

  handleSubmit: (value: string) => {
    const { resolve } = get();
    if (resolve) {
      resolve(value);
    }
    set(initialState);
  },

  handleCancel: () => {
    const { resolve } = get();
    if (resolve) {
      resolve(null);
    }
    set(initialState);
  },

  reset: () => {
    set(initialState);
  },
}));

/**
 * Helper function to show a prompt dialog
 * Works in both Electron (via modal) and browser (via window.prompt fallback)
 */
export async function showPrompt(message: string, defaultValue = ''): Promise<string | null> {
  // Check if we're in Electron environment where window.prompt doesn't work
  if (typeof window !== 'undefined' && window.electron) {
    return usePromptStore.getState().showPrompt(message, defaultValue);
  }
  
  // Fallback to window.prompt for browser environments
  if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
    try {
      return window.prompt(message, defaultValue);
    } catch {
      // If prompt fails, use our custom implementation
      return usePromptStore.getState().showPrompt(message, defaultValue);
    }
  }
  
  return null;
}
