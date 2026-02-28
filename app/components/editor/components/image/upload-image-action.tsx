import { Editor } from "@tiptap/core";

const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function uploadImageAction(
  file: File,
  editor: Editor,
  pos: number,
  _noteId: string,
) {
  if (!file.type.includes("image/")) return;
  if (file.size > MAX_IMAGE_SIZE) return;

  try {
    const electron = (window as any).electron;
    const filePath = electron?.getPathForFile?.(file);

    if (filePath && electron?.resource?.import) {
      const projectId = (window as any).__domeCurrentProjectId || "default";
      const result = await electron.resource.import(
        filePath,
        projectId,
        "image",
        file.name,
      );

      const resourceId =
        result?.success && result.data?.id
          ? result.data.id
          : result?.error === "duplicate" && result.duplicate?.id
          ? result.duplicate.id
          : null;

      if (resourceId) {
        const fileResult = await electron.resource.readFile(resourceId);
        if (fileResult?.success && fileResult.data) {
          editor.chain().setImageAt({ pos, src: fileResult.data }).run();
          return;
        }
      }
    }

    // Fallback: read as base64 data URL directly
    const dataUrl = await readFileAsDataUrl(file);
    editor.chain().setImageAt({ pos, src: dataUrl }).run();
  } catch (err) {
    console.error("[uploadImageAction] Error:", err);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      editor.chain().setImageAt({ pos, src: dataUrl }).run();
    } catch {
      // ignore
    }
  }
}
