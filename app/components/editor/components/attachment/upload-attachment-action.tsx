import { Editor } from "@tiptap/core";

const MAX_ATTACHMENT_SIZE = 100 * 1024 * 1024; // 100MB

export async function uploadAttachmentAction(
  file: File,
  editor: Editor,
  pos: number,
  _noteId: string,
) {
  // Skip images and videos (handled by their own actions)
  if (file.type.includes("image/") || file.type.includes("video/")) return;
  if (file.size > MAX_ATTACHMENT_SIZE) return;

  try {
    const electron = (window as any).electron;
    const filePath = electron?.getPathForFile?.(file);

    if (filePath && electron?.resource?.import) {
      const projectId = (window as any).__domeCurrentProjectId || "default";
      const result = await electron.resource.import(
        filePath,
        projectId,
        "url",
        file.name,
      );

      const resourceId =
        result?.success && result.data?.id
          ? result.data.id
          : result?.error === "duplicate" && result.duplicate?.id
          ? result.duplicate.id
          : null;

      if (resourceId) {
        // Store as dome-resource://RESOURCE_ID/FILENAME for the attachment view
        editor.commands.setAttachment({
          url: `dome-resource://${resourceId}/${file.name}`,
          name: file.name,
          mime: file.type || "application/octet-stream",
          size: file.size,
          attachmentId: resourceId,
        });
        return;
      }
    }

    // Fallback: insert attachment without url (shows uploading state)
    editor.commands.setAttachment({
      name: file.name,
      mime: file.type || "application/octet-stream",
      size: file.size,
    });
  } catch (err) {
    console.error("[uploadAttachmentAction] Error:", err);
  }
}
