import { atom } from "jotai";

export const draftCommentIdAtom = atom<string | null>(null);
export const showCommentPopupAtom = atom<boolean>(false);
export const activeCommentIdAtom = atom<string | null>(null);
