import { expect, it } from 'vitest';
import { createManyToolsForContext } from './index';
import { filterToolsForAgentMode } from '@/lib/many/agentMode';

it('Many offers native search and browser schemas only when web tools are enabled', () => {
  const tools = createManyToolsForContext('/', { includeWeb: true });
  for (const name of ['web_search', 'browser_open_in_dome', 'browser_read_page', 'browser_tabs', 'browser_navigate']) {
    expect(tools.find(tool => tool.name === name)).toBeDefined();
  }
  expect(tools.find(tool => tool.name === 'browser_open_in_dome')?.parameters.properties).toHaveProperty('url');
  expect(createManyToolsForContext('/', { includeWeb: false }).some(tool => tool.name === 'browser_read_page')).toBe(false);
  const plan = filterToolsForAgentMode(tools, 'plan');
  expect(plan.some(tool => tool.name === 'browser_read_page')).toBe(true);
  expect(plan.some(tool => tool.name === 'browser_fill')).toBe(false);
});
