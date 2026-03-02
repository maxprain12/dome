// Copyright (c) 2025 Dome contributors. MIT License.
// Minimal shared-storage extension — provides a typed shared storage slot
// on the editor instance used by other extensions.
import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Storage {
    shared: Record<string, any>;
  }
}

export const SharedStorage = Extension.create({
  name: "shared",
  addStorage() {
    return {};
  },
});
