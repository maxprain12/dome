/** Strip markdown/noise for OpenAI TTS input */
export function stripForTts(text: string): string {
  return (
    text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]+`/g, ' ')
      .replace(/\[[^\]]*]\([^)]*\)/g, '$1')
      .replace(/\*\*?|__/g, '')
      .replace(/^#+\s+/gm, '')
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, 4096)
  );
}
