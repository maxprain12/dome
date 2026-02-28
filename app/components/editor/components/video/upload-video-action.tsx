import { Editor } from "@tiptap/core";

const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200MB

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function uploadVideoAction(
  file: File,
  editor: Editor,
  pos: number,
  _noteId: string,
) {
  if (!file.type.includes("video/")) return;
  if (file.size > MAX_VIDEO_SIZE) return;

  try {
    const electron = (window as any).electron;
    const filePath = electron?.getPathForFile?.(file);

    if (filePath && electron?.resource?.import) {
      const projectId = (window as any).__domeCurrentProjectId || "default";
      const result = await electron.resource.import(
        filePath,
        projectId,
        "video",
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
          editor.chain().setVideoAt({ pos, src: fileResult.data }).run();
          return;
        }
      }
    }

    // Fallback: read as base64 data URL directly
    const dataUrl = await readFileAsDataUrl(file);
    editor.chain().setVideoAt({ pos, src: dataUrl }).run();
  } catch (err) {
    console.error("[uploadVideoAction] Error:", err);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      editor.chain().setVideoAt({ pos, src: dataUrl }).run();
    } catch {
      // ignore
    }
  }
}
