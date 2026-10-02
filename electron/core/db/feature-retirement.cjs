'use strict';

function tableColumns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info("${table}")`).all().map((column) => column.name));
}
function stripToolSelections(value, retired) {
  if (Array.isArray(value)) return value.filter((entry) => typeof entry !== 'string' || !retired.has(entry)).map((entry) => stripToolSelections(entry, retired));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, stripToolSelections(entry, retired)]));
  return value;
}
/** Retire selections and dependent schedules while retaining resources and run history. */
function retireTools(db, names, { legacySource } = {}) {
  const retired = new Set(names);
  const depends = (text) => names.some((name) => String(text || '').includes(name));
  const affected = new Set();
  for (const table of ['many_agents', 'canvas_workflows']) {
    const columns = tableColumns(db, table);
    if (!columns.has('id')) continue;
    for (const row of db.prepare(`SELECT * FROM "${table}"`).all()) {
      if (depends(JSON.stringify(row))) affected.add(`${table === 'many_agents' ? 'agent' : 'workflow'}:${row.id}`);
    }
  }
  const automationColumns = tableColumns(db, 'automation_definitions');
  if (automationColumns.has('enabled')) {
    for (const row of db.prepare('SELECT * FROM automation_definitions').all()) {
      if (!depends(row.input_template_json) && !affected.has(`${row.target_type}:${row.target_id}`) && !(legacySource && row.legacy_source === legacySource)) continue;
      const reason = `Dome disabled this automation because it uses retired tools: ${names.join(', ')}.`;
      db.prepare('UPDATE automation_definitions SET enabled = 0, description = ?, updated_at = ? WHERE id = ?')
        .run([row.description, reason].filter(Boolean).join('\n\n'), Date.now(), row.id);
    }
  }
  for (const table of ['many_agents', 'many_agent_versions', 'chat_sessions', 'canvas_workflows', 'automation_definitions']) {
    const columns = tableColumns(db, table);
    for (const column of ['tool_ids', 'tools_json', 'enabled_tool_ids_json', 'input_template_json', 'definition_json', 'nodes_json']) {
      if (!columns.has(column) || !columns.has('id')) continue;
      for (const row of db.prepare(`SELECT id, "${column}" AS value FROM "${table}" WHERE "${column}" IS NOT NULL`).all()) {
        let parsed; try { parsed = JSON.parse(row.value); } catch { continue; }
        const next = JSON.stringify(stripToolSelections(parsed, retired));
        if (next !== JSON.stringify(parsed)) db.prepare(`UPDATE "${table}" SET "${column}" = ? WHERE id = ?`).run(next, row.id);
      }
    }
  }
  for (const row of db.prepare('SELECT key, value FROM settings').all()) {
    if (!/tool/i.test(row.key)) continue;
    let parsed; try { parsed = JSON.parse(row.value); } catch { continue; }
    const next = JSON.stringify(stripToolSelections(parsed, retired));
    if (next !== JSON.stringify(parsed)) db.prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?').run(next, Date.now(), row.key);
  }
}
module.exports = { retireTools };
