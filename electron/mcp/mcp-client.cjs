function mcpCacheKey(serverIds) {
  if (!serverIds || serverIds.length === 0) return '__all__';
  return [...serverIds]
    .map((id) => String(id).trim().toLowerCase())
    .sort((a, b) => a.localeCompare(b))
    .join('|');
}