import { atom } from "jotai";

interface WorkspaceSettings {
  ai?: { generative?: boolean };
}

interface Workspace {
  settings?: WorkspaceSettings;
}

export const workspaceAtom = atom<Workspace | null>(null);
export const currentUserAtom = atom<null>(null);
