export async function transcribeAudioBlob(blob: Blob): Promise<{ success: true; text: string } | { success: false; error: string }> {
  if (!window.electron?.transcription?.bufferToText) {
    return { success: false, error: 'Transcripción no disponible' };
  }
  const buf = await blob.arrayBuffer();
  const type = blob.type || '';
  const ext = type.includes('webm') ? 'webm' : type.includes('mp4') ? 'm4a' : 'webm';
  const result = await window.electron.transcription.bufferToText({ buffer: buf, extension: ext });
  if (!result.success || !result.text?.trim()) {
    return { success: false, error: result.error || 'Transcripción vacía' };
  }
  return { success: true, text: result.text.trim() };
}
