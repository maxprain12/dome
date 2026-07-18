import type { parseTreeToolSummary } from '@/lib/chat/treeToolSummary';

export function renderTreeToolSummary(
  summary: ReturnType<typeof parseTreeToolSummary>,
  t: (key: string, opts?: { defaultValue?: string }) => string,
) {
  if (!summary) return null;
  return (
    <div className="tool-tree-summary">
      {summary.path ? (
        <div>
          <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{t('chat.tree_tool_path', { defaultValue: 'Ruta' })}: </span>
          <span style={{ wordBreak: 'break-all' }}>{summary.path}</span>
        </div>
      ) : null}
      {summary.shown != null ? (
        <div>
          <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{t('chat.tree_tool_entries', { defaultValue: 'Entradas' })}: </span>
          {summary.shown}
          {summary.truncated ? ` (${t('chat.tree_tool_truncated', { defaultValue: 'truncado' })})` : ''}
        </div>
      ) : null}
      {summary.max_depth != null ? (
        <div>
          <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{t('chat.tree_tool_depth', { defaultValue: 'Profundidad' })}: </span>
          {summary.max_depth}
        </div>
      ) : null}
      {summary.node_count != null ? (
        <div>
          <span style={{ fontWeight: 600, color: 'var(--foreground)' }}>{t('chat.tree_tool_nodes', { defaultValue: 'Nodos' })}: </span>
          {summary.node_count}
        </div>
      ) : null}
      <p style={{ margin: 0, opacity: 0.85 }}>
        {t('chat.tree_tool_hint', {
          defaultValue: 'Usa file_list o file_tree acotado en lugar de directory_tree en carpetas grandes.',
        })}
      </p>
    </div>
  );
}
